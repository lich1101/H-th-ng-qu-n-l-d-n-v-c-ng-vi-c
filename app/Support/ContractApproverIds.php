<?php

namespace App\Support;

use App\Models\User;

/**
 * Người được nhận thông báo / thực hiện bước duyệt hợp đồng & phiếu thu chi hợp đồng (khớp route api: admin, ke_toan).
 */
class ContractApproverIds
{
    /**
     * Trả về toàn bộ admin/ke_toan đang hoạt động — không loại trừ ai,
     * kể cả người vừa tạo hành động, để đảm bảo họ cũng nhận được thông báo.
     *
     * @return array<int, int>
     */
    public static function query(?int $excludeUserId = null): array
    {
        return User::query()
            ->whereIn('role', ['admin', 'administrator', 'ke_toan'])
            ->where('is_active', true)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }
}
