<?php

namespace App\Support;

use App\Models\Opportunity;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;

/**
 * Trạng thái hiển thị cơ hội (không lưu DB): phụ thuộc ngày kết thúc dự kiến + hợp đồng liên kết.
 */
class OpportunityComputedStatus
{
    public const UNDETERMINED = 'undetermined';

    public const OPEN = 'open';

    public const OVERDUE = 'overdue';

    public const SUCCESS = 'success';

    public static function labels(): array
    {
        return [
            self::UNDETERMINED => 'Chưa xác định',
            self::OPEN => 'Đang mở',
            self::OVERDUE => 'Quá hạn',
            self::SUCCESS => 'Thành công',
        ];
    }

    public static function label(string $code): string
    {
        return self::labels()[$code] ?? $code;
    }

    /**
     * @return array{code: string, label: string}
     */
    public static function compute(Opportunity $opportunity): array
    {
        $opportunity->loadMissing('contract:id,opportunity_id');

        if ($opportunity->relationLoaded('contract') && $opportunity->contract !== null) {
            return ['code' => self::SUCCESS, 'label' => self::label(self::SUCCESS)];
        }

        $close = $opportunity->expected_close_date;
        if ($close === null) {
            return ['code' => self::UNDETERMINED, 'label' => self::label(self::UNDETERMINED)];
        }

        $today = Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
        $end = Carbon::parse($close)->timezone('Asia/Ho_Chi_Minh')->startOfDay();

        if ($today->lte($end)) {
            return ['code' => self::OPEN, 'label' => self::label(self::OPEN)];
        }

        return ['code' => self::OVERDUE, 'label' => self::label(self::OVERDUE)];
    }

    /**
     * Lọc index theo computed_status (không có cột DB).
     */
    public static function applyIndexFilter(Builder $query, string $code): void
    {
        $code = strtolower(trim($code));
        if (! in_array($code, [self::UNDETERMINED, self::OPEN, self::OVERDUE, self::SUCCESS], true)) {
            return;
        }

        $today = Carbon::now('Asia/Ho_Chi_Minh')->toDateString();

        if ($code === self::SUCCESS) {
            $query->whereHas('contract');

            return;
        }

        $query->whereDoesntHave('contract');

        if ($code === self::UNDETERMINED) {
            $query->whereNull('expected_close_date');

            return;
        }

        if ($code === self::OPEN) {
            $query->whereNotNull('expected_close_date')
                ->whereDate('expected_close_date', '>=', $today);

            return;
        }

        if ($code === self::OVERDUE) {
            $query->whereNotNull('expected_close_date')
                ->whereDate('expected_close_date', '<', $today);
        }
    }
}
