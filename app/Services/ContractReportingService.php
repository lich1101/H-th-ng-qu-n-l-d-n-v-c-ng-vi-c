<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\ContractItem;
use Illuminate\Support\Collection;

/**
 * Doanh thu ghi nhận báo cáo — khớp ContractController::contractListAggregates / danh sách HĐ.
 */
class ContractReportingService
{
    /**
     * Biểu thức SQL (cần join subquery items_agg: items_sum, items_cnt theo contract_id).
     */
    public static function effectiveRevenueSql(string $itemsAlias = 'items_agg'): string
    {
        return '(CASE WHEN contracts.value IS NOT NULL THEN COALESCE(contracts.value, 0) '
            .'WHEN COALESCE('.$itemsAlias.'.items_cnt, 0) > 0 THEN COALESCE('.$itemsAlias.'.items_sum, 0) '
            .'ELSE COALESCE(contracts.subtotal_value, 0) END)';
    }

    /**
     * @param  iterable<int, Contract>  $contracts
     * @return array<int, float> contract_id => revenue
     */
    public static function effectiveRevenuesForContracts(iterable $contracts): array
    {
        $list = Collection::make($contracts)->filter(function ($c) {
            return $c instanceof Contract && (int) $c->id > 0;
        })->values();

        if ($list->isEmpty()) {
            return [];
        }

        $ids = $list->pluck('id')->map(fn ($id) => (int) $id)->all();

        $itemAgg = ContractItem::query()
            ->whereIn('contract_id', $ids)
            ->selectRaw('contract_id, COALESCE(SUM(total_price), 0) as items_sum, COUNT(*) as items_cnt')
            ->groupBy('contract_id')
            ->get()
            ->keyBy('contract_id');

        $out = [];
        foreach ($list as $contract) {
            $id = (int) $contract->id;
            $row = $itemAgg->get($id);
            $itemsSum = $row ? (float) $row->items_sum : 0.0;
            $itemsCnt = $row ? (int) $row->items_cnt : 0;

            $rawValue = $contract->getRawOriginal('value');
            if ($rawValue !== null && $rawValue !== '') {
                $out[$id] = (float) $rawValue;
                continue;
            }
            if ($itemsCnt > 0) {
                $out[$id] = $itemsSum;
                continue;
            }
            $rawSub = $contract->getRawOriginal('subtotal_value');
            $out[$id] = ($rawSub !== null && $rawSub !== '') ? (float) $rawSub : 0.0;
        }

        return $out;
    }
}
