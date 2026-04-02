<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\AttendanceHoliday;
use App\Models\AttendanceRecord;
use App\Models\AttendanceRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

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
        
        // Lấy thời điểm kết thúc theo ca làm việc
        $endTimeSetting = $employmentType === self::EMPLOYMENT_HALF_DAY_MORNING 
            ? $settings['afternoon_start_time'] 
            : $settings['work_end_time'];
        [$endHour, $endMinute] = array_map('intval', explode(':', $endTimeSetting));
        $endAt = $checkedAt->copy()->setTimezone('Asia/Ho_Chi_Minh')->setTime($endHour, $endMinute, 0);

        // Đúng quy chuẩn: tính muộn từ (giờ bắt đầu + phút cho phép trễ)
        // VD: bắt đầu 08:30, cho phép trễ 10 phút → mốc = 08:40
        //     Check-in 08:42 → muộn 2 phút (không phải 12 phút)
        $isOnTime = $checkedAt->lte($allowedLateUntil);
        $minutesLate = $isOnTime ? 0 : max(0, (int) $allowedLateUntil->diffInMinutes($checkedAt, false));

        // Tính công thực tế: lấy tổng phút ca trừ đi số phút muộn thực sự
        $calculatedWorkUnits = $defaultWorkUnits;
        if (!$isOnTime && $minutesLate > 0) {
            $totalDayMinutes = max(1, (int) $requiredStartAt->diffInMinutes($endAt));
            $workedMinutes = max(0, $totalDayMinutes - $minutesLate);
            $fraction = $workedMinutes / $totalDayMinutes;
            $calculatedWorkUnits = round($defaultWorkUnits * $fraction, 1);
        }

        return [
            'employment_type' => $employmentType,
            'default_work_units' => $defaultWorkUnits,
            'required_start_at' => $requiredStartAt,
            'allowed_late_until' => $allowedLateUntil,
            'minutes_late' => $minutesLate,
            'work_units' => $calculatedWorkUnits,
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

    public function applyApprovedRequest(AttendanceRequest $attendanceRequest, User $approver): ?AttendanceRecord
    {
        $user = $attendanceRequest->user;
        if (! $user) {
            return null;
        }

        $date = Carbon::parse($attendanceRequest->request_date, 'Asia/Ho_Chi_Minh')->startOfDay();
        $settings = $this->settings();
        $evaluation = $this->evaluateCheckIn($user, $date, $settings);
        $approvalMode = trim((string) ($attendanceRequest->approval_mode ?? ''));

        if ($approvalMode === 'no_change') {
            return AttendanceRecord::query()
                ->where('user_id', $user->id)
                ->whereDate('work_date', $date->toDateString())
                ->first();
        }

        $defaultWorkUnits = (float) $evaluation['default_work_units'];
        $approvedUnits = is_numeric($attendanceRequest->approved_work_units)
            ? max(0.0, (float) $attendanceRequest->approved_work_units)
            : null;

        if ($approvalMode === 'full_work') {
            $approvedUnits = $defaultWorkUnits;
        }

        if ($approvedUnits === null) {
            $approvedUnits = $defaultWorkUnits;
        }

        $record = AttendanceRecord::query()->firstOrNew([
            'user_id' => (int) $user->id,
            'work_date' => $date->toDateString(),
        ]);

        $status = $approvedUnits >= $defaultWorkUnits ? 'approved_full' : 'approved_partial';
        $existingNote = trim((string) ($record->note ?? ''));
        $decisionNote = trim((string) ($attendanceRequest->decision_note ?? ''));
        $noteParts = array_values(array_filter([$existingNote, $decisionNote]));

        $record->fill([
            'required_start_at' => $record->required_start_at ?: $evaluation['required_start_at'],
            'allowed_late_until' => $record->allowed_late_until ?: $evaluation['allowed_late_until'],
            'minutes_late' => max((int) ($record->minutes_late ?? 0), (int) $evaluation['minutes_late']),
            'default_work_units' => $defaultWorkUnits,
            'work_units' => $approvedUnits,
            'employment_type' => $evaluation['employment_type'],
            'status' => $status,
            'source' => 'request_approval',
            'attendance_request_id' => (int) $attendanceRequest->id,
            'approved_by' => (int) $approver->id,
            'note' => empty($noteParts) ? null : implode("\n", $noteParts),
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
}
