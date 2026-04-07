<?php

namespace App\Services;

use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\ClientStaffTransferRequest;
use App\Models\Department;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ClientStaffTransferService
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_CANCELLED = 'cancelled';

    /** Role không được nhận phụ trách qua phiếu chuyển giao */
    private const EXCLUDED_TARGET_ROLES = ['admin', 'administrator', 'ke_toan'];

    /** Role được chọn làm người nhận (cùng phòng ban) */
    private const ALLOWED_TARGET_ROLES = ['nhan_vien', 'quan_ly'];

    public function pendingForClient(int $clientId): ?ClientStaffTransferRequest
    {
        return ClientStaffTransferRequest::query()
            ->where('client_id', $clientId)
            ->where('status', self::STATUS_PENDING)
            ->with(['fromStaff:id,name,email,role,department_id', 'toStaff:id,name,email,role,department_id', 'requestedBy:id,name,email'])
            ->first();
    }

    /**
     * Danh sách nhân sự có thể chọn làm người nhận: cùng phòng ban khách hàng, không gồm admin/kế toán, trừ người phụ trách hiện tại.
     */
    public function eligibleTargetUsers(Client $client): Collection
    {
        $client->loadMissing(['assignedStaff:id,department_id']);
        $deptId = (int) ($client->assigned_department_id ?? optional($client->assignedStaff)->department_id ?? 0);
        if ($deptId <= 0) {
            return collect();
        }

        $currentStaffId = (int) ($client->assigned_staff_id ?? 0);

        return User::query()
            ->where('department_id', $deptId)
            ->whereIn('role', self::ALLOWED_TARGET_ROLES)
            ->whereNotIn('role', self::EXCLUDED_TARGET_ROLES)
            ->where(function ($q) {
                $q->whereNull('is_active')->orWhere('is_active', true);
            })
            ->when($currentStaffId > 0, function ($q) use ($currentStaffId) {
                $q->where('id', '!=', $currentStaffId);
            })
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role', 'department_id']);
    }

    public function canInitiate(User $user, Client $client): bool
    {
        if (CrmScope::hasGlobalScope($user)) {
            return CrmScope::canAccessClient($user, $client);
        }

        if (CrmScope::canManageClient($user, $client)) {
            return true;
        }

        $sid = (int) ($client->assigned_staff_id ?? 0);
        $oid = (int) ($client->sales_owner_id ?? 0);

        return ($sid > 0 && $sid === (int) $user->id)
            || ($oid > 0 && $oid === (int) $user->id);
    }

    public function canActOnRequest(User $user, ClientStaffTransferRequest $transfer): bool
    {
        if ($transfer->status !== self::STATUS_PENDING) {
            return false;
        }

        if ((int) $transfer->to_staff_id === (int) $user->id) {
            return true;
        }

        if (in_array($user->role, ['admin', 'administrator'], true)) {
            return CrmScope::canAccessClient($user, $transfer->client);
        }

        if ($user->role === 'quan_ly') {
            $transfer->loadMissing('client');
            $client = $transfer->client;

            return CrmScope::canManagerAccessClient($user, $client);
        }

        return false;
    }

    public function canCancelRequest(User $user, ClientStaffTransferRequest $transfer): bool
    {
        if ($transfer->status !== self::STATUS_PENDING) {
            return false;
        }

        if ((int) $transfer->requested_by_user_id === (int) $user->id) {
            return true;
        }

        if ((int) ($transfer->from_staff_id ?? 0) === (int) $user->id) {
            return true;
        }

        if (in_array($user->role, ['admin', 'administrator'], true)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            $transfer->loadMissing('client');

            return CrmScope::canManagerAccessClient($user, $transfer->client);
        }

        return false;
    }

    /**
     * Người xem được phiếu (thông báo): người gửi, người nhận, QL phòng ban, admin.
     */
    public function stakeholderUserIds(ClientStaffTransferRequest $transfer): array
    {
        $transfer->loadMissing('client');
        $client = $transfer->client;
        $deptId = (int) ($client->assigned_department_id ?? 0);

        $ids = collect([
            (int) $transfer->requested_by_user_id,
            (int) ($transfer->from_staff_id ?? 0),
            (int) $transfer->to_staff_id,
        ])->filter(fn ($id) => $id > 0);

        $ids = $ids->merge($this->departmentManagerUserIds($deptId));
        $ids = $ids->merge($this->adminUserIds());

        return $ids->unique()->values()->all();
    }

    public function departmentManagerUserIds(int $departmentId): array
    {
        if ($departmentId <= 0) {
            return [];
        }

        $dept = Department::query()->find($departmentId);
        $ids = collect();
        if ($dept && $dept->manager_id) {
            $ids->push((int) $dept->manager_id);
        }

        $managedBy = User::query()
            ->where('role', 'quan_ly')
            ->whereHas('managedDepartments', function ($q) use ($departmentId) {
                $q->where('departments.id', $departmentId);
            })
            ->pluck('id');

        return $ids->merge($managedBy)->unique()->filter()->values()->all();
    }

    public function adminUserIds(): array
    {
        return User::query()
            ->whereIn('role', ['admin', 'administrator'])
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Gửi thông báo tới các bên liên quan, trừ người thực hiện hành động.
     */
    public function notifyExcept(
        ClientStaffTransferRequest $transfer,
        string $title,
        string $body,
        array $data,
        int $exceptUserId
    ): void {
        $targets = collect($this->stakeholderUserIds($transfer))
            ->filter(fn ($id) => (int) $id !== (int) $exceptUserId && (int) $id > 0)
            ->values()
            ->all();

        if (empty($targets)) {
            return;
        }

        app(NotificationService::class)->notifyUsersAfterResponse($targets, $title, $body, $data);
    }

    public function createRequest(User $actor, Client $client, int $toStaffId, ?string $note): ClientStaffTransferRequest
    {
        if (! $this->canInitiate($actor, $client)) {
            throw new \RuntimeException('Bạn không có quyền tạo phiếu chuyển giao khách hàng này.');
        }

        if ($this->pendingForClient((int) $client->id)) {
            throw new \RuntimeException('Khách hàng đang có phiếu chuyển giao chờ xử lý. Hãy hủy hoặc chờ kết quả trước khi tạo phiếu mới.');
        }

        $fromStaffId = (int) ($client->assigned_staff_id ?? 0);
        if ($fromStaffId <= 0) {
            throw new \RuntimeException('Khách hàng chưa có nhân sự phụ trách để chuyển giao.');
        }

        if ($toStaffId === $fromStaffId) {
            throw new \RuntimeException('Người nhận phải khác nhân sự phụ trách hiện tại.');
        }

        $target = User::query()->find($toStaffId);
        if (! $target) {
            throw new \RuntimeException('Nhân sự nhận không tồn tại.');
        }

        if (in_array($target->role, self::EXCLUDED_TARGET_ROLES, true)
            || ! in_array($target->role, self::ALLOWED_TARGET_ROLES, true)) {
            throw new \RuntimeException('Không thể chuyển phụ trách cho vai trò này.');
        }

        $eligible = $this->eligibleTargetUsers($client);
        if (! $eligible->contains('id', $toStaffId)) {
            throw new \RuntimeException('Người nhận phải cùng phòng ban và thuộc danh sách được phép.');
        }

        $transfer = ClientStaffTransferRequest::create([
            'client_id' => $client->id,
            'from_staff_id' => $fromStaffId,
            'to_staff_id' => $toStaffId,
            'requested_by_user_id' => (int) $actor->id,
            'status' => self::STATUS_PENDING,
            'note' => $note !== null && trim($note) !== '' ? trim($note) : null,
        ]);

        $transfer->load(['client', 'fromStaff', 'toStaff', 'requestedBy']);

        $clientName = trim((string) ($client->name ?: 'Khách hàng'));
        $title = 'Phiếu chuyển phụ trách khách hàng';
        $body = sprintf(
            '%s • Chuyển từ %s sang %s',
            $clientName,
            optional($transfer->fromStaff)->name ?? '—',
            optional($transfer->toStaff)->name ?? '—'
        );

        $payload = $this->notificationPayload($transfer);

        $this->notifyExcept($transfer, $title, $body, $payload, (int) $actor->id);

        return $transfer;
    }

    public function accept(User $actor, ClientStaffTransferRequest $transfer): ClientStaffTransferRequest
    {
        if (! $this->canActOnRequest($actor, $transfer)) {
            throw new \RuntimeException('Bạn không có quyền xác nhận phiếu này.');
        }

        return $this->finalizeAccept($actor, $transfer);
    }

    public function reject(User $actor, ClientStaffTransferRequest $transfer, ?string $rejectionNote): ClientStaffTransferRequest
    {
        if ($transfer->status !== self::STATUS_PENDING) {
            throw new \RuntimeException('Phiếu không còn ở trạng thái chờ.');
        }

        $canReject = (int) $transfer->to_staff_id === (int) $actor->id
            || $this->canActOnRequest($actor, $transfer);

        if (! $canReject) {
            throw new \RuntimeException('Bạn không có quyền từ chối phiếu này.');
        }

        $transfer->update([
            'status' => self::STATUS_REJECTED,
            'rejection_note' => $rejectionNote !== null && trim($rejectionNote) !== '' ? trim($rejectionNote) : null,
            'responded_by_user_id' => (int) $actor->id,
            'responded_at' => now(),
        ]);

        $transfer->load(['client', 'fromStaff', 'toStaff', 'requestedBy']);
        $clientName = trim((string) (optional($transfer->client)->name ?: 'Khách hàng'));
        $title = 'Phiếu chuyển phụ trách bị từ chối';
        $body = sprintf('%s • Từ chối bởi %s', $clientName, $actor->name);

        $this->notifyExcept(
            $transfer,
            $title,
            $body,
            array_merge($this->notificationPayload($transfer), ['action' => 'rejected']),
            (int) $actor->id
        );

        return $transfer->fresh(['client', 'fromStaff', 'toStaff', 'requestedBy']);
    }

    public function cancel(User $actor, ClientStaffTransferRequest $transfer): ClientStaffTransferRequest
    {
        if (! $this->canCancelRequest($actor, $transfer)) {
            throw new \RuntimeException('Bạn không có quyền hủy phiếu này.');
        }

        $transfer->update([
            'status' => self::STATUS_CANCELLED,
            'cancelled_by_user_id' => (int) $actor->id,
            'cancelled_at' => now(),
        ]);

        $transfer->load(['client', 'fromStaff', 'toStaff', 'requestedBy']);
        $clientName = trim((string) (optional($transfer->client)->name ?: 'Khách hàng'));
        $title = 'Phiếu chuyển phụ trách đã hủy';
        $body = sprintf('%s • Hủy bởi %s', $clientName, $actor->name);

        $this->notifyExcept(
            $transfer,
            $title,
            $body,
            array_merge($this->notificationPayload($transfer), ['action' => 'cancelled']),
            (int) $actor->id
        );

        return $transfer->fresh(['client', 'fromStaff', 'toStaff', 'requestedBy']);
    }

    private function finalizeAccept(User $actor, ClientStaffTransferRequest $transfer): ClientStaffTransferRequest
    {
        $transfer->loadMissing('client');
        $client = $transfer->client;
        if (! $client) {
            throw new \RuntimeException('Không tìm thấy khách hàng.');
        }

        $toUser = User::query()->find((int) $transfer->to_staff_id);
        if (! $toUser) {
            throw new \RuntimeException('Nhân sự nhận không tồn tại.');
        }

        return DB::transaction(function () use ($actor, $transfer, $client, $toUser) {
            $client->assigned_staff_id = (int) $toUser->id;
            $client->sales_owner_id = (int) $toUser->id;
            if ($toUser->department_id) {
                $client->assigned_department_id = (int) $toUser->department_id;
            }
            $client->save();

            $transfer->update([
                'status' => self::STATUS_ACCEPTED,
                'responded_by_user_id' => (int) $actor->id,
                'responded_at' => now(),
            ]);

            $transfer->load(['client', 'fromStaff', 'toStaff', 'requestedBy']);

            $clientName = trim((string) ($client->name ?: 'Khách hàng'));
            $title = 'Chuyển phụ trách khách hàng đã được chấp nhận';
            $body = sprintf('%s • Phụ trách mới: %s', $clientName, $toUser->name);

            $this->notifyExcept(
                $transfer,
                $title,
                $body,
                array_merge($this->notificationPayload($transfer), ['action' => 'accepted']),
                (int) $actor->id
            );

            return $transfer->fresh(['client', 'fromStaff', 'toStaff', 'requestedBy']);
        });
    }

    public function notificationPayload(ClientStaffTransferRequest $transfer): array
    {
        $transfer->loadMissing('client');

        return [
            'type' => 'staff_transfer_request',
            'category' => 'crm_realtime',
            'force_delivery' => true,
            'transfer_id' => (int) $transfer->id,
            'client_id' => (int) $transfer->client_id,
            'from_staff_id' => (int) ($transfer->from_staff_id ?? 0),
            'to_staff_id' => (int) $transfer->to_staff_id,
            'status' => (string) $transfer->status,
        ];
    }

    /**
     * Người nhận phiếu (chưa chấp nhận): chưa là phụ trách trên DB — chỉ được xử lý phiếu, không thao tác CRM đầy đủ.
     */
    public function viewerMustOnlyRespondTransfer(User $viewer, Client $client): bool
    {
        $pending = $this->pendingForClient((int) $client->id);
        if (! $pending) {
            return false;
        }

        return (int) $pending->to_staff_id === (int) $viewer->id;
    }

    public function canViewTransferDetail(User $user, ClientStaffTransferRequest $transfer): bool
    {
        return in_array((int) $user->id, $this->stakeholderUserIds($transfer), true);
    }

    public function transferToArray(ClientStaffTransferRequest $t): array
    {
        $t->loadMissing(['fromStaff', 'toStaff', 'requestedBy', 'client', 'respondedBy', 'cancelledBy']);

        return [
            'id' => (int) $t->id,
            'client_id' => (int) $t->client_id,
            'status' => (string) $t->status,
            'note' => $t->note,
            'rejection_note' => $t->rejection_note,
            'from_staff' => $t->fromStaff ? ['id' => (int) $t->fromStaff->id, 'name' => $t->fromStaff->name, 'email' => $t->fromStaff->email] : null,
            'to_staff' => $t->toStaff ? ['id' => (int) $t->toStaff->id, 'name' => $t->toStaff->name, 'email' => $t->toStaff->email] : null,
            'requested_by' => $t->requestedBy ? ['id' => (int) $t->requestedBy->id, 'name' => $t->requestedBy->name] : null,
            'responded_at' => optional($t->responded_at)->toIso8601String(),
            'cancelled_at' => optional($t->cancelled_at)->toIso8601String(),
            'client' => $t->client ? ['id' => (int) $t->client->id, 'name' => $t->client->name] : null,
        ];
    }
}
