<?php

namespace App\Console\Commands;

use App\Models\AttendanceRecord;
use App\Models\User;
use App\Services\AttendanceService;
use Illuminate\Console\Command;

class RecalculateAttendanceRecords extends Command
{
    protected $signature = 'attendance:recalculate {--dry-run : Chỉ xem trước kết quả, không lưu DB}';
    protected $description = 'Tính lại work_units và minutes_late cho tất cả bản ghi chấm công đi muộn (late_pending, late) dựa trên nghiệp vụ mới.';

    public function handle(AttendanceService $attendance): int
    {
        $dryRun = $this->option('dry-run');
        $settings = $attendance->settings();

        $records = AttendanceRecord::query()
            ->whereIn('status', ['late_pending', 'late'])
            ->whereNotNull('check_in_at')
            ->with('user')
            ->get();

        $this->info(sprintf('Tìm thấy %d bản ghi cần tính lại.', $records->count()));

        $updated = 0;
        foreach ($records as $record) {
            /** @var AttendanceRecord $record */
            $user = $record->user;
            if (!$user) {
                $this->warn(sprintf('  [SKIP] Record #%d: user_id=%d không tồn tại.', $record->id, $record->user_id));
                continue;
            }

            $checkedAt = $record->check_in_at;
            if (!$checkedAt) {
                continue;
            }

            $evaluation = $attendance->evaluateCheckIn($user, $checkedAt, $settings);

            $oldUnits = (float) $record->work_units;
            $oldMinutes = (int) $record->minutes_late;
            $oldStatus = (string) $record->status;

            $newUnits = (float) $evaluation['work_units'];
            $newMinutes = (int) $evaluation['minutes_late'];
            $newStatus = (string) $evaluation['status'];

            $this->line(sprintf(
                '  Record #%d (%s) | %s | Cũ: %.2f công, %d phút muộn, %s → Mới: %.2f công, %d phút muộn, %s',
                $record->id,
                $record->work_date?->toDateString() ?? '—',
                $user->name ?? '—',
                $oldUnits,
                $oldMinutes,
                $oldStatus,
                $newUnits,
                $newMinutes,
                $newStatus
            ));

            if (!$dryRun) {
                $record->update([
                    'work_units' => $newUnits,
                    'minutes_late' => $newMinutes,
                    'status' => $newStatus,
                    'required_start_at' => $evaluation['required_start_at'],
                    'allowed_late_until' => $evaluation['allowed_late_until'],
                    'default_work_units' => (float) $evaluation['default_work_units'],
                    'employment_type' => (string) $evaluation['employment_type'],
                ]);
                $updated++;
            }
        }

        if ($dryRun) {
            $this->warn('Dry-run: không có bản ghi nào được cập nhật thực tế.');
        } else {
            $this->info(sprintf('Đã cập nhật thành công %d bản ghi.', $updated));
        }

        return self::SUCCESS;
    }
}
