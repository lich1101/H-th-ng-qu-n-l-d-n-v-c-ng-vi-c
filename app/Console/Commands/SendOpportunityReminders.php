<?php

namespace App\Console\Commands;

use App\Models\AppSetting;
use App\Models\Opportunity;
use App\Models\OpportunityReminderLog;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendOpportunityReminders extends Command
{
    protected $signature = 'opportunities:send-reminders {--run-now : Chạy ngay, bỏ qua khung giờ cố định}';
    protected $description = 'Gửi nhắc hạn cơ hội cho người phụ trách và người theo dõi ở mốc 3 ngày và 1 ngày trước hạn.';

    public function handle(NotificationService $notifications): int
    {
        $now = Carbon::now('Asia/Ho_Chi_Minh');
        if (! $this->option('run-now') && ! $this->matchesTime($now, $this->reminderTime())) {
            return self::SUCCESS;
        }

        $today = $now->copy()->startOfDay();
        $fromDate = $today->copy()->addDay()->toDateString();
        $toDate = $today->copy()->addDays(3)->toDateString();

        $opportunities = Opportunity::query()
            ->with(['client:id,name,company'])
            ->whereNotNull('expected_close_date')
            ->whereBetween('expected_close_date', [$fromDate, $toDate])
            ->whereDoesntHave('contract')
            ->get();

        foreach ($opportunities as $opportunity) {
            $expected = $opportunity->expected_close_date
                ? Carbon::parse($opportunity->expected_close_date, 'Asia/Ho_Chi_Minh')->startOfDay()
                : null;
            if (! $expected) {
                continue;
            }

            $daysLeft = $today->diffInDays($expected, false);
            if (! in_array($daysLeft, [3, 1], true)) {
                continue;
            }

            $type = $daysLeft === 3 ? 'before_3_days' : 'before_1_day';
            $targetUserIds = $this->targetUserIds($opportunity);
            if (empty($targetUserIds)) {
                continue;
            }

            $title = $daysLeft === 1
                ? 'Cơ hội sắp hết hạn (còn 1 ngày)'
                : 'Cơ hội sắp hết hạn (còn 3 ngày)';
            $body = sprintf(
                '%s • Khách hàng: %s • Hạn dự kiến: %s',
                (string) ($opportunity->title ?: ('Cơ hội #'.$opportunity->id)),
                (string) ($opportunity->client->name ?? 'Chưa có khách hàng'),
                $expected->format('d/m/Y')
            );

            foreach ($targetUserIds as $userId) {
                if ($this->alreadySent((int) $opportunity->id, (int) $userId, $type, $today)) {
                    continue;
                }

                $notifications->notifyUsers(
                    [(int) $userId],
                    $title,
                    $body,
                    [
                        'type' => 'opportunity_due_reminder',
                        'category' => 'crm_realtime',
                        'opportunity_id' => (int) $opportunity->id,
                        'days_left' => $daysLeft,
                        'expected_close_date' => $expected->toDateString(),
                    ]
                );

                OpportunityReminderLog::query()->create([
                    'opportunity_id' => (int) $opportunity->id,
                    'user_id' => (int) $userId,
                    'reminder_type' => $type,
                    'reminder_date' => $today->toDateString(),
                    'sent_at' => $now->copy(),
                ]);
            }
        }

        return self::SUCCESS;
    }

    /**
     * @return array<int, int>
     */
    private function targetUserIds(Opportunity $opportunity): array
    {
        $ids = [];

        if ($opportunity->assigned_to) {
            $ids[] = (int) $opportunity->assigned_to;
        }

        if (is_array($opportunity->watcher_ids)) {
            foreach ($opportunity->watcher_ids as $watcherId) {
                $id = (int) $watcherId;
                if ($id > 0) {
                    $ids[] = $id;
                }
            }
        }

        $ids = array_values(array_unique(array_filter($ids)));
        if (empty($ids)) {
            return [];
        }

        return User::query()
            ->whereIn('id', $ids)
            ->where('is_active', true)
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->values()
            ->all();
    }

    private function alreadySent(int $opportunityId, int $userId, string $type, Carbon $today): bool
    {
        return OpportunityReminderLog::query()
            ->where('opportunity_id', $opportunityId)
            ->where('user_id', $userId)
            ->where('reminder_type', $type)
            ->whereDate('reminder_date', $today->toDateString())
            ->exists();
    }

    private function reminderTime(): string
    {
        $defaults = AppSetting::defaults();
        $value = trim((string) ($defaults['contract_expiry_reminder_time'] ?? '09:00'));
        $setting = AppSetting::query()->first();
        if ($setting && preg_match('/^\d{2}:\d{2}$/', (string) $setting->contract_expiry_reminder_time)) {
            $value = (string) $setting->contract_expiry_reminder_time;
        }

        return $value;
    }

    private function matchesTime(Carbon $now, string $time): bool
    {
        $value = trim($time);
        if (! preg_match('/^\d{2}:\d{2}$/', $value)) {
            return false;
        }

        return $now->format('H:i') === $value;
    }
}

