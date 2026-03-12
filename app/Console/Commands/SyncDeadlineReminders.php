<?php

namespace App\Console\Commands;

use App\Models\DeadlineReminder;
use App\Models\Task;
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

        $created = 0;

        foreach ($tasks as $task) {
            if (! $task->deadline) {
                continue;
            }

            $deadline = $task->deadline->copy();

            foreach ($channels as $channel) {
                $created += $this->ensureReminder(
                    $task,
                    $channel,
                    'days_3',
                    $deadline->copy()->subDays(3),
                    true,
                    $now
                );
                $created += $this->ensureReminder(
                    $task,
                    $channel,
                    'day_1',
                    $deadline->copy()->subDay(),
                    true,
                    $now
                );
                if ($deadline->lte($now)) {
                    $created += $this->ensureReminder(
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
        $allowed = ['in_app', 'email', 'telegram', 'zalo'];

        $filtered = array_values(array_filter($channels, function ($channel) use ($allowed) {
            return in_array($channel, $allowed, true);
        }));

        return $filtered ?: ['in_app'];
    }

    private function ensureReminder(
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
            ->where('channel', $channel)
            ->where('trigger_type', $triggerType)
            ->where('scheduled_at', $scheduledAt)
            ->exists();

        if ($exists) {
            return 0;
        }

        DeadlineReminder::create([
            'task_id' => $task->id,
            'channel' => $channel,
            'trigger_type' => $triggerType,
            'scheduled_at' => $scheduledAt,
            'status' => 'pending',
        ]);

        return 1;
    }
}
