<?php

namespace App\Services;

use App\Models\TaskItem;
use Illuminate\Support\Carbon;

/**
 * Tiến độ kỳ vọng theo đường tuyến tính (start → deadline, 0%→100%),
 * so với tiến độ thực tế (progress_percent) — cùng logic phần summary trong progress-insight.
 */
class TaskItemLinearPaceService
{
    /** @return array{expected_progress_today:int,actual_progress_today:int,lag_percent:int,is_late:bool,pace:string} */
    public function summarize(TaskItem $item): array
    {
        $now = Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
        $start = $item->start_date
            ? Carbon::parse($item->start_date, 'Asia/Ho_Chi_Minh')->startOfDay()
            : ($item->created_at ? Carbon::parse($item->created_at, 'Asia/Ho_Chi_Minh')->startOfDay() : $now->copy());
        $deadline = $item->deadline
            ? Carbon::parse($item->deadline, 'Asia/Ho_Chi_Minh')->startOfDay()
            : null;

        if (! $deadline || $deadline->lessThan($start)) {
            $deadline = $now->copy();
        }

        $totalDays = max(1, $start->diffInDays($deadline));

        $expectedToday = 0;
        if ($now->greaterThanOrEqualTo($start)) {
            $effectiveToday = $now->lessThan($deadline) ? $now : $deadline;
            $elapsedToday = min($totalDays, max(0, $start->diffInDays($effectiveToday, false)));
            $expectedToday = (int) round(($elapsedToday / $totalDays) * 100);
        }
        $expectedToday = max(0, min(100, $expectedToday));

        $actualToday = max(0, min(100, (int) ($item->progress_percent ?? 0)));
        $lagPercent = max(0, $expectedToday - $actualToday);

        $pace = 'on_track';
        if ($actualToday < $expectedToday) {
            $pace = 'behind';
        } elseif ($actualToday > $expectedToday) {
            $pace = 'ahead';
        }

        return [
            'expected_progress_today' => $expectedToday,
            'actual_progress_today' => $actualToday,
            'lag_percent' => $lagPercent,
            'is_late' => $lagPercent > 0,
            'pace' => $pace,
        ];
    }

    public function matchesPace(TaskItem $item, string $pace): bool
    {
        return $this->summarize($item)['pace'] === $pace;
    }
}
