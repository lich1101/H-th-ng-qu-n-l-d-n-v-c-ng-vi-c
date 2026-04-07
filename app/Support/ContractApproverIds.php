<?php

namespace App\Support;

use App\Models\User;

/**
 * Người được nhận thông báo / thực hiện bước duyệt hợp đồng & phiếu thu chi hợp đồng (khớp route api: admin, ke_toan).
 */
class ContractApproverIds
{
    /**
     * @return array<int, int>
     */
    public static function query(?int $excludeUserId = null): array
    {
        $query = User::query()
            ->whereIn('role', ['admin', 'ke_toan'])
            ->where('is_active', true);

        if ($excludeUserId !== null && $excludeUserId > 0) {
            $query->where('id', '!=', $excludeUserId);
        }

        return $query
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->values()
            ->all();
    }
}
