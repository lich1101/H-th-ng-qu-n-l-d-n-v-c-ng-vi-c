<?php

namespace App\Console\Commands;

use App\Models\DeadlineReminder;
use App\Models\Task;
use App\Models\TaskItem;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SyncDeadlineReminders extends Command
{
    protected $signature = 'reminders:sync-deadline {--channels= : Comma-separated channels (in_app,email,telegram,zalo)}';
    protected $description = 'Auto-create deadline reminders (3 days, 1 day, overdue) for tasks.';

    public function handle(): int
    {
        $channels = $this->parseChannels();
        $now = now();
        $tasks = Task::query()
            ->whereNotNull('deadline')
            ->whereNotIn('status', ['done'])
            ->get();
        $items = TaskItem::query()
            ->whereNotNull('deadline')
            ->whereNotIn('status', ['done'])
            ->get();

        $created = 0;

        foreach ($tasks as $task) {
            if (! $task->deadline) {
                continue;
            }

            $deadline = $task->deadline->copy();

            foreach ($channels as $channel) {
                $created += $this->ensureTaskReminder(
                    $task,
                    $channel,
                    'days_3',
                    $deadline->copy()->subDays(3),
                    true,
                    $now
                );
                $created += $this->ensureTaskReminder(
                    $task,
                    $channel,
                    'day_1',
                    $deadline->copy()->subDay(),
                    true,
                    $now
                );
                if ($deadline->lte($now)) {
                    $created += $this->ensureTaskReminder(
                        $task,
                        $channel,
                        'overdue',
                        $deadline->copy(),
                        false,
                        $now
                    );
                }
            }
        }

        foreach ($items as $item) {
            if (! $item->deadline) {
                continue;
            }
            $deadline = $item->deadline->copy();
            foreach ($channels as $channel) {
                $created += $this->ensureItemReminder(
                    $item,
                    $channel,
                    'days_3',
                    $deadline->copy()->subDays(3),
                    true,
                    $now
                );
                $created += $this->ensureItemReminder(
                    $item,
                    $channel,
                    'day_1',
                    $deadline->copy()->subDay(),
                    true,
                    $now
                );
                if ($deadline->lte($now)) {
                    $created += $this->ensureItemReminder(
                        $item,
                        $channel,
                        'overdue',
                        $deadline->copy(),
                        false,
                        $now
                    );
                }
            }
        }

        $this->info('Created reminders: '.$created);

        return self::SUCCESS;
    }

    private function parseChannels(): array
    {
        $option = $this->option('channels');
        $raw = is_string($option) && trim($option) !== ''
            ? $option
            : env('DEADLINE_CHANNELS', 'in_app');

        $channels = array_filter(array_map('trim', explode(',', (string) $raw)));
        $allowed = ['in_app', 'email', 'telegram', 'zalo', 'push'];

        $filtered = array_values(array_filter($channels, function ($channel) use ($allowed) {
            return in_array($channel, $allowed, true);
        }));

        return $filtered ?: ['in_app'];
    }

    private function ensureTaskReminder(
        Task $task,
        string $channel,
        string $triggerType,
        Carbon $scheduledAt,
        bool $requireFuture,
        Carbon $now
    ): int {
        if ($requireFuture && $scheduledAt->lte($now)) {
            return 0;
        }
        if (! $requireFuture && $scheduledAt->gt($now)) {
            return 0;
        }

        $exists = DeadlineReminder::query()
            ->where('task_id', $task->id)
            ->whereNull('task_item_id')
            ->where('channel', $channel)
            ->where('trigger_type', $triggerType)
            ->where('scheduled_at', $scheduledAt)
            ->exists();

        if ($exists) {
            return 0;
        }

        DeadlineReminder::create([
            'task_id' => $task->id,
            'task_item_id' => null,
            'channel' => $channel,
            'trigger_type' => $triggerType,
            'scheduled_at' => $scheduledAt,
            'status' => 'pending',
        ]);

        return 1;
    }

    private function ensureItemReminder(
        TaskItem $item,
        string $channel,
        string $triggerType,
        Carbon $scheduledAt,
        bool $requireFuture,
        Carbon $now
    ): int {
        if ($requireFuture && $scheduledAt->lte($now)) {
            return 0;
        }
        if (! $requireFuture && $scheduledAt->gt($now)) {
            return 0;
        }

        $exists = DeadlineReminder::query()
            ->where('task_item_id', $item->id)
            ->where('channel', $channel)
            ->where('trigger_type', $triggerType)
            ->where('scheduled_at', $scheduledAt)
            ->exists();

        if ($exists) {
            return 0;
        }

        DeadlineReminder::create([
            'task_id' => $item->task_id,
            'task_item_id' => $item->id,
            'channel' => $channel,
            'trigger_type' => $triggerType,
            'scheduled_at' => $scheduledAt,
            'status' => 'pending',
        ]);

        return 1;
    }
}
