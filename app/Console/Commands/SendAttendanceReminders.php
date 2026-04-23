<?php

namespace App\Console\Commands;

use App\Models\AttendanceRecord;
use App\Models\AttendanceReminderLog;
use App\Models\AttendanceHoliday;
use App\Services\AttendanceService;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendAttendanceReminders extends Command
{
    protected $signature = 'attendance:send-reminders';
    protected $description = 'Gửi push nhắc chấm công trước giờ làm cho nhân sự thuộc diện attendance.';

    public function handle(AttendanceService $attendance, NotificationService $notifications): int
    {
        $settings = $attendance->settings();
        if (! $settings['enabled'] || ! $settings['reminder_enabled']) {
            return self::SUCCESS;
        }

        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $today = $now->toDateString();
        $minutesBefore = max(0, (int) ($settings['reminder_minutes_before'] ?? 10));

        $isHoliday = AttendanceHoliday::query()
            ->where('is_active', true)
            ->coveringDate($today)
            ->exists();

        if ($isHoliday) {
            return self::SUCCESS;
        }

        $attendance->trackedUsersQuery()
            ->get()
            ->each(function ($user) use ($attendance, $notifications, $now, $today, $minutesBefore) {
                $plannedUnits = (float) $attendance->defaultWorkUnitsForUserOnDate($user, $now->copy());
                if ($plannedUnits <= 0) {
                    return;
                }

                $shiftDays = $attendance->shiftWeekdaysIso($user);
                if (is_array($shiftDays) && count($shiftDays) > 0) {
                    $iso = (int) $now->copy()->dayOfWeekIso;
                    if (! in_array($iso, $shiftDays, true)) {
                        return;
                    }
                }

                $recordExists = AttendanceRecord::query()
                    ->where('user_id', $user->id)
                    ->whereDate('work_date', $today)
                    ->where(function ($query) {
                        $query->whereNotNull('check_in_at')
                            ->orWhereIn('status', ['approved_full', 'approved_partial', 'approved_no_count', 'holiday_auto'])
                            ->orWhereIn('source', ['request_approval', 'manual_adjustment', 'holiday_auto']);
                    })
                    ->exists();

                if ($recordExists) {
                    return;
                }

                $requiredStart = $attendance->requiredStartAt($user, $now->copy());
                $remindAt = $requiredStart->copy()->subMinutes($minutesBefore);

                if ($now->format('H:i') !== $remindAt->format('H:i')) {
                    return;
                }

                $alreadySent = AttendanceReminderLog::query()
                    ->where('user_id', $user->id)
                    ->whereDate('reminder_date', $today)
                    ->where('reminder_type', 'check_in')
                    ->exists();

                if ($alreadySent) {
                    return;
                }

                $notifications->notifyUsers(
                    [(int) $user->id],
                    'Sắp đến giờ chấm công',
                    sprintf(
                        'Còn %d phút đến giờ vào làm (%s). Vui lòng mở app và chấm công đúng WiFi công ty.',
                        $minutesBefore,
                        $requiredStart->format('H:i')
                    ),
                    [
                        'type' => 'attendance_checkin_reminder',
                        'category' => 'attendance',
                        'work_date' => $today,
                    ]
                );

                AttendanceReminderLog::create([
                    'user_id' => (int) $user->id,
                    'reminder_date' => $today,
                    'reminder_type' => 'check_in',
                    'sent_at' => $now->copy(),
                ]);
            });

        return self::SUCCESS;
    }
}
