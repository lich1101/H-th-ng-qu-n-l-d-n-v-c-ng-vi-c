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

                $result = $this->deliverReminder($reminder, $message);
                $status = $result['status'] ?? 'pending';
                $note = $result['note'] ?? null;
                $payload = $note ? json_encode([
                    'note' => $note,
                    'updated_at' => now()->toDateTimeString(),
                ]) : null;

                if ($status === 'sent') {
                    $reminder->update([
                        'status' => 'sent',
                        'sent_at' => now(),
                        'payload' => $payload,
                    ]);
                } elseif ($status === 'cancelled') {
                    $reminder->update([
                        'status' => 'cancelled',
                        'payload' => $payload,
                    ]);
                } else {
                    $reminder->update([
                        'payload' => $payload,
                    ]);
                }
            } catch (\Throwable $exception) {
                $this->warn('Reminder failed: '.$reminder->id.' - '.$exception->getMessage());
            }
        }

        $this->info('Processed reminders: '.$reminders->count());

        return self::SUCCESS;
    }

    private function deliverReminder(DeadlineReminder $reminder, string $message): array
    {
        $channel = $reminder->channel;

        if ($channel === 'in_app') {
            return ['status' => 'sent', 'note' => 'in_app'];
        }

        if ($channel === 'email') {
            $task = $reminder->task;
            $email = $task && $task->assignee ? $task->assignee->email : null;
            if (! $email) {
                return ['status' => 'cancelled', 'note' => 'missing_email'];
            }
            Mail::raw($message, function ($mail) use ($email) {
                $mail->to($email)->subject('Nhắc nhở deadline công việc');
            });

            return ['status' => 'sent'];
        }

        if ($channel === 'telegram') {
            return $this->sendTelegram($message);
        }

        if ($channel === 'zalo') {
            return $this->sendZalo($message);
        }

        return ['status' => 'cancelled', 'note' => 'unknown_channel'];
    }

    private function sendTelegram(string $message): array
    {
        $botToken = env('TELEGRAM_BOT_TOKEN');
        $chatId = env('TELEGRAM_CHAT_ID');

        if (! empty($botToken) && ! empty($chatId)) {
            $response = Http::timeout(8)->post(
                'https://api.telegram.org/bot'.$botToken.'/sendMessage',
                [
                    'chat_id' => $chatId,
                    'text' => $message,
                ]
            );

            if ($response->successful()) {
                return ['status' => 'sent'];
            }

            return ['status' => 'pending', 'note' => 'telegram_http_'.$response->status()];
        }

        $webhook = env('DEADLINE_TELEGRAM_WEBHOOK');
        if (! empty($webhook)) {
            $ok = $this->sendWebhook($webhook, $message);
            return $ok ? ['status' => 'sent'] : ['status' => 'pending', 'note' => 'telegram_webhook_failed'];
        }

        return ['status' => 'pending', 'note' => 'telegram_not_configured'];
    }

    private function sendZalo(string $message): array
    {
        $accessToken = env('ZALO_OA_ACCESS_TOKEN');
        $recipientId = env('ZALO_OA_RECIPIENT_ID');
        $apiUrl = env('ZALO_OA_API_URL', 'https://openapi.zalo.me/v3.0/oa/message');

        if (! empty($accessToken) && ! empty($recipientId)) {
            $response = Http::timeout(8)
                ->withToken($accessToken)
                ->post($apiUrl, [
                    'recipient' => ['user_id' => $recipientId],
                    'message' => ['text' => $message],
                ]);

            if ($response->successful()) {
                return ['status' => 'sent'];
            }

            return ['status' => 'pending', 'note' => 'zalo_http_'.$response->status()];
        }

        $webhook = env('DEADLINE_ZALO_WEBHOOK');
        if (! empty($webhook)) {
            $ok = $this->sendWebhook($webhook, $message);
            return $ok ? ['status' => 'sent'] : ['status' => 'pending', 'note' => 'zalo_webhook_failed'];
        }

        return ['status' => 'pending', 'note' => 'zalo_not_configured'];
    }

    private function sendWebhook(?string $url, string $message): bool
    {
        if (empty($url)) {
            return false;
        }

        $response = Http::timeout(8)->post($url, [
            'text' => $message,
            'message' => $message,
        ]);

        return $response->successful();
    }
}
