<?php

namespace App\Services\DataTransfers;

use App\Models\Client;
use App\Models\Contract;
use App\Models\RevenueTier;

class ClientFinancialSyncService
{
    public function sync(Client $client): Client
    {
        $approvedContracts = Contract::query()
            ->where('client_id', $client->id)
            ->where('approval_status', 'approved');

        $totalRevenue = (float) $approvedContracts->sum('value');
        $totalDebt = (float) $approvedContracts->sum('debt');
        $totalCashFlow = (float) $approvedContracts->sum('cash_flow');

        $tier = null;
        if ($totalRevenue > 0) {
            $tier = RevenueTier::query()
                ->orderByDesc('min_amount')
                ->get()
                ->first(function ($item) use ($totalRevenue) {
                    return $totalRevenue >= (float) $item->min_amount;
                });

            if (! $tier) {
                $tier = RevenueTier::query()
                    ->where('min_amount', '>', 0)
                    ->orderBy('min_amount')
                    ->first();
            }
        }

        $client->update([
            'total_revenue' => $totalRevenue,
            'total_debt_amount' => $totalDebt,
            'total_cash_flow' => $totalCashFlow,
            'legacy_debt_amount' => $totalDebt,
            'has_purchased' => $totalRevenue > 0,
            'revenue_tier_id' => $tier ? $tier->id : null,
        ]);

        return $client->fresh();
    }
}
