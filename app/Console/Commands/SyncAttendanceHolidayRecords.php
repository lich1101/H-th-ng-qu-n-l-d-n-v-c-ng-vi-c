<?php

namespace App\Console\Commands;

use App\Models\AttendanceHoliday;
use App\Services\AttendanceService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SyncAttendanceHolidayRecords extends Command
{
    protected $signature = 'attendance:sync-holidays {--date=}';
    protected $description = 'Tự động chấm công đủ cho toàn bộ nhân sự thuộc diện attendance trong ngày lễ.';

    public function handle(AttendanceService $attendance): int
    {
        $targetDate = $this->resolveDate((string) $this->option('date'));
        $holiday = AttendanceHoliday::query()
            ->where('is_active', true)
            ->whereDate('holiday_date', $targetDate->toDateString())
            ->first();

        if (! $holiday) {
            $this->line('Không có ngày lễ active cho ngày '.$targetDate->toDateString().'.');
            return self::SUCCESS;
        }

        $count = 0;
        $attendance->trackedUsersQuery()
            ->get()
            ->each(function ($user) use ($attendance, $targetDate, $holiday, &$count) {
                $attendance->upsertHolidayRecord($user, $targetDate, $holiday);
                $count++;
            });

        $this->info("Đã đồng bộ {$count} bản ghi công ngày lễ cho ".$targetDate->format('d/m/Y').'.');

        return self::SUCCESS;
    }

    private function resolveDate(string $raw): Carbon
    {
        try {
            return $raw !== ''
                ? Carbon::parse($raw, 'Asia/Ho_Chi_Minh')->startOfDay()
                : Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
        } catch (\Throwable $e) {
            return Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
        }
    }
}
