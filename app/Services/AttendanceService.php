<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\AttendanceHoliday;
use App\Models\AttendanceRecord;
use App\Models\AttendanceRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AttendanceService
{
    public const EMPLOYMENT_FULL_TIME = 'full_time';
    public const EMPLOYMENT_HALF_DAY_MORNING = 'half_day_morning';
    public const EMPLOYMENT_HALF_DAY_AFTERNOON = 'half_day_afternoon';

    public function settings(): array
    {
        $defaults = AppSetting::defaults();
        $setting = AppSetting::query()->first();

        return [
            'enabled' => $setting ? (bool) ($setting->attendance_enabled ?? true) : true,
            'work_start_time' => $this->normalizeTime($setting->attendance_work_start_time ?? null, '08:30'),
            'work_end_time' => $this->normalizeTime($setting->attendance_work_end_time ?? null, '17:30'),
            'afternoon_start_time' => $this->normalizeTime($setting->attendance_afternoon_start_time ?? null, '13:30'),
            'late_grace_minutes' => max(0, (int) ($setting->attendance_late_grace_minutes ?? 10)),
            'reminder_enabled' => $setting ? (bool) ($setting->attendance_reminder_enabled ?? true) : true,
            'reminder_minutes_before' => max(0, (int) ($setting->attendance_reminder_minutes_before ?? 10)),
            'brand_name' => (string) ($setting->brand_name ?? ($defaults['brand_name'] ?? config('app.name', 'Jobs ClickOn'))),
        ];
    }

    public function normalizeTime(?string $value, string $fallback): string
    {
        $trimmed = trim((string) $value);
        return preg_match('/^\d{2}:\d{2}$/', $trimmed) ? $trimmed : $fallback;
    }

    public function normalizeWifiValue(?string $value): ?string
    {
        $trimmed = trim(str_replace('"', '', (string) $value));
        return $trimmed === '' ? null : $trimmed;
    }

    public function normalizeBssid(?string $value): ?string
    {
        $normalized = $this->normalizeWifiValue($value);
        return $normalized ? strtolower($normalized) : null;
    }

    public function employmentTypeForUser(User $user): string
    {
        $type = trim((string) ($user->attendance_employment_type ?? self::EMPLOYMENT_FULL_TIME));
        if (! in_array($type, [
            self::EMPLOYMENT_FULL_TIME,
            self::EMPLOYMENT_HALF_DAY_MORNING,
            self::EMPLOYMENT_HALF_DAY_AFTERNOON,
        ], true)) {
            return self::EMPLOYMENT_FULL_TIME;
        }

        return $type;
    }

    public function defaultWorkUnitsForEmployment(string $employmentType): float
    {
        return $employmentType === self::EMPLOYMENT_FULL_TIME ? 1.0 : 0.5;
    }

    public function defaultWorkUnitsForUser(User $user): float
    {
        return $this->defaultWorkUnitsForEmployment($this->employmentTypeForUser($user));
    }

    public function requiredStartAt(User $user, Carbon $date, ?array $settings = null): Carbon
    {
        if ($settings === null) {
            $settings = $this->settings();
        }
        $employmentType = $this->employmentTypeForUser($user);
        $time = $employmentType === self::EMPLOYMENT_HALF_DAY_AFTERNOON
            ? $settings['afternoon_start_time']
            : $settings['work_start_time'];

        [$hour, $minute] = array_map('intval', explode(':', $time));

        return $date->copy()->setTimezone('Asia/Ho_Chi_Minh')->setTime($hour, $minute, 0);
    }

    public function allowedLateUntil(User $user, Carbon $date, ?array $settings = null): Carbon
    {
        if ($settings === null) {
            $settings = $this->settings();
        }

        return $this->requiredStartAt($user, $date, $settings)
            ->copy()
            ->addMinutes((int) $settings['late_grace_minutes']);
    }

    public function evaluateCheckIn(User $user, Carbon $checkedAt, ?array $settings = null): array
    {
        if ($settings === null) {
            $settings = $this->settings();
        }
        $requiredStartAt = $this->requiredStartAt($user, $checkedAt, $settings);
        $allowedLateUntil = $this->allowedLateUntil($user, $checkedAt, $settings);
        $employmentType = $this->employmentTypeForUser($user);
        $defaultWorkUnits = $this->defaultWorkUnitsForEmployment($employmentType);

        // Đúng quy chuẩn: tính muộn từ (giờ bắt đầu + phút cho phép trễ)
        // VD: bắt đầu 08:30, cho phép trễ 10 phút → mốc = 08:40
        //     Check-in 08:42 → muộn 2 phút (không phải 12 phút)
        $isOnTime = $checkedAt->lte($allowedLateUntil);
        $minutesLate = $isOnTime ? 0 : max(0, (int) $allowedLateUntil->diffInMinutes($checkedAt, false));

        return [
            'employment_type' => $employmentType,
            'default_work_units' => $defaultWorkUnits,
            'required_start_at' => $requiredStartAt,
            'allowed_late_until' => $allowedLateUntil,
            'minutes_late' => $minutesLate,
            'work_units' => $defaultWorkUnits,
            'status' => $isOnTime ? 'present' : 'late',
        ];
    }

    public function upsertHolidayRecord(User $user, Carbon $date, ?AttendanceHoliday $holiday = null): AttendanceRecord
    {
        $settings = $this->settings();
        $workDate = $date->copy()->timezone('Asia/Ho_Chi_Minh')->startOfDay();
        $evaluation = $this->evaluateCheckIn($user, $workDate, $settings);

        $record = AttendanceRecord::query()->firstOrNew([
            'user_id' => (int) $user->id,
            'work_date' => $workDate->toDateString(),
        ]);

        if ($record->exists && $record->check_in_at) {
            return $record;
        }

        $record->fill([
            'required_start_at' => $evaluation['required_start_at'],
            'allowed_late_until' => $evaluation['allowed_late_until'],
            'minutes_late' => 0,
            'default_work_units' => $evaluation['default_work_units'],
            'work_units' => $evaluation['default_work_units'],
            'employment_type' => $evaluation['employment_type'],
            'status' => 'holiday_auto',
            'source' => 'holiday_auto',
            'note' => $holiday ? ('Ngày lễ: '.trim((string) $holiday->title)) : 'Ngày lễ được tự động chấm công',
        ]);
        $record->save();

        return $record->refresh();
    }

    public function trackedUsersQuery(): Builder
    {
        return User::query()
            ->where('is_active', true)
            ->whereIn('role', ['admin', 'quan_ly', 'nhan_vien', 'ke_toan']);
    }

    /**
     * @return array<int>|null null = không giới hạn thứ trong tuần
     */
    public function shiftWeekdaysIso(User $user): ?array
    {
        $raw = $user->attendance_shift_weekdays;
        if ($raw === null || $raw === []) {
            return null;
        }
        if (! is_array($raw)) {
            return null;
        }
        $days = [];
        foreach ($raw as $d) {
            $n = (int) $d;
            if ($n >= 1 && $n <= 7) {
                $days[$n] = $n;
            }
        }

        return count($days) ? array_values($days) : null;
    }

    public function earliestCheckinAt(User $user, Carbon $date, ?array $settings = null): Carbon
    {
        if ($settings === null) {
            $settings = $this->settings();
        }
        $t = trim((string) ($user->attendance_earliest_checkin_time ?? ''));
        if ($t === '' || ! preg_match('/^\d{2}:\d{2}$/', $t)) {
            $t = $settings['work_start_time'];
        }
        [$h, $m] = array_map('intval', explode(':', $t));

        return $date->copy()->timezone('Asia/Ho_Chi_Minh')->setTime($h, $m, 0);
    }

    /**
     * Chặn chấm công: sai ngày trong ca hoặc trước giờ được phép mở app chấm.
     */
    public function checkInBlockedReason(User $user, Carbon $now, ?array $settings = null): ?string
    {
        if ($settings === null) {
            $settings = $this->settings();
        }
        $weekdays = $this->shiftWeekdaysIso($user);
        if ($weekdays !== null) {
            $iso = (int) $now->dayOfWeekIso;
            if (! in_array($iso, $weekdays, true)) {
                return 'Hôm nay không nằm trong lịch làm việc được phân ca. Bạn không thể chấm công.';
            }
        }

        $earliest = $this->earliestCheckinAt($user, $now, $settings);
        if ($now->lt($earliest)) {
            return sprintf(
                'Chưa đến giờ được phép chấm công (từ %s).',
                $earliest->format('H:i')
            );
        }

        return null;
    }

    public function applyApprovedRequest(AttendanceRequest $attendanceRequest, User $approver): ?AttendanceRecord
    {
        $user = $attendanceRequest->user;
        if (! $user) {
            return null;
        }

        $settings = $this->settings();
        $type = (string) $attendanceRequest->request_type;

        if ($type === 'leave_request') {
            return $this->applyApprovedLeaveRequest($attendanceRequest, $approver, $settings);
        }

        return $this->applyApprovedLateRequest($attendanceRequest, $approver, $settings);
    }

    private function applyApprovedLeaveRequest(
        AttendanceRequest $attendanceRequest,
        User $approver,
        array $settings
    ): ?AttendanceRecord {
        $user = $attendanceRequest->user;
        if (! $user) {
            return null;
        }

        $mode = trim((string) ($attendanceRequest->approval_mode ?? 'full_work'));
        if ($mode === 'no_count') {
            return null;
        }
        if ($mode !== 'full_work') {
            $mode = 'full_work';
        }

        $start = Carbon::parse($attendanceRequest->request_date, 'Asia/Ho_Chi_Minh')->startOfDay();
        $endRaw = $attendanceRequest->request_end_date ?? $attendanceRequest->request_date;
        $end = Carbon::parse($endRaw, 'Asia/Ho_Chi_Minh')->startOfDay();
        if ($end->lt($start)) {
            [$start, $end] = [$end, $start];
        }

        $last = null;
        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            $last = $this->upsertLeaveApprovedDay($user, $cursor, $attendanceRequest, $approver, $settings);
            $cursor->addDay();
        }

        return $last;
    }

    private function upsertLeaveApprovedDay(
        User $user,
        Carbon $day,
        AttendanceRequest $attendanceRequest,
        User $approver,
        array $settings
    ): AttendanceRecord {
        $evaluation = $this->evaluateCheckIn($user, $day->copy()->setTime(12, 0), $settings);
        $defaultWorkUnits = (float) $evaluation['default_work_units'];

        $record = AttendanceRecord::query()->firstOrNew([
            'user_id' => (int) $user->id,
            'work_date' => $day->toDateString(),
        ]);

        $existingNote = trim((string) ($record->note ?? ''));
        $decisionNote = trim((string) ($attendanceRequest->decision_note ?? ''));
        $noteParts = array_values(array_filter([$existingNote, $decisionNote]));

        $record->fill([
            'required_start_at' => $evaluation['required_start_at'],
            'allowed_late_until' => $evaluation['allowed_late_until'],
            'minutes_late' => 0,
            'default_work_units' => $defaultWorkUnits,
            'work_units' => $defaultWorkUnits,
            'employment_type' => $evaluation['employment_type'],
            'status' => 'approved_full',
            'source' => 'request_approval',
            'attendance_request_id' => (int) $attendanceRequest->id,
            'approved_by' => (int) $approver->id,
            'edited_after_wifi' => true,
            'note' => empty($noteParts) ? null : implode("\n", $noteParts),
        ]);
        $record->save();

        return $record->refresh();
    }

    private function applyApprovedLateRequest(
        AttendanceRequest $attendanceRequest,
        User $approver,
        array $settings
    ): ?AttendanceRecord {
        $user = $attendanceRequest->user;
        if (! $user) {
            return null;
        }

        $mode = trim((string) ($attendanceRequest->approval_mode ?? 'full_work'));
        if (! in_array($mode, ['full_work', 'no_change'], true)) {
            $mode = 'full_work';
        }

        $date = Carbon::parse($attendanceRequest->request_date, 'Asia/Ho_Chi_Minh')->startOfDay();
        $baseline = $this->evaluateCheckIn($user, $date->copy()->setTime(12, 0), $settings);
        $defaultWorkUnits = (float) $baseline['default_work_units'];

        $expectedTime = trim((string) ($attendanceRequest->expected_check_in_time ?? ''));
        $requiredStartAt = $baseline['required_start_at'];
        $allowedLateUntil = $baseline['allowed_late_until'];
        if ($expectedTime !== '' && preg_match('/^\d{2}:\d{2}$/', $expectedTime)) {
            [$hour, $minute] = array_map('intval', explode(':', $expectedTime));
            $requiredStartAt = $date->copy()->setTime($hour, $minute, 0);
            $allowedLateUntil = $requiredStartAt->copy()->addMinutes((int) $settings['late_grace_minutes']);
        }

        $record = AttendanceRecord::query()->firstOrNew([
            'user_id' => (int) $user->id,
            'work_date' => $date->toDateString(),
        ]);

        $actualForLate = $record->check_in_at;
        if (! $actualForLate && $expectedTime !== '' && preg_match('/^\d{2}:\d{2}$/', $expectedTime)) {
            [$hour, $minute] = array_map('intval', explode(':', $expectedTime));
            $actualForLate = $date->copy()->setTime($hour, $minute, 0);
        }

        $minutesLate = 0;
        if ($actualForLate) {
            $minutesLate = $actualForLate->lte($allowedLateUntil)
                ? 0
                : max(0, (int) $allowedLateUntil->diffInMinutes($actualForLate, false));
        }

        $workUnits = $mode === 'no_change'
            ? (float) ($record->work_units ?? $defaultWorkUnits)
            : $defaultWorkUnits;

        $status = $workUnits >= $defaultWorkUnits ? 'approved_full' : 'approved_partial';
        $existingNote = trim((string) ($record->note ?? ''));
        $decisionNote = trim((string) ($attendanceRequest->decision_note ?? ''));
        $noteParts = array_values(array_filter([$existingNote, $decisionNote]));

        $record->fill([
            'required_start_at' => $requiredStartAt,
            'allowed_late_until' => $allowedLateUntil,
            'check_in_at' => $record->check_in_at ?: ($actualForLate ?: null),
            'minutes_late' => (int) $minutesLate,
            'default_work_units' => $defaultWorkUnits,
            'work_units' => $workUnits,
            'employment_type' => $baseline['employment_type'],
            'status' => $status,
            'source' => 'request_approval',
            'attendance_request_id' => (int) $attendanceRequest->id,
            'approved_by' => (int) $approver->id,
            'edited_after_wifi' => true,
            'note' => empty($noteParts) ? null : implode("\n", $noteParts),
        ]);
        $record->save();

        return $record->refresh();
    }

    public function logRecordEdit(
        AttendanceRecord $record,
        ?User $actor,
        string $action,
        array $payload = []
    ): void {
        DB::table('attendance_record_edit_logs')->insert([
            'attendance_record_id' => $record->id,
            'actor_id' => $actor?->id,
            'action' => $action,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
