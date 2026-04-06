<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractCost;
use App\Models\ContractFinanceRequest;
use App\Models\ContractPayment;
use App\Models\User;
use App\Services\DataTransfers\ClientFinancialSyncService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ContractFinanceRequestController extends Controller
{
    public function index(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem phiếu duyệt tài chính hợp đồng.'], 403);
        }

        $rows = $contract->financeRequests()
            ->with([
                'submitter:id,name,email,avatar_url',
                'reviewer:id,name,email,avatar_url',
            ])
            ->latest()
            ->get();

        return response()->json($rows);
    }

    public function approve(Request $request, Contract $contract, ContractFinanceRequest $financeRequest): JsonResponse
    {
        if (! $this->canReview($request->user())) {
            return response()->json(['message' => 'Chỉ admin/kế toán mới có quyền duyệt phiếu tài chính.'], 403);
        }
        if ((int) $financeRequest->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Phiếu duyệt không thuộc hợp đồng này.'], 422);
        }
        if ((string) $financeRequest->status !== 'pending') {
            return response()->json(['message' => 'Phiếu duyệt đã được xử lý trước đó.'], 422);
        }

        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:1000'],
        ]);

        DB::transaction(function () use ($contract, $financeRequest, $request, $validated) {
            $createdPaymentId = null;
            $createdCostId = null;

            if ((string) $financeRequest->request_type === 'payment') {
                $amount = max(0, (float) ($financeRequest->amount ?? 0));
                if ($error = $this->validatePaymentCap($contract, $amount)) {
                    throw ValidationException::withMessages([
                        'amount' => $error,
                    ]);
                }

                $payment = $contract->payments()->create([
                    'amount' => $amount,
                    'paid_at' => $financeRequest->transaction_date,
                    'method' => $financeRequest->method,
                    'note' => $financeRequest->note,
                    'created_by' => $financeRequest->submitted_by ?: $request->user()->id,
                ]);
                $createdPaymentId = (int) $payment->id;
            } else {
                $cost = $contract->costs()->create([
                    'amount' => max(0, (float) ($financeRequest->amount ?? 0)),
                    'cost_date' => $financeRequest->transaction_date,
                    'cost_type' => $financeRequest->cost_type,
                    'note' => $financeRequest->note,
                    'created_by' => $financeRequest->submitted_by ?: $request->user()->id,
                ]);
                $createdCostId = (int) $cost->id;
            }

            $financeRequest->update([
                'status' => 'approved',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'review_note' => trim((string) ($validated['review_note'] ?? '')) ?: null,
                'contract_payment_id' => $createdPaymentId,
                'contract_cost_id' => $createdCostId,
            ]);

            $contract->refreshFinancials();
            if ($contract->client) {
                app(ClientFinancialSyncService::class)->sync($contract->client);
            }
        });

        $this->notifyRequesterFeedback($contract, $financeRequest->fresh(), $request->user(), 'approved');

        return response()->json([
            'message' => 'Đã duyệt phiếu tài chính hợp đồng.',
            'request' => $financeRequest->fresh()->load([
                'submitter:id,name,email,avatar_url',
                'reviewer:id,name,email,avatar_url',
            ]),
        ]);
    }

    public function reject(Request $request, Contract $contract, ContractFinanceRequest $financeRequest): JsonResponse
    {
        if (! $this->canReview($request->user())) {
            return response()->json(['message' => 'Chỉ admin/kế toán mới có quyền từ chối phiếu tài chính.'], 403);
        }
        if ((int) $financeRequest->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Phiếu duyệt không thuộc hợp đồng này.'], 422);
        }
        if ((string) $financeRequest->status !== 'pending') {
            return response()->json(['message' => 'Phiếu duyệt đã được xử lý trước đó.'], 422);
        }

        $validated = $request->validate([
            'review_note' => ['required', 'string', 'max:1000'],
        ]);

        $financeRequest->update([
            'status' => 'rejected',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'review_note' => trim((string) $validated['review_note']),
        ]);

        $this->notifyRequesterFeedback($contract, $financeRequest->fresh(), $request->user(), 'rejected');

        return response()->json([
            'message' => 'Đã từ chối phiếu tài chính hợp đồng.',
            'request' => $financeRequest->fresh()->load([
                'submitter:id,name,email,avatar_url',
                'reviewer:id,name,email,avatar_url',
            ]),
        ]);
    }

    private function canReview(?User $user): bool
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

    private function notifyRequesterFeedback(Contract $contract, ContractFinanceRequest $financeRequest, User $actor, string $action): void
    {
        $targetId = (int) ($financeRequest->submitted_by ?? 0);
        if ($targetId <= 0 || $targetId === (int) $actor->id) {
            return;
        }

        try {
            $isPayment = (string) $financeRequest->request_type === 'payment';
            $title = $action === 'approved'
                ? 'Phiếu tài chính hợp đồng đã được duyệt'
                : 'Phiếu tài chính hợp đồng bị từ chối';
            $body = ($isPayment ? 'Phiếu thu tiền' : 'Phiếu chi phí')
                .' của hợp đồng "'.((string) ($contract->title ?? '')) .'" đã được '
                .($action === 'approved' ? 'duyệt' : 'từ chối')
                .' bởi '.$actor->name.'.';

            app(NotificationService::class)->notifyUsersAfterResponse(
                [$targetId],
                $title,
                $body,
                [
                    'type' => 'contract_finance_request_feedback',
                    'contract_id' => (int) $contract->id,
                    'contract_finance_request_id' => (int) $financeRequest->id,
                    'request_type' => (string) $financeRequest->request_type,
                    'review_action' => $action,
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
