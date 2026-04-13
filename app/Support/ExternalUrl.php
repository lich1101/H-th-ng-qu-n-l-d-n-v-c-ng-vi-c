<?php

namespace App\Support;

/**
 * Giữ đúng chuỗi URL người dùng nhập (chỉ trim). Không tự thêm https:// hay sửa dấu /.
 * Chuẩn hóa cho GSC/API vẫn nằm ở ProjectGscSyncService::normalizeSiteUrl.
 */
final class ExternalUrl
{
    /**
     * @param  string|null  $raw
     * @return string|null null nếu chuỗi rỗng sau trim
     */
    public static function toAbsoluteHref(?string $raw): ?string
    {
        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }

        return $value;
    }
}
