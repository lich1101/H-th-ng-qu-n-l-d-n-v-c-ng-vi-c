<?php

namespace App\Services;

use App\Models\Contract;
use Carbon\Carbon;

class ContractLifecycleStatusService
{
    public function sqlExpression(string $table = 'contracts'): string
    {
        $paymentsTotalSql = "(SELECT COALESCE(SUM(cp.amount), 0) FROM contract_payments cp WHERE cp.contract_id = {$table}.id)";
        $itemsTotalSql = "(SELECT COALESCE(SUM(ci.total_price), 0) FROM contract_items ci WHERE ci.contract_id = {$table}.id)";
        $itemsCountSql = "(SELECT COUNT(*) FROM contract_items ci2 WHERE ci2.contract_id = {$table}.id)";
        $effectiveValueSql = "(CASE WHEN {$table}.value IS NOT NULL THEN COALESCE({$table}.value, 0) WHEN ({$itemsCountSql}) > 0 THEN {$itemsTotalSql} ELSE COALESCE({$table}.subtotal_value, 0) END)";
        $debtSql = "(CASE WHEN ({$effectiveValueSql} - {$paymentsTotalSql}) > 0 THEN ({$effectiveValueSql} - {$paymentsTotalSql}) ELSE 0 END)";

        return "
            CASE
                WHEN {$table}.approval_status = 'rejected' THEN 'cancelled'
                WHEN {$table}.approval_status IS NULL OR {$table}.approval_status <> 'approved' THEN 'draft'
                WHEN {$debtSql} <= 0 THEN 'success'
                WHEN {$table}.end_date IS NOT NULL AND CURRENT_DATE > DATE({$table}.end_date) THEN 'expired'
                WHEN {$paymentsTotalSql} <= 0 THEN 'signed'
                ELSE 'active'
            END
        ";
    }

    public function compute(Contract $contract): string
    {
        if (($contract->approval_status ?? '') === 'rejected') {
            return 'cancelled';
        }

        if (($contract->approval_status ?? '') !== 'approved') {
            return 'draft';
        }

        $effective = (float) $contract->effective_value;
        $paid = (float) $contract->payments_total;
        $debt = (float) $contract->debt_outstanding;

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
            $endDay = Carbon::parse((string) $end)->startOfDay();
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
        // Trạng thái giờ được tính động, không còn lưu trong DB.
    }
}
