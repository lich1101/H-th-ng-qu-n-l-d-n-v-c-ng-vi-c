<?php

namespace App\Services;

use App\Models\Contract;
use Carbon\Carbon;

/**
 * Trạng thái vòng đời hợp đồng (cột contracts.status) — tự đồng bộ, không chỉnh tay.
 *
 * - cancelled: chỉ khi gắn thủ công (hủy hợp đồng), không ghi đè bởi tự động.
 * - draft: chưa duyệt (approval_status != approved).
 * - success: đã duyệt và đã thu đủ (công nợ = 0, giá trị > 0).
 * - expired: đã duyệt, còn công nợ, đã quá ngày kết thúc.
 * - signed: đã duyệt, chưa có khoản thu nào (theo bảng contract_payments).
 * - active: đã duyệt, đã có thu một phần, còn công nợ, chưa hết hạn theo ngày kết thúc.
 */
class ContractLifecycleStatusService
{
    public function compute(Contract $contract): string
    {
        if (($contract->getAttributes()['status'] ?? '') === 'cancelled') {
            return 'cancelled';
        }

        if (($contract->approval_status ?? '') !== 'approved') {
            return 'draft';
        }

        $effective = (float) $contract->effective_value;
        $paid = (float) $contract->payments()->sum('amount');
        $debt = max(0, $effective - $paid);

        if ($effective <= 0) {
            return $paid <= 0 ? 'signed' : 'success';
        }

        if ($debt <= 0) {
            return 'success';
        }

        $end = $contract->end_date;
        if ($end instanceof Carbon) {
            $endDay = $end->copy()->startOfDay();
        } elseif ($end) {
            $endDay = Carbon::parse($end)->startOfDay();
        } else {
            $endDay = null;
        }

        if ($endDay !== null && Carbon::today()->startOfDay()->gt($endDay)) {
            return 'expired';
        }

        if ($paid <= 0) {
            return 'signed';
        }

        return 'active';
    }

    public function sync(Contract $contract): void
    {
        $contract->refresh();

        if (($contract->getAttributes()['status'] ?? '') === 'cancelled') {
            return;
        }

        $next = $this->compute($contract);

        if (($contract->getAttributes()['status'] ?? '') !== $next) {
            $contract->forceFill(['status' => $next])->saveQuietly();
        }
    }
}
