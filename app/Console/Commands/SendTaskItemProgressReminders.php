<?php

namespace App\Console\Commands;

use App\Models\AppSetting;
use App\Models\TaskItem;
use App\Models\TaskItemProgressDailyDigestLog;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\TaskItemLinearPaceService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendTaskItemProgressReminders extends Command
{
    protected $signature = 'task-items:remind-progress';

    protected $description = 'Gửi thông báo gộp: đầu việc chậm tiến độ (so với đường tuyến tính) theo giờ cấu hình.';

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
            ->get(['id', 'assignee_id', 'start_date', 'deadline', 'created_at', 'progress_percent']);

        if ($items->isEmpty()) {
            return self::SUCCESS;
        }

        $service = app(TaskItemLinearPaceService::class);
        $countsByUser = [];
        foreach ($items as $item) {
            $summary = $service->summarize($item);
            if (($summary['pace'] ?? '') !== 'behind') {
                continue;
            }
            $assigneeId = (int) $item->assignee_id;
            if ($assigneeId <= 0) {
                continue;
            }
            $countsByUser[$assigneeId] = ($countsByUser[$assigneeId] ?? 0) + 1;
        }

        foreach ($countsByUser as $userId => $lateCount) {
            if ($lateCount < 1) {
                continue;
            }

            $already = TaskItemProgressDailyDigestLog::query()
                ->where('user_id', $userId)
                ->whereDate('reminder_date', $today)
                ->exists();
            if ($already) {
                continue;
            }

            $user = User::query()->find($userId);
            $displayName = $user ? (string) $user->name : 'Nhân sự';

            app(NotificationService::class)->notifyUsers(
                [$userId],
                'Đầu việc chậm tiến độ',
                sprintf('%s, bạn có %d đầu việc đang chậm tiến độ.', $displayName, $lateCount),
                [
                    'type' => 'task_item_progress_late',
                    'late_count' => $lateCount,
                ]
            );

            TaskItemProgressDailyDigestLog::create([
                'user_id' => $userId,
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
