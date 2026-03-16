<?php

namespace App\Console\Commands;

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
        $today = Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
        $items = TaskItem::query()
            ->whereNotNull('assignee_id')
            ->where('status', '!=', 'done')
            ->with(['task', 'task.project'])
            ->get();

        if ($items->isEmpty()) {
            return self::SUCCESS;
        }

        $grouped = [];
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

            $grouped[$assigneeId][] = [
                'item_id' => $item->id,
                'title' => $item->title,
                'lag' => $lag,
            ];
        }

        if (empty($grouped)) {
            return self::SUCCESS;
        }

        $notifier = app(NotificationService::class);
        foreach ($grouped as $userId => $list) {
            $lines = collect($list)
                ->take(5)
                ->map(fn ($row) => "• {$row['title']} (chậm {$row['lag']}%)")
                ->implode("\n");
            $extra = count($list) > 5 ? "\n+".(count($list) - 5)." đầu việc khác" : '';

            $notifier->notifyUsers(
                [(int) $userId],
                'Đầu việc chậm tiến độ',
                $lines.$extra,
                [
                    'type' => 'task_item_progress_late',
                    'count' => count($list),
                ]
            );

            foreach ($list as $row) {
                TaskItemReminderLog::create([
                    'task_item_id' => $row['item_id'],
                    'user_id' => (int) $userId,
                    'reminder_date' => $today->toDateString(),
                ]);
            }
        }

        return self::SUCCESS;
    }
}
