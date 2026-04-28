<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractFinanceRequest;
use App\Models\User;
use App\Services\ContractFinanceRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

        try {
            $fresh = app(ContractFinanceRequestService::class)->approve(
                $contract,
                $financeRequest,
                $request->user(),
                $validated['review_note'] ?? null
            );
        } catch (ValidationException $e) {
            $first = collect($e->errors())->flatten()->first();

            return response()->json([
                'message' => $first ?: 'Không thể duyệt phiếu tài chính.',
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'message' => 'Đã duyệt phiếu tài chính hợp đồng.',
            'request' => $fresh,
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

        $this->notifyRejectFeedback($contract, $financeRequest->fresh(), $request->user());

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
        if ((int) ($client->assigned_staff_id ?? 0) <= 0
            && (int) ($client->sales_owner_id ?? 0) === (int) $user->id) {
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

    private function notifyRejectFeedback(Contract $contract, ContractFinanceRequest $financeRequest, User $actor): void
    {
        $targetId = (int) ($financeRequest->submitted_by ?? 0);
        if ($targetId <= 0 || $targetId === (int) $actor->id) {
            return;
        }

        try {
            $isPayment = (string) $financeRequest->request_type === 'payment';
            $title = 'Phiếu tài chính hợp đồng bị từ chối';
            $body = ($isPayment ? 'Phiếu thu tiền' : 'Phiếu chi phí')
                .' của hợp đồng "'.((string) ($contract->title ?? '')).'" đã được từ chối bởi '.$actor->name.'.';

            app(\App\Services\NotificationService::class)->notifyUsersAfterResponse(
                [$targetId],
                $title,
                $body,
                [
                    'type' => 'contract_finance_request_feedback',
                    'category' => 'crm_realtime',
                    'force_delivery' => true,
                    'contract_id' => (int) $contract->id,
                    'contract_finance_request_id' => (int) $financeRequest->id,
                    'request_type' => (string) $financeRequest->request_type,
                    'review_action' => 'rejected',
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
