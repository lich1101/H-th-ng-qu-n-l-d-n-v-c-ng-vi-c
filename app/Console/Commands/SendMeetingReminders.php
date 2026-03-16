<?php

namespace App\Console\Commands;

use App\Models\AppSetting;
use App\Models\MeetingReminderLog;
use App\Models\ProjectMeeting;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendMeetingReminders extends Command
{
    protected $signature = 'meetings:send-reminders';

    protected $description = 'Gửi nhắc lịch họp trước 1 giờ cho người tham dự';

    public function handle(): int
    {
        $setting = AppSetting::query()->first();
        $minutesBefore = max(1, (int) ($setting->meeting_reminder_minutes_before ?? 60));
        $timezone = config('app.timezone', 'Asia/Ho_Chi_Minh');
        $windowStart = now()->addMinutes($minutesBefore)->subMinute();
        $windowEnd = now()->addMinutes($minutesBefore)->addMinute();
        $reminderType = 'before_'.$minutesBefore.'_minutes';
        $title = $minutesBefore === 60
            ? 'Nhắc lịch họp: còn 1 giờ'
            : 'Nhắc lịch họp: còn '.$minutesBefore.' phút';
        $sentCount = 0;

        $meetings = ProjectMeeting::query()
            ->with(['attendees'])
            ->whereBetween('scheduled_at', [$windowStart, $windowEnd])
            ->get();

        if ($meetings->isEmpty()) {
            $this->info('Không có lịch họp cần nhắc trong cửa sổ hiện tại.');
            return self::SUCCESS;
        }

        $notifier = app(NotificationService::class);

        foreach ($meetings as $meeting) {
            $attendeeIds = $meeting->attendees
                ->pluck('user_id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function ($id) {
                    return $id > 0;
                })
                ->unique()
                ->values();

            if ($attendeeIds->isEmpty()) {
                continue;
            }

            $alreadySentIds = MeetingReminderLog::query()
                ->where('meeting_id', $meeting->id)
                ->where('reminder_type', $reminderType)
                ->whereIn('user_id', $attendeeIds->all())
                ->pluck('user_id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->all();

            $targetIds = $attendeeIds
                ->reject(function ($id) use ($alreadySentIds) {
                    return in_array((int) $id, $alreadySentIds, true);
                })
                ->values();

            if ($targetIds->isEmpty()) {
                continue;
            }

            $scheduled = Carbon::parse($meeting->scheduled_at)
                ->timezone($timezone)
                ->format('d/m/Y H:i');

            try {
                $notifier->notifyUsers(
                    $targetIds->all(),
                    $title,
                    "{$meeting->title} lúc {$scheduled}",
                    [
                        'type' => 'meeting_reminder_'.$minutesBefore.'m',
                        'meeting_id' => $meeting->id,
                        'scheduled_at' => optional($meeting->scheduled_at)->toIso8601String(),
                    ]
                );
            } catch (\Throwable $e) {
                report($e);
                continue;
            }

            $rows = $targetIds->map(function ($userId) use ($meeting) {
                return [
                    'meeting_id' => $meeting->id,
                    'user_id' => (int) $userId,
                    'reminder_type' => $reminderType,
                    'sent_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            })->all();

            if (! empty($rows)) {
                MeetingReminderLog::query()->insert($rows);
                $sentCount += count($rows);
            }
        }

        $this->info("Đã gửi {$sentCount} nhắc lịch họp.");

        return self::SUCCESS;
    }
}
