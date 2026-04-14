<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractFinanceRequest;
use App\Models\ContractCost;
use App\Models\User;
use App\Services\ContractActivityLogService;
use App\Services\DataTransfers\ClientFinancialSyncService;
use App\Services\NotificationService;
use App\Support\ContractApproverIds;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class ContractCostController extends Controller
{
    public function index(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem chi phí hợp đồng.'], 403);
        }

        return response()->json(
            $contract->costs()->orderByDesc('cost_date')->orderByDesc('id')->get()
        );
    }

    public function store(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'cost_date' => ['nullable', 'date'],
            'cost_type' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string'],
        ]);
        $validated['created_by'] = $request->user()->id;

        $financeRequest = ContractFinanceRequest::query()->create([
            'contract_id' => $contract->id,
            'request_type' => 'cost',
            'request_action' => 'create',
            'amount' => (float) $validated['amount'],
            'transaction_date' => $validated['cost_date'] ?? null,
            'cost_type' => $validated['cost_type'] ?? null,
            'note' => $validated['note'] ?? null,
            'status' => 'pending',
            'submitted_by' => $request->user()->id,
        ]);

        $this->notifyFinanceApprovers($contract, $request->user(), $financeRequest);

        if (Schema::hasTable('contract_activity_logs')) {
            $contract->refresh();
            app(ContractActivityLogService::class)->logIfApproved(
                $contract,
                $request->user(),
                ($request->user()->name ?? 'Người dùng').' đã gửi phiếu duyệt chi phí ('
                    .number_format((float) $financeRequest->amount, 0, ',', '.').' đ).',
                ['type' => 'cost_request', 'finance_request_id' => $financeRequest->id],
            );
        }

        return response()->json([
            'message' => 'Đã gửi phiếu duyệt chi phí. Admin/Kế toán cần duyệt trước khi ghi nhận vào hợp đồng.',
            'requires_approval' => true,
            'request' => $financeRequest,
        ], 202);
    }

    public function update(Request $request, Contract $contract, ContractCost $cost): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật chi phí hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }
        if ((int) $cost->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Chi phí không thuộc hợp đồng.'], 422);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'cost_date' => ['nullable', 'date'],
            'cost_type' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string'],
        ]);
        $cost->update($validated);
        $contract->refreshFinancials();
        $this->syncClientFinancials($contract);

        if (Schema::hasTable('contract_activity_logs')) {
            $contract->refresh();
            app(ContractActivityLogService::class)->logIfApproved(
                $contract,
                $request->user(),
                ($request->user()->name ?? 'Người dùng').' đã sửa ghi nhận chi phí #'.$cost->id.'.',
                ['type' => 'cost_update', 'cost_id' => $cost->id],
            );
        }

        return response()->json($cost);
    }

    public function destroy(Request $request, Contract $contract, ContractCost $cost): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền xóa chi phí hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }
        if ((int) $cost->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Chi phí không thuộc hợp đồng.'], 422);
        }

        $cost->delete();
        $contract->refreshFinancials();
        $this->syncClientFinancials($contract);

        if (Schema::hasTable('contract_activity_logs')) {
            $contract->refresh();
            app(ContractActivityLogService::class)->logIfApproved(
                $contract,
                $request->user(),
                ($request->user()->name ?? 'Người dùng').' đã xóa một ghi nhận chi phí.',
                ['type' => 'cost_delete'],
            );
        }

        return response()->json(['message' => 'Đã xóa chi phí hợp đồng.']);
    }

    private function canManage(?User $user): bool
    {
        return $user && in_array($user->role, ['admin', 'administrator', 'ke_toan'], true);
    }

    private function canAccessContract(User $user, Contract $contract): bool
    {
        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return true;
        }

        if ($this->isManagerOfContractDepartment($user, $contract)) {
            return true;
        }

        if ($user->role !== 'nhan_vien') {
            return false;
        }

        return $this->isStaffLinkedToContract($user, $contract);
    }

    private function isManagerOfContractDepartment(User $user, Contract $contract): bool
    {
        return CrmScope::canManagerAccessContract($user, $contract);
    }

    private function isStaffLinkedToContract(User $user, Contract $contract): bool
    {
        if ((int) $contract->created_by === (int) $user->id) {
            return true;
        }
        if ((int) $contract->collector_user_id === (int) $user->id) {
            return true;
        }

        $contract->loadMissing('client');
        $client = $contract->client;

        if (! $client) {
            return false;
        }

        if ((int) $client->assigned_staff_id === (int) $user->id) {
            return true;
        }
        if ((int) $client->sales_owner_id === (int) $user->id) {
            return true;
        }

        return $this->isCareStaff($user, $client) || $this->isContractCareStaff($user, $contract);
    }

    private function isCareStaff(User $user, Client $client): bool
    {
        if ($client->relationLoaded('careStaffUsers')) {
            return $client->careStaffUsers->contains(function ($staff) use ($user) {
                return (int) $staff->id === (int) $user->id;
            });
        }

        return $client->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function isContractCareStaff(User $user, Contract $contract): bool
    {
        if ($contract->relationLoaded('careStaffUsers')) {
            return $contract->careStaffUsers->contains(function ($staff) use ($user) {
                return (int) $staff->id === (int) $user->id;
            });
        }

        return $contract->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function notifyFinanceApprovers(Contract $contract, User $actor, ContractFinanceRequest $financeRequest): void
    {
        $targetIds = ContractApproverIds::query((int) $actor->id);

        if (empty($targetIds)) {
            return;
        }

        try {
            app(NotificationService::class)->notifyUsersAfterResponse(
                $targetIds,
                'Có phiếu duyệt chi phí hợp đồng mới',
                $actor->name.' vừa gửi yêu cầu thêm chi phí cho hợp đồng: '.$contract->title,
                [
                    'type' => 'contract_finance_request_pending_cost',
                    'category' => 'crm_realtime',
                    'force_delivery' => true,
                    'contract_id' => (int) $contract->id,
                    'contract_finance_request_id' => (int) $financeRequest->id,
                    'request_type' => 'cost',
                    'approval_target' => 'finance_request',
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function syncClientFinancials(Contract $contract): void
    {
        $contract->loadMissing('client');
        if ($contract->client) {
            app(ClientFinancialSyncService::class)->sync($contract->client);
        }
    }
}
