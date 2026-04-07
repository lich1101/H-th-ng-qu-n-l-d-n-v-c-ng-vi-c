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
        $ids = User::query()
            ->whereIn('role', ['admin', 'administrator', 'ke_toan'])
            ->where('is_active', true)
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->values()
            ->all();

        if ($excludeUserId === null || $excludeUserId <= 0) {
            return $ids;
        }

        $withoutActor = array_values(array_filter($ids, function (int $id) use ($excludeUserId) {
            return $id !== $excludeUserId;
        }));

        // Nếu chỉ còn 1 admin/kế toán (tự gửi), vẫn cần ít nhất một người nhận thông báo để duyệt.
        return $withoutActor !== [] ? $withoutActor : $ids;
    }
}
