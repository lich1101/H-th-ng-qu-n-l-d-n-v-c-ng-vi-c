<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\ContractFinanceRequest;
use App\Models\ContractPayment;
use App\Models\User;
use App\Services\DataTransfers\ClientFinancialSyncService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ContractFinanceRequestService
{
    public function __construct(
        private NotificationService $notificationService
    ) {}

    public function approve(
        Contract $contract,
        ContractFinanceRequest $financeRequest,
        User $reviewer,
        ?string $reviewNote = null
    ): ContractFinanceRequest {
        if ((string) $financeRequest->status !== 'pending') {
            throw ValidationException::withMessages([
                'status' => ['Phiếu duyệt đã được xử lý trước đó.'],
            ]);
        }

        $validatedNote = $reviewNote !== null ? trim($reviewNote) : null;

        DB::transaction(function () use ($contract, $financeRequest, $reviewer, $validatedNote) {
            $createdPaymentId = null;
            $createdCostId = null;

            if ((string) $financeRequest->request_type === 'payment') {
                $amount = max(0, (float) ($financeRequest->amount ?? 0));
                if ($error = $this->validatePaymentCap($contract, $amount)) {
                    throw ValidationException::withMessages([
                        'amount' => [$error],
                    ]);
                }

                $payment = $contract->payments()->create([
                    'amount' => $amount,
                    'paid_at' => $financeRequest->transaction_date,
                    'method' => $financeRequest->method,
                    'note' => $financeRequest->note,
                    'created_by' => $financeRequest->submitted_by ?: $reviewer->id,
                ]);
                $createdPaymentId = (int) $payment->id;
            } else {
                $cost = $contract->costs()->create([
                    'amount' => max(0, (float) ($financeRequest->amount ?? 0)),
                    'cost_date' => $financeRequest->transaction_date,
                    'cost_type' => $financeRequest->cost_type,
                    'note' => $financeRequest->note,
                    'created_by' => $financeRequest->submitted_by ?: $reviewer->id,
                ]);
                $createdCostId = (int) $cost->id;
            }

            $financeRequest->update([
                'status' => 'approved',
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'review_note' => $validatedNote !== '' ? $validatedNote : null,
                'contract_payment_id' => $createdPaymentId,
                'contract_cost_id' => $createdCostId,
            ]);

            $contract->refreshFinancials();
            if ($contract->client) {
                app(ClientFinancialSyncService::class)->sync($contract->client);
            }
        });

        $fresh = $financeRequest->fresh()->load([
            'submitter:id,name,email,avatar_url',
            'reviewer:id,name,email,avatar_url',
        ]);

        $this->notifyRequesterFeedback($contract, $fresh, $reviewer, 'approved');

        return $fresh;
    }

    /**
     * Duyệt lần lượt mọi phiếu đang chờ (dùng khi duyệt hợp đồng hoặc duyệt hàng loạt).
     *
     * @return int Số phiếu đã duyệt
     */
    public function approveAllPendingForContract(Contract $contract, User $reviewer): int
    {
        $pending = $contract->financeRequests()
            ->where('status', 'pending')
            ->orderBy('id')
            ->get();

        $count = 0;
        foreach ($pending as $financeRequest) {
            $contract->refresh();
            $this->approve($contract, $financeRequest, $reviewer, null);
            $count++;
        }

        return $count;
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
                .' của hợp đồng "'.((string) ($contract->title ?? '')).'" đã được '
                .($action === 'approved' ? 'duyệt' : 'từ chối')
                .' bởi '.$actor->name.'.';

            $this->notificationService->notifyUsersAfterResponse(
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
                    'review_action' => $action,
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
