<?php

namespace App\Console\Commands;

use App\Models\DeadlineReminder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

class SendDeadlineReminders extends Command
{
    protected $signature = 'reminders:send-deadline';
    protected $description = 'Send pending deadline reminders by channel';

    public function handle(): int
    {
        $reminders = DeadlineReminder::query()
            ->where('status', 'pending')
            ->where('scheduled_at', '<=', now())
            ->with('task.assignee')
            ->limit(100)
            ->get();

        foreach ($reminders as $reminder) {
            try {
                $task = $reminder->task;
                $title = $task ? $task->title : 'Task';
                $message = sprintf(
                    '[%s] Nhắc deadline cho task: %s',
                    strtoupper($reminder->trigger_type),
                    $title
                );

                if ($reminder->channel === 'email') {
                    $email = $task && $task->assignee ? $task->assignee->email : null;
                    if ($email) {
                        Mail::raw($message, function ($mail) use ($email) {
                            $mail->to($email)->subject('Nhắc nhở deadline công việc');
                        });
                    }
                } elseif ($reminder->channel === 'telegram') {
                    $this->sendWebhook(env('DEADLINE_TELEGRAM_WEBHOOK'), $message);
                } elseif ($reminder->channel === 'zalo') {
                    $this->sendWebhook(env('DEADLINE_ZALO_WEBHOOK'), $message);
                }

                $reminder->update([
                    'status' => 'sent',
                    'sent_at' => now(),
                ]);
            } catch (\Throwable $exception) {
                $this->warn('Reminder failed: '.$reminder->id.' - '.$exception->getMessage());
            }
        }

        $this->info('Processed reminders: '.$reminders->count());

        return self::SUCCESS;
    }

    private function sendWebhook(?string $url, string $message): void
    {
        if (empty($url)) {
            return;
        }

        Http::timeout(8)->post($url, [
            'text' => $message,
            'message' => $message,
        ]);
    }
}
