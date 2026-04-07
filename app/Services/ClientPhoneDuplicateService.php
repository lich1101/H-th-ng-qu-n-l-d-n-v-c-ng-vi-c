<?php

namespace App\Services;

use App\Models\Client;

class ClientPhoneDuplicateService
{
    /**
     * Chuẩn hóa SĐT VN về dạng chỉ số, bắt đầu bằng 0 (vd: 0987654321).
     */
    public function normalizeDigits(?string $raw): string
    {
        if ($raw === null || trim((string) $raw) === '') {
            return '';
        }
        $digits = preg_replace('/\D+/', '', (string) $raw);
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '84') && strlen($digits) >= 11) {
            $digits = '0'.substr($digits, 2);
        }
        $length = strlen($digits);
        if ($length < 9 || $length > 11) {
            return '';
        }

        return $digits;
    }

    /**
     * Giá trị lưu DB: chỉ chữ số (đã +84→0). null nếu rỗng hoặc không hợp lệ.
     */
    public function normalizeForStorage(?string $raw): ?string
    {
        $n = $this->normalizeDigits($raw);

        return $n === '' ? null : $n;
    }

    /**
     * Thêm OR: cột phone khớp chuỗi số sau khi bỏ ký tự không phải số (cùng logic trùng SĐT).
     *
     * @param  \Illuminate\Database\Eloquent\Builder|\Illuminate\Database\Query\Builder  $query
     */
    public function orWherePhoneDigitsLikeSearch($query, string $rawSearch): void
    {
        $digitSearch = $this->normalizeDigits($rawSearch);
        if ($digitSearch === '') {
            return;
        }
        $driver = $query->getConnection()->getDriverName();
        if ($driver === 'sqlite') {
            $query->orWhereRaw(
                "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), ' ', ''), '-', ''), '.', ''), '(', ''), ')', '') LIKE ?",
                ['%' . $digitSearch . '%']
            );
        } else {
            $query->orWhereRaw(
                "REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '') LIKE ?",
                ['%' . $digitSearch . '%']
            );
        }
    }

    public function findExistingByNormalizedPhone(string $normalized, ?int $exceptClientId = null): ?Client
    {
        if ($normalized === '') {
            return null;
        }
        $query = Client::query();
        if ($exceptClientId) {
            $query->where('id', '!=', $exceptClientId);
        }
        try {
            $found = (clone $query)->whereRaw("REGEXP_REPLACE(phone, '[^0-9]', '') = ?", [$normalized])->first();
            if ($found) {
                return $found;
            }
        } catch (\Throwable $e) {
            // MySQL cũ / SQLite: fallback
        }

        return (clone $query)->where('phone', $normalized)->first();
    }

    public function findExistingByPhone(?string $phone, ?int $exceptClientId = null): ?Client
    {
        $n = $this->normalizeDigits($phone);
        if ($n === '') {
            return null;
        }

        return $this->findExistingByNormalizedPhone($n, $exceptClientId);
    }

    /**
     * Gộp hiển thị tên (legacy). Luồng FormLead/Fanpage trùng SĐT không còn gộp tên trên hồ sơ CRM.
     */
    public function mergeDisplayNames(?string $existing, ?string $incoming): string
    {
        $a = trim((string) $existing);
        $b = trim((string) $incoming);
        if ($b === '') {
            return $a;
        }
        if ($a === '') {
            return $b;
        }
        if (mb_stripos($a, $b) !== false) {
            return $a;
        }
        if (mb_stripos($b, $a) !== false) {
            return $b;
        }

        return $a.', '.$b;
    }
}
