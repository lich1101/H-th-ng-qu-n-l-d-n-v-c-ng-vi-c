<?php

namespace App\Console\Commands;

use App\Models\AppSetting;
use App\Models\TaskItem;
use App\Models\TaskItemReminderLog;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendTaskItemProgressReminders extends Command
{
    protected $signature = 'task-items:remind-progress';
    protected $description = 'Gửi nhắc nhở tiến độ đầu việc bị chậm theo ngày.';

    public function handle(): int
    {
        $setting = AppSetting::query()->first();
        if ($setting && $setting->task_item_progress_reminder_enabled === false) {
            return self::SUCCESS;
        }

        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $reminderTime = $setting && $setting->task_item_progress_reminder_time
            ? (string) $setting->task_item_progress_reminder_time
            : '09:00';
        if (! $this->matchesTime($now, $reminderTime)) {
            return self::SUCCESS;
        }

        $today = $now->copy()->startOfDay();
        $items = TaskItem::query()
            ->whereNotNull('assignee_id')
            ->where('status', '!=', 'done')
            ->with(['task', 'task.project'])
            ->get();

        if ($items->isEmpty()) {
            return self::SUCCESS;
        }

        foreach ($items as $item) {
            $start = $item->start_date ? Carbon::parse($item->start_date) : $item->created_at;
            $deadline = $item->deadline ? Carbon::parse($item->deadline) : null;
            if (! $start || ! $deadline) {
                continue;
            }
            if ($deadline->lessThanOrEqualTo($start)) {
                continue;
            }
            $totalDays = max(1, $start->diffInDays($deadline));
            $elapsedDays = min($totalDays, $start->diffInDays($today, false));
            $elapsedDays = max(0, $elapsedDays);
            $expected = (int) round(($elapsedDays / $totalDays) * 100);
            $expected = max(0, min(100, $expected));

            $current = (int) ($item->progress_percent ?? 0);
            $lag = $expected - $current;
            if ($lag < 5) {
                continue;
            }

            $assigneeId = (int) $item->assignee_id;
            if ($assigneeId <= 0) {
                continue;
            }

            $already = TaskItemReminderLog::query()
                ->where('task_item_id', $item->id)
                ->where('user_id', $assigneeId)
                ->whereDate('reminder_date', $today)
                ->exists();
            if ($already) {
                continue;
            }

            app(NotificationService::class)->notifyUsers(
                [$assigneeId],
                'Đầu việc chậm tiến độ',
                sprintf(
                    'Đầu việc %s của công việc %s đang chậm tiến độ %s%%',
                    (string) $item->title,
                    (string) optional($item->task)->title,
                    $lag
                ),
                [
                    'type' => 'task_item_progress_late',
                    'task_id' => optional($item->task)->id,
                    'task_item_id' => $item->id,
                    'lag_percent' => $lag,
                ]
            );

            TaskItemReminderLog::create([
                'task_item_id' => $item->id,
                'user_id' => $assigneeId,
                'reminder_date' => $today->toDateString(),
            ]);
        }

        return self::SUCCESS;
    }

    private function matchesTime(Carbon $now, string $expectedTime): bool
    {
        $parts = explode(':', $expectedTime);
        if (count($parts) !== 2) {
            return false;
        }

        return sprintf('%02d:%02d', $now->hour, $now->minute) === sprintf(
            '%02d:%02d',
            (int) $parts[0],
            (int) $parts[1]
        );
    }
}
