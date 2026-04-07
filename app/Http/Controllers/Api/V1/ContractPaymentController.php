<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractFinanceRequest;
use App\Models\ContractPayment;
use App\Models\User;
use App\Services\DataTransfers\ClientFinancialSyncService;
use App\Services\NotificationService;
use App\Support\ContractApproverIds;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContractPaymentController extends Controller
{
    public function index(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem thanh toán hợp đồng.'], 403);
        }

        return response()->json(
            $contract->payments()->orderByDesc('paid_at')->orderByDesc('id')->get()
        );
    }

    public function store(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'paid_at' => ['nullable', 'date'],
            'method' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string'],
        ]);
        $validated['created_by'] = $request->user()->id;

        if ($error = $this->validatePaymentCap($contract, (float) $validated['amount'])) {
            return response()->json(['message' => $error], 422);
        }

        // Luôn tạo phiếu chờ duyệt (kể cả admin/kế toán): ghi nhận vào hợp đồng chỉ sau khi duyệt.
        $financeRequest = ContractFinanceRequest::query()->create([
            'contract_id' => $contract->id,
            'request_type' => 'payment',
            'request_action' => 'create',
            'amount' => (float) $validated['amount'],
            'transaction_date' => $validated['paid_at'] ?? null,
            'method' => $validated['method'] ?? null,
            'note' => $validated['note'] ?? null,
            'status' => 'pending',
            'submitted_by' => $request->user()->id,
        ]);

        $this->notifyFinanceApprovers($contract, $request->user(), $financeRequest);

        return response()->json([
            'message' => 'Đã gửi phiếu duyệt thanh toán. Admin/Kế toán cần duyệt trước khi ghi nhận vào hợp đồng.',
            'requires_approval' => true,
            'request' => $financeRequest,
        ], 202);
    }

    public function update(Request $request, Contract $contract, ContractPayment $payment): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật thanh toán hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }
        if ((int) $payment->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Thanh toán không thuộc hợp đồng.'], 422);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'paid_at' => ['nullable', 'date'],
            'method' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string'],
        ]);

        if ($error = $this->validatePaymentCap($contract, (float) $validated['amount'], $payment)) {
            return response()->json(['message' => $error], 422);
        }

        $payment->update($validated);
        $contract->refreshFinancials();
        $this->syncClientFinancials($contract);

        return response()->json($payment);
    }

    public function destroy(Request $request, Contract $contract, ContractPayment $payment): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền xóa thanh toán hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }
        if ((int) $payment->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Thanh toán không thuộc hợp đồng.'], 422);
        }

        $payment->delete();
        $contract->refreshFinancials();
        $this->syncClientFinancials($contract);

        return response()->json(['message' => 'Đã xóa thanh toán hợp đồng.']);
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

    private function validatePaymentCap(Contract $contract, float $nextAmount, ?ContractPayment $currentPayment = null): ?string
    {
        $contractValue = (float) ($contract->value ?? 0);
        $existingTotal = (float) $contract->payments()->sum('amount');

        if ($currentPayment) {
            $existingTotal -= (float) ($currentPayment->amount ?? 0);
        }

        $projectedTotal = $existingTotal + max(0, $nextAmount);
        if ($projectedTotal <= $contractValue + 0.0001) {
            return null;
        }

        $remaining = max(0, $contractValue - $existingTotal);

        return 'Số tiền thanh toán vượt giá trị hợp đồng. Chỉ còn có thể thu tối đa '
            .number_format($remaining, 0, ',', '.')
            .' VNĐ.';
    }

    private function notifyFinanceApprovers(Contract $contract, User $actor, ContractFinanceRequest $financeRequest): void
    {
        $targetIds = ContractApproverIds::query((int) $actor->id);

        if (empty($targetIds)) {
            return;
        }

        try {
            app(NotificationService::class)->notifyUsers(
                $targetIds,
                'Có phiếu duyệt thanh toán hợp đồng mới',
                $actor->name.' vừa gửi yêu cầu thêm thanh toán cho hợp đồng: '.$contract->title,
                [
                    'type' => 'contract_finance_request_pending_payment',
                    'category' => 'crm_realtime',
                    'force_delivery' => true,
                    'contract_id' => (int) $contract->id,
                    'contract_finance_request_id' => (int) $financeRequest->id,
                    'request_type' => 'payment',
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
