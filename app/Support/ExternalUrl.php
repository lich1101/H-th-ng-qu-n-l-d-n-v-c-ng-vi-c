<?php

namespace App\Support;

/**
 * Chuẩn hóa URL cho link ngoài / website dự án (tránh domain thiếu scheme bị coi là path tương đối).
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

        if (preg_match('/^[a-z][a-z0-9+.-]*:/i', $value)) {
            return $value;
        }

        if (str_starts_with($value, '//')) {
            return 'https:'.$value;
        }

        if (str_starts_with($value, '/') || str_starts_with($value, '#') || str_starts_with($value, '?')) {
            return $value;
        }

        return 'https://'.$value;
    }
}
