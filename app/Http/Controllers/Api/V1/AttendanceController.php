<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\AttendanceDevice;
use App\Models\AttendanceHoliday;
use App\Models\Department;
use App\Models\AttendanceRecord;
use App\Models\AttendanceReminderLog;
use App\Models\AttendanceRequest as AttendanceRequestModel;
use App\Models\AttendanceWorkType;
use App\Models\AttendanceWifiNetwork;
use App\Models\User;
use App\Services\AttendanceService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
class AttendanceController extends Controller
{
    public function dashboard(Request $request, AttendanceService $attendance): JsonResponse
    {
        $user = $request->user();
        $today = Carbon::now('Asia/Ho_Chi_Minh')->toDateString();
        $settings = $attendance->settings();
        $todayRecord = AttendanceRecord::query()
            ->where('user_id', $user->id)
            ->whereDate('work_date', $today)
            ->first();
        $device = AttendanceDevice::query()->where('user_id', $user->id)->first();
        $recentRequests = AttendanceRequestModel::query()
            ->with(['decider:id,name'])
            ->where('user_id', $user->id)
            ->orderByDesc('request_date')
            ->orderByDesc('id')
            ->limit(10)
            ->get();

        $nowTz = Carbon::now('Asia/Ho_Chi_Minh');
        $checkBlock = $this->canTrackAttendance($user)
            ? $attendance->checkInBlockedReason($user, $nowTz, $settings)
            : null;

        return response()->json([
            'settings' => $settings,
            'today_record' => $todayRecord ? $this->recordPayload($todayRecord) : null,
            'device' => $device ? $this->devicePayload($device) : null,
            'recent_requests' => $recentRequests->map(function (AttendanceRequestModel $item) {
                return $this->attendanceRequestPayload($item);
            })->values(),
            'can_manage_attendance' => $this->canManageAttendance($user),
            'check_in_allowed' => $checkBlock === null,
            'check_in_block_reason' => $checkBlock,
            'shift_weekdays' => $attendance->shiftWeekdaysIso($user),
            'earliest_checkin_time' => $user->attendance_earliest_checkin_time
                ?: ($settings['work_start_time'] ?? '08:30'),
            'pending_counts' => $this->canManageAttendance($user)
                ? [
                    'devices' => AttendanceDevice::query()->where('status', 'pending')->count(),
                    'requests' => AttendanceRequestModel::query()->where('status', 'pending')->count(),
                ]
                : null,
        ]);
    }

    public function settingsShow(Request $request, AttendanceService $attendance): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xem cấu hình chấm công.'], 403);
        }

        return response()->json($attendance->settings());
    }

    public function settingsUpdate(Request $request, AttendanceService $attendance): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật cấu hình chấm công.'], 403);
        }

        $validated = $request->validate([
            'attendance_enabled' => ['nullable', 'boolean'],
            'attendance_work_start_time' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'attendance_work_end_time' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'attendance_afternoon_start_time' => ['required', 'regex:/^\d{2}:\d{2}$/'],
            'attendance_late_grace_minutes' => ['required', 'integer', 'min:0', 'max:240'],
            'attendance_reminder_enabled' => ['nullable', 'boolean'],
            'attendance_reminder_minutes_before' => ['nullable', 'integer', 'min:0', 'max:120'],
        ]);

        $setting = AppSetting::query()->first();
        if (! $setting) {
            $setting = AppSetting::create(AppSetting::defaults());
        }

        $setting->update([
            'attendance_enabled' => array_key_exists('attendance_enabled', $validated)
                ? (bool) $validated['attendance_enabled']
                : (bool) ($setting->attendance_enabled ?? true),
            'attendance_work_start_time' => $attendance->normalizeTime($validated['attendance_work_start_time'], '08:30'),
            'attendance_work_end_time' => $attendance->normalizeTime($validated['attendance_work_end_time'], '17:30'),
            'attendance_afternoon_start_time' => $attendance->normalizeTime($validated['attendance_afternoon_start_time'], '13:30'),
            'attendance_late_grace_minutes' => (int) $validated['attendance_late_grace_minutes'],
            'attendance_reminder_enabled' => array_key_exists('attendance_reminder_enabled', $validated)
                ? (bool) $validated['attendance_reminder_enabled']
                : (bool) ($setting->attendance_reminder_enabled ?? true),
            'attendance_reminder_minutes_before' => array_key_exists('attendance_reminder_minutes_before', $validated)
                ? (int) $validated['attendance_reminder_minutes_before']
                : (int) ($setting->attendance_reminder_minutes_before ?? 10),
            'updated_by' => $request->user()->id,
        ]);

        return response()->json($attendance->settings());
    }

    public function wifiIndex(Request $request): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xem danh sách WiFi.'], 403);
        }

        $rows = AttendanceWifiNetwork::query()
            ->orderByDesc('is_active')
            ->orderBy('ssid')
            ->orderBy('bssid')
            ->get();

        return response()->json([
            'data' => $rows->map(function (AttendanceWifiNetwork $item) {
                return $this->wifiPayload($item);
            })->values(),
        ]);
    }

    public function wifiStore(Request $request, AttendanceService $attendance): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền cấu hình WiFi.'], 403);
        }

        $validated = $request->validate([
            'ssid' => ['required', 'string', 'max:120'],
            'bssid' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $row = AttendanceWifiNetwork::create([
            'ssid' => trim((string) $validated['ssid']),
            'bssid' => $attendance->normalizeBssid($validated['bssid'] ?? null),
            'note' => trim((string) ($validated['note'] ?? '')) ?: null,
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Đã thêm WiFi được phép.',
            'item' => $this->wifiPayload($row),
        ], 201);
    }

    public function wifiUpdate(Request $request, AttendanceWifiNetwork $attendanceWifiNetwork, AttendanceService $attendance): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật WiFi.'], 403);
        }

        $validated = $request->validate([
            'ssid' => ['required', 'string', 'max:120'],
            'bssid' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $attendanceWifiNetwork->update([
            'ssid' => trim((string) $validated['ssid']),
            'bssid' => $attendance->normalizeBssid($validated['bssid'] ?? null),
            'note' => trim((string) ($validated['note'] ?? '')) ?: null,
            'is_active' => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : (bool) $attendanceWifiNetwork->is_active,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Đã cập nhật WiFi được phép.',
            'item' => $this->wifiPayload($attendanceWifiNetwork->fresh()),
        ]);
    }

    public function wifiDestroy(Request $request, AttendanceWifiNetwork $attendanceWifiNetwork): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xóa WiFi.'], 403);
        }

        $attendanceWifiNetwork->delete();

        return response()->json(['message' => 'Đã xóa WiFi được phép.']);
    }

    public function staffIndex(Request $request): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xem cấu hình nhân viên.'], 403);
        }

        $query = User::query()
            ->select([
                'id',
                'name',
                'email',
                'role',
                'department',
                'department_id',
                'is_active',
                'attendance_employment_type',
                'attendance_shift_weekdays',
                'attendance_weekday_work_types',
                'attendance_earliest_checkin_time',
            ])
            ->where('role', '!=', 'administrator')
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('role', 'like', "%{$search}%")
                    ->orWhere('department', 'like', "%{$search}%");
            });
        }

        if ($request->filled('role')) {
            $query->where('role', (string) $request->input('role'));
        }

        $rows = $query->paginate((int) $request->input('per_page', 20));

        return response()->json($rows);
    }

    public function workTypes(Request $request): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xem loại chấm công.'], 403);
        }

        $rows = AttendanceWorkType::query()
            ->orderByDesc('is_system')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $rows->map(function (AttendanceWorkType $item) {
                return $this->workTypePayload($item);
            })->values(),
        ]);
    }

    public function workTypeStore(Request $request): JsonResponse
    {
        if (! $this->canManageAttendanceTypes($request->user())) {
            return response()->json(['message' => 'Chỉ Administrator mới được thêm loại chấm công.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['nullable', 'string', 'max:64'],
            'session' => ['required', 'in:full_day,morning,afternoon,off'],
            'default_work_units' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $name = trim((string) $validated['name']);
        $session = (string) $validated['session'];
        $defaultUnits = $this->resolveWorkTypeDefaultUnits($session, $validated['default_work_units'] ?? null);

        if (! $this->isValidWorkUnitStep($defaultUnits)) {
            return response()->json([
                'message' => 'Công mặc định của loại chấm công phải theo bước 0.5 (0, 0.5, 1).',
            ], 422);
        }

        $codeInput = trim((string) ($validated['code'] ?? ''));
        $code = $codeInput !== ''
            ? Str::slug($codeInput, '_')
            : Str::slug($name, '_');
        $code = trim($code, '_');
        if ($code === '') {
            $code = 'work_type_' . time();
        }

        if (AttendanceWorkType::query()->where('code', $code)->exists()) {
            return response()->json(['message' => 'Mã loại chấm công đã tồn tại.'], 422);
        }

        $item = AttendanceWorkType::query()->create([
            'name' => $name,
            'code' => $code,
            'session' => $session,
            'default_work_units' => $defaultUnits,
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
            'is_system' => false,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Đã thêm loại chấm công.',
            'item' => $this->workTypePayload($item),
        ], 201);
    }

    public function workTypeUpdate(Request $request, AttendanceWorkType $attendanceWorkType): JsonResponse
    {
        if (! $this->canManageAttendanceTypes($request->user())) {
            return response()->json(['message' => 'Chỉ Administrator mới được sửa loại chấm công.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['nullable', 'string', 'max:64'],
            'session' => ['required', 'in:full_day,morning,afternoon,off'],
            'default_work_units' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $name = trim((string) $validated['name']);
        $session = (string) $validated['session'];
        $defaultUnits = $this->resolveWorkTypeDefaultUnits($session, $validated['default_work_units'] ?? null);

        if (! $this->isValidWorkUnitStep($defaultUnits)) {
            return response()->json([
                'message' => 'Công mặc định của loại chấm công phải theo bước 0.5 (0, 0.5, 1).',
            ], 422);
        }

        $codeInput = trim((string) ($validated['code'] ?? ''));
        $codeBase = $codeInput !== ''
            ? Str::slug($codeInput, '_')
            : Str::slug($name, '_');
        $code = trim($codeBase, '_');
        if ($code === '') {
            $code = 'work_type_' . $attendanceWorkType->id;
        }

        $exists = AttendanceWorkType::query()
            ->where('code', $code)
            ->where('id', '!=', $attendanceWorkType->id)
            ->exists();
        if ($exists) {
            return response()->json(['message' => 'Mã loại chấm công đã tồn tại.'], 422);
        }

        $attendanceWorkType->update([
            'name' => $name,
            'code' => $code,
            'session' => $session,
            'default_work_units' => $defaultUnits,
            'sort_order' => (int) ($validated['sort_order'] ?? $attendanceWorkType->sort_order),
            'is_active' => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : (bool) $attendanceWorkType->is_active,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Đã cập nhật loại chấm công.',
            'item' => $this->workTypePayload($attendanceWorkType->fresh()),
        ]);
    }

    public function workTypeDestroy(Request $request, AttendanceWorkType $attendanceWorkType): JsonResponse
    {
        if (! $this->canManageAttendanceTypes($request->user())) {
            return response()->json(['message' => 'Chỉ Administrator mới được xóa loại chấm công.'], 403);
        }
        if ((bool) $attendanceWorkType->is_system) {
            return response()->json(['message' => 'Không thể xóa loại chấm công hệ thống mặc định.'], 422);
        }
        if ($this->isWorkTypeInUse((int) $attendanceWorkType->id)) {
            return response()->json([
                'message' => 'Loại chấm công này đang được gán cho nhân sự theo lịch tuần, không thể xóa.',
            ], 422);
        }

        $attendanceWorkType->delete();

        return response()->json(['message' => 'Đã xóa loại chấm công.']);
    }

    public function staffUpdate(Request $request, User $user, AttendanceService $attendance): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật cấu hình nhân viên.'], 403);
        }

        $validated = $request->validate([
            'attendance_employment_type' => ['nullable', 'in:full_time,half_day_morning,half_day_afternoon'],
            'attendance_shift_weekdays' => ['nullable', 'array'],
            'attendance_shift_weekdays.*' => ['integer', 'min:1', 'max:7'],
            'attendance_weekday_work_types' => ['nullable', 'array'],
            'attendance_weekday_work_types.*' => ['nullable', 'integer', 'min:1'],
            'attendance_earliest_checkin_time' => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
        ]);

        $weekdayInputProvided = array_key_exists('attendance_weekday_work_types', $validated);
        $shiftDays = array_key_exists('attendance_shift_weekdays', $validated)
            ? array_values(array_unique(array_map('intval', $validated['attendance_shift_weekdays'] ?? [])))
            : $user->attendance_shift_weekdays;

        $employmentType = array_key_exists('attendance_employment_type', $validated)
            ? (string) $validated['attendance_employment_type']
            : (string) ($user->attendance_employment_type ?: AttendanceService::EMPLOYMENT_FULL_TIME);

        $weekdayWorkTypes = $weekdayInputProvided
            ? $this->normalizeWeekdayWorkTypeMap($validated['attendance_weekday_work_types'], true)
            : $this->normalizeWeekdayWorkTypeMap($user->attendance_weekday_work_types, false);

        if ($weekdayInputProvided) {
            $shiftDays = $this->shiftWeekdaysFromWeekdayMap($weekdayWorkTypes);
        }

        $user->update([
            'attendance_employment_type' => $employmentType,
            'attendance_shift_weekdays' => empty($shiftDays) ? null : $shiftDays,
            'attendance_weekday_work_types' => empty($weekdayWorkTypes) ? null : $weekdayWorkTypes,
            'attendance_earliest_checkin_time' => array_key_exists('attendance_earliest_checkin_time', $validated)
                ? ($validated['attendance_earliest_checkin_time']
                    ? $attendance->normalizeTime((string) $validated['attendance_earliest_checkin_time'], '08:30')
                    : null)
                : $user->attendance_earliest_checkin_time,
        ]);

        return response()->json([
            'message' => 'Đã cập nhật hình thức chấm công của nhân viên.',
            'user' => $user->fresh(['departmentRelation']),
        ]);
    }

    public function devices(Request $request): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền duyệt thiết bị.'], 403);
        }

        $query = AttendanceDevice::query()
            ->with(['user:id,name,email,role,department,department_id', 'decider:id,name'])
            ->orderByRaw("FIELD(status, 'pending', 'rejected', 'approved')")
            ->orderByDesc('requested_at')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }

        if ($request->filled('request_type')) {
            $query->where('request_type', (string) $request->input('request_type'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('device_name', 'like', "%{$search}%")
                    ->orWhere('device_model', 'like', "%{$search}%")
                    ->orWhere('device_uuid', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($userQuery) use ($search) {
                        $userQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%")
                            ->orWhere('role', 'like', "%{$search}%")
                            ->orWhere('department', 'like', "%{$search}%");
                    });
            });
        }

        return response()->json($query->paginate((int) $request->input('per_page', 20)));
    }

    public function submitDevice(Request $request, NotificationService $notifications): JsonResponse
    {
        if (! $this->canTrackAttendance($request->user())) {
            return response()->json(['message' => 'Tài khoản này không thuộc diện chấm công bằng WiFi.'], 403);
        }

        $validated = $request->validate([
            'device_uuid' => ['required', 'string', 'max:191'],
            'device_name' => ['nullable', 'string', 'max:191'],
            'device_platform' => ['nullable', 'string', 'max:32'],
            'device_model' => ['nullable', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();
        $existing = AttendanceDevice::query()->where('user_id', $user->id)->first();
        $deviceUuid = trim((string) $validated['device_uuid']);
        $isReplacement = $existing && $existing->device_uuid !== $deviceUuid;

        $conflict = AttendanceDevice::query()
            ->where('device_uuid', $deviceUuid)
            ->where('user_id', '!=', $user->id)
            ->first();

        if ($conflict) {
            return response()->json([
                'message' => 'Thiết bị này đã được liên kết với nhân sự khác. Vui lòng liên hệ quản trị để kiểm tra lại.',
            ], 422);
        }

        if ($existing && $existing->status === 'approved' && $existing->device_uuid === $deviceUuid) {
            $existing->update([
                'device_name' => trim((string) ($validated['device_name'] ?? '')) ?: $existing->device_name,
                'device_platform' => trim((string) ($validated['device_platform'] ?? '')) ?: $existing->device_platform,
                'device_model' => trim((string) ($validated['device_model'] ?? '')) ?: $existing->device_model,
                'last_seen_at' => now(),
            ]);

            return response()->json([
                'message' => 'Thiết bị hiện tại đã được duyệt sẵn.',
                'item' => $this->devicePayload($existing->fresh()),
            ]);
        }

        $item = AttendanceDevice::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'device_uuid' => $deviceUuid,
                'device_name' => trim((string) ($validated['device_name'] ?? '')) ?: null,
                'device_platform' => trim((string) ($validated['device_platform'] ?? '')) ?: null,
                'device_model' => trim((string) ($validated['device_model'] ?? '')) ?: null,
                'status' => 'pending',
                'note' => trim((string) ($validated['note'] ?? '')) ?: null,
                'requested_at' => now(),
                'approved_at' => null,
                'rejected_at' => null,
                'decided_by' => null,
                'last_seen_at' => now(),
            ]
        );

        $this->notifyManagers(
            'Có yêu cầu duyệt thiết bị chấm công',
            $isReplacement
                ? sprintf('%s vừa gửi yêu cầu cập nhật sang thiết bị mới %s.', $user->name, $item->device_name ?: $item->device_uuid)
                : sprintf('%s vừa gửi yêu cầu duyệt thiết bị %s.', $user->name, $item->device_name ?: $item->device_uuid),
            [
                'type' => 'attendance_device_request',
                'category' => 'attendance',
                'attendance_device_id' => (int) $item->id,
                'user_id' => (int) $user->id,
            ]
        );

        $notifications->notifyUsersAfterResponse(
            [$user->id],
            'Đã gửi yêu cầu duyệt thiết bị',
            'Thiết bị vừa được gửi. Hãy liên hệ nhân sự phụ trách để thiết bị được duyệt.',
            [
                'type' => 'attendance_device_submitted',
                'category' => 'attendance',
                'attendance_device_id' => (int) $item->id,
            ]
        );

        return response()->json([
            'message' => $isReplacement
                ? 'Đã gửi yêu cầu cập nhật sang thiết bị mới. Hãy liên hệ nhân sự phụ trách để được duyệt.'
                : 'Đã gửi yêu cầu duyệt thiết bị. Hãy liên hệ nhân sự phụ trách để được duyệt.',
            'item' => $this->devicePayload($item->fresh()),
        ], 201);
    }

    public function reviewDevice(Request $request, AttendanceDevice $attendanceDevice, NotificationService $notifications): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền duyệt thiết bị.'], 403);
        }

        $validated = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $status = (string) $validated['status'];
        $attendanceDevice->update([
            'status' => $status,
            'note' => trim((string) ($validated['note'] ?? '')) ?: null,
            'decided_by' => $request->user()->id,
            'approved_at' => $status === 'approved' ? now() : null,
            'rejected_at' => $status === 'rejected' ? now() : null,
        ]);

        if ($attendanceDevice->user) {
            $notifications->notifyUsersAfterResponse(
                [$attendanceDevice->user_id],
                $status === 'approved' ? 'Thiết bị chấm công đã được duyệt' : 'Thiết bị chấm công bị từ chối',
                $status === 'approved'
                    ? 'Bạn có thể dùng thiết bị này để chấm công bằng WiFi.'
                    : ((string) ($attendanceDevice->note ?: 'Vui lòng kiểm tra lại thiết bị và gửi yêu cầu mới.')),
                [
                    'type' => 'attendance_device_reviewed',
                    'category' => 'attendance',
                    'attendance_device_id' => (int) $attendanceDevice->id,
                    'status' => $status,
                ]
            );
        }

        return response()->json([
            'message' => $status === 'approved' ? 'Đã duyệt thiết bị.' : 'Đã từ chối thiết bị.',
            'item' => $this->devicePayload($attendanceDevice->fresh(['user', 'decider'])),
        ]);
    }

    /**
     * Gỡ hoàn toàn bản ghi thiết bị khỏi tài khoản nhân sự — user phải gửi phiếu đăng ký lại trên app.
     * Chỉ Administrator (không phải admin/kế toán).
     */
    public function revokeDevice(
        Request $request,
        AttendanceDevice $attendanceDevice,
        NotificationService $notifications
    ): JsonResponse {
        if ($request->user()->role !== 'administrator') {
            return response()->json(['message' => 'Chỉ Administrator mới gỡ liên kết thiết bị.'], 403);
        }

        $attendanceDevice->loadMissing('user:id,name');
        $targetUserId = (int) $attendanceDevice->user_id;
        $userLabel = $attendanceDevice->user?->name ?: 'Nhân sự';

        $attendanceDevice->delete();

        $notifications->notifyUsersAfterResponse(
            [$targetUserId],
            'Thiết bị chấm công đã được gỡ',
            'Quản trị đã gỡ thiết bị đăng ký của bạn. Vui lòng mở app và gửi phiếu đăng ký thiết bị lại để tiếp tục chấm công bằng Wi‑Fi.',
            [
                'type' => 'attendance_device_revoked',
                'category' => 'attendance',
            ]
        );

        return response()->json([
            'message' => sprintf('Đã gỡ thiết bị khỏi tài khoản %s. Nhân sự cần đăng ký lại trên app.', $userLabel),
        ]);
    }

    public function checkIn(Request $request, AttendanceService $attendance): JsonResponse
    {
        $user = $request->user();
        if (! $this->canTrackAttendance($user)) {
            return response()->json(['message' => 'Tài khoản này không thuộc diện chấm công bằng WiFi.'], 403);
        }

        $validated = $request->validate([
            'device_uuid' => ['required', 'string', 'max:191'],
            'device_name' => ['nullable', 'string', 'max:191'],
            'device_platform' => ['nullable', 'string', 'max:32'],
            'device_model' => ['nullable', 'string', 'max:191'],
            'wifi_ssid' => ['required', 'string', 'max:120'],
            'wifi_bssid' => ['nullable', 'string', 'max:64'],
        ]);

        $settings = $attendance->settings();
        if (! $settings['enabled']) {
            return response()->json(['message' => 'Chức năng chấm công WiFi hiện đang tạm tắt.'], 422);
        }

        $device = AttendanceDevice::query()->where('user_id', $user->id)->first();
        $deviceUuid = trim((string) $validated['device_uuid']);
        if (! $device) {
            return response()->json(['message' => 'Thiết bị hiện tại chưa được đăng ký. Vui lòng gửi yêu cầu duyệt thiết bị trước khi chấm công.'], 422);
        }

        if ($device->device_uuid !== $deviceUuid) {
            return response()->json(['message' => 'Bạn đang dùng thiết bị mới. Vui lòng gửi yêu cầu duyệt lại để cập nhật thiết bị chấm công.'], 422);
        }

        if ($device->status !== 'approved') {
            return response()->json(['message' => 'Thiết bị hiện tại chưa được duyệt để chấm công.'], 422);
        }

        $ssid = $attendance->normalizeWifiValue($validated['wifi_ssid'] ?? null);
        $bssid = $attendance->normalizeBssid($validated['wifi_bssid'] ?? null);
        $allowedWifi = AttendanceWifiNetwork::query()
            ->where('is_active', true)
            ->where('ssid', $ssid)
            ->where(function ($query) use ($bssid) {
                $query->whereNull('bssid');
                if ($bssid) {
                    $query->orWhere('bssid', $bssid);
                }
            })
            ->first();

        if (! $allowedWifi) {
            return response()->json(['message' => 'WiFi hiện tại chưa nằm trong danh sách được phép chấm công.'], 422);
        }

        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $holiday = AttendanceHoliday::query()
            ->where('is_active', true)
            ->coveringDate($now)
            ->first();
        if ($holiday) {
            $record = $attendance->upsertHolidayRecord($user, $now, $holiday);
            return response()->json([
                'message' => 'Hôm nay là ngày lễ, hệ thống đã tự tính đủ công cho bạn.',
                'record' => $this->recordPayload($record),
            ]);
        }

        $shiftBlock = $attendance->checkInBlockedReason($user, $now, $settings);
        if ($shiftBlock) {
            return response()->json(['message' => $shiftBlock], 422);
        }

        $record = AttendanceRecord::query()->firstOrNew([
            'user_id' => $user->id,
            'work_date' => $now->toDateString(),
        ]);

        if ($record->exists && $record->check_in_at) {
            return response()->json([
                'message' => 'Bạn đã chấm công hôm nay rồi.',
                'record' => $this->recordPayload($record),
            ]);
        }

        $evaluation = $attendance->evaluateCheckIn($user, $now, $settings);
        $existingWorkUnits = (float) ($record->work_units ?? 0);
        $nextWorkUnits = max($existingWorkUnits, (float) $evaluation['work_units']);
        $lockedStatus = in_array((string) $record->status, ['approved_full', 'approved_partial'], true)
            ? (string) $record->status
            : (string) $evaluation['status'];
        $lockedSource = in_array((string) $record->status, ['approved_full', 'approved_partial'], true)
            ? ((string) ($record->source ?: 'request_approval'))
            : 'wifi';

        $record->fill([
            'check_in_at' => $now,
            'required_start_at' => $evaluation['required_start_at'],
            'allowed_late_until' => $evaluation['allowed_late_until'],
            'minutes_late' => (int) $evaluation['minutes_late'],
            'default_work_units' => (float) $evaluation['default_work_units'],
            'work_units' => $nextWorkUnits,
            'employment_type' => (string) $evaluation['employment_type'],
            'status' => $lockedStatus,
            'source' => $lockedSource,
            'wifi_ssid' => $ssid,
            'wifi_bssid' => $bssid,
            'device_uuid' => $deviceUuid,
            'device_name' => trim((string) ($validated['device_name'] ?? '')) ?: $device->device_name,
            'device_platform' => trim((string) ($validated['device_platform'] ?? '')) ?: $device->device_platform,
            'note' => $record->note,
            'edited_after_wifi' => false,
        ]);
        $record->save();

        $device->update([
            'device_name' => trim((string) ($validated['device_name'] ?? '')) ?: $device->device_name,
            'device_platform' => trim((string) ($validated['device_platform'] ?? '')) ?: $device->device_platform,
            'device_model' => trim((string) ($validated['device_model'] ?? '')) ?: $device->device_model,
            'last_seen_at' => now(),
        ]);

        return response()->json([
            'message' => $record->status === 'present'
                ? 'Chấm công thành công.'
                : sprintf('Đã chấm công. Bạn đi muộn %d phút, hệ thống đã tự tính công tương ứng.', (int) $evaluation['minutes_late']),
            'record' => $this->recordPayload($record->fresh()),
        ]);
    }

    public function myRecords(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canTrackAttendance($user)) {
            return response()->json(['data' => []]);
        }

        $from = $this->resolveDate($request->input('from_date'), Carbon::now('Asia/Ho_Chi_Minh')->startOfMonth());
        $to = $this->resolveDate($request->input('to_date'), Carbon::now('Asia/Ho_Chi_Minh')->endOfMonth());

        $rows = AttendanceRecord::query()
            ->where('user_id', $user->id)
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->orderByDesc('work_date')
            ->get();

        return response()->json([
            'data' => $rows->map(function (AttendanceRecord $item) {
                return $this->recordPayload($item);
            })->values(),
        ]);
    }

    public function requests(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = AttendanceRequestModel::query()
            ->with(['user:id,name,email,role,department', 'decider:id,name'])
            ->orderByDesc('request_date')
            ->orderByDesc('id');

        if ($this->canManageAttendance($user)) {
            // xem toàn bộ
        } elseif ($user->role === 'quan_ly') {
            $deptIds = Department::query()->where('manager_id', $user->id)->pluck('id');
            if ($deptIds->isEmpty()) {
                $query->whereRaw('1 = 0');
            } else {
                $query->whereHas('user', function ($q) use ($deptIds) {
                    $q->whereIn('department_id', $deptIds);
                });
            }
        } else {
            $query->where('user_id', $user->id);
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('content', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($userQuery) use ($search) {
                        $userQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%")
                            ->orWhere('role', 'like', "%{$search}%")
                            ->orWhere('department', 'like', "%{$search}%");
                    });
            });
        }

        return response()->json($query->paginate((int) $request->input('per_page', 20)));
    }

    public function submitRequest(Request $request, NotificationService $notifications): JsonResponse
    {
        $user = $request->user();
        if (! $this->canTrackAttendance($user)) {
            return response()->json(['message' => 'Tài khoản này không thuộc diện gửi đơn chấm công.'], 403);
        }

        $validated = $request->validate([
            'request_type' => ['required', 'in:late_arrival,leave_request'],
            'request_date' => ['required', 'date'],
            'request_end_date' => ['nullable', 'date'],
            'expected_check_in_time' => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'title' => ['required', 'string', 'max:191'],
            'content' => ['nullable', 'string', 'max:5000'],
        ]);

        $requestType = (string) $validated['request_type'];
        $start = Carbon::parse($validated['request_date'], 'Asia/Ho_Chi_Minh')->startOfDay();
        $endRaw = trim((string) ($validated['request_end_date'] ?? ''));
        $end = $endRaw !== ''
            ? Carbon::parse($endRaw, 'Asia/Ho_Chi_Minh')->startOfDay()
            : $start->copy();
        if ($end->lt($start)) {
            return response()->json(['message' => 'Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.'], 422);
        }
        if ($requestType === 'late_arrival' && empty($validated['expected_check_in_time'])) {
            return response()->json(['message' => 'Đơn đi muộn cần có giờ dự kiến vào làm (HH:mm).'], 422);
        }

        $item = AttendanceRequestModel::create([
            'user_id' => $user->id,
            'request_type' => $requestType,
            'request_date' => $start->toDateString(),
            'request_end_date' => $requestType === 'leave_request' ? $end->toDateString() : null,
            'expected_check_in_time' => $validated['expected_check_in_time'] ?? null,
            'title' => trim((string) $validated['title']),
            'content' => trim((string) ($validated['content'] ?? '')) ?: null,
            'status' => 'pending',
        ]);

        $requestTypeLabel = $this->attendanceRequestTypeLabel($requestType);
        $dateLabel = $requestType === 'leave_request' && $item->request_end_date
            && $item->request_date->toDateString() !== $item->request_end_date->toDateString()
            ? sprintf(
                '%s → %s',
                Carbon::parse($item->request_date)->format('d/m/Y'),
                Carbon::parse($item->request_end_date)->format('d/m/Y')
            )
            : Carbon::parse($item->request_date)->format('d/m/Y');

        $notifyIds = array_values(array_unique(array_merge(
            $this->attendanceManagerIds(),
            $this->departmentManagerIdsForUser($user)
        )));

        $notifications->notifyUsersAfterResponse(
            $notifyIds,
            sprintf('Có %s cần duyệt', mb_strtolower($requestTypeLabel)),
            sprintf('%s vừa gửi %s (%s).', $user->name, mb_strtolower($requestTypeLabel), $dateLabel),
            [
                'type' => 'attendance_request_submitted',
                'category' => 'attendance',
                'attendance_request_id' => (int) $item->id,
                'user_id' => (int) $user->id,
            ]
        );

        return response()->json([
            'message' => sprintf('Đã gửi %s.', mb_strtolower($requestTypeLabel)),
            'item' => $this->attendanceRequestPayload($item->fresh(['user', 'decider'])),
        ], 201);
    }

    public function reviewRequest(
        Request $request,
        AttendanceRequestModel $attendanceRequest,
        AttendanceService $attendance,
        NotificationService $notifications
    ): JsonResponse {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền duyệt đơn chấm công.'], 403);
        }

        $requestType = (string) $attendanceRequest->request_type;

        $validated = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
            'approval_mode' => ['nullable', 'string', 'max:32'],
            'decision_note' => ['nullable', 'string', 'max:5000'],
        ]);

        $status = (string) $validated['status'];
        $approvalMode = null;
        if ($status === 'approved') {
            $rawMode = (string) ($validated['approval_mode'] ?? 'full_work');
            if ($requestType === 'leave_request') {
                if (! in_array($rawMode, ['full_work', 'no_count'], true)) {
                    return response()->json([
                        'message' => 'Đơn nghỉ: chọn duyệt tính công (full_work) hoặc duyệt không tính công (no_count).',
                    ], 422);
                }
                $approvalMode = $rawMode;
            } else {
                if (! in_array($rawMode, ['full_work', 'no_change'], true)) {
                    return response()->json([
                        'message' => 'Đơn đi muộn: chế độ duyệt không hợp lệ.',
                    ], 422);
                }
                $approvalMode = $rawMode;
            }
        }

        $attendanceRequest->update([
            'status' => $status,
            'approval_mode' => $approvalMode,
            'approved_work_units' => null,
            'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
            'decided_by' => $request->user()->id,
            'decided_at' => now(),
        ]);

        $record = null;
        if ($status === 'approved') {
            $record = $attendance->applyApprovedRequest($attendanceRequest->fresh(['user']), $request->user());
        }

        $notifications->notifyUsersAfterResponse(
            [$attendanceRequest->user_id],
            $status === 'approved'
                ? sprintf('%s đã được duyệt', $this->attendanceRequestTypeLabel((string) $attendanceRequest->request_type))
                : sprintf('%s bị từ chối', $this->attendanceRequestTypeLabel((string) $attendanceRequest->request_type)),
            $status === 'approved'
                ? sprintf('Đơn ngày %s đã được xử lý.', Carbon::parse($attendanceRequest->request_date)->format('d/m/Y'))
                : ((string) ($attendanceRequest->decision_note ?: 'Vui lòng liên hệ quản trị để biết thêm chi tiết.')),
            [
                'type' => 'attendance_request_reviewed',
                'category' => 'attendance',
                'attendance_request_id' => (int) $attendanceRequest->id,
                'status' => $status,
            ]
        );

        return response()->json([
            'message' => $status === 'approved' ? 'Đã duyệt đơn chấm công.' : 'Đã từ chối đơn chấm công.',
            'item' => $this->attendanceRequestPayload($attendanceRequest->fresh(['user', 'decider'])),
            'record' => $record ? $this->recordPayload($record) : null,
        ]);
    }

    public function manualUpdateRecord(
        Request $request,
        AttendanceService $attendance
    ): JsonResponse {
        if (! $this->canManualAdjustAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền sửa công thủ công.'], 403);
        }

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'work_date' => ['required', 'date'],
            'work_units' => ['required', 'numeric', 'min:0', 'max:1'],
            'check_in_time' => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        if (! $this->isValidWorkUnitStep($validated['work_units'])) {
            return response()->json([
                'message' => 'Số công thủ công chỉ nhận bước 0.5 trong khoảng từ 0.0 đến 1.0 công.',
            ], 422);
        }

        $targetUser = User::query()->findOrFail((int) $validated['user_id']);
        if (! ($targetUser instanceof User)) {
             throw new \RuntimeException('Failed to resolve user model');
        }
        if (! $this->canTrackAttendance($targetUser)) {
            return response()->json([
                'message' => 'Nhân sự này hiện không thuộc diện chấm công WiFi.',
            ], 422);
        }

        $workDate = Carbon::parse($validated['work_date'], 'Asia/Ho_Chi_Minh')->startOfDay();
        $settings = $attendance->settings();
        $evaluation = $attendance->evaluateCheckIn($targetUser, $workDate, $settings);
        $record = AttendanceRecord::query()->firstOrNew([
            'user_id' => (int) $targetUser->id,
            'work_date' => $workDate->toDateString(),
        ]);

        $checkInAt = $record->check_in_at;
        if (! empty($validated['check_in_time'])) {
            [$hour, $minute] = array_map('intval', explode(':', (string) $validated['check_in_time']));
            $checkInAt = $workDate->copy()->setTime($hour, $minute, 0);
        }

        $workUnits = $this->normalizeWorkUnits($validated['work_units']);
        $defaultWorkUnits = (float) $evaluation['default_work_units'];
        $status = $workUnits >= $defaultWorkUnits ? 'approved_full' : 'approved_partial';
        $minutesLate = 0;
        if ($checkInAt && $checkInAt->gt($evaluation['allowed_late_until'])) {
            $minutesLate = max(0, (int) $evaluation['allowed_late_until']->diffInMinutes($checkInAt, false));
        }

        $record->fill([
            'check_in_at' => $checkInAt,
            'required_start_at' => $evaluation['required_start_at'],
            'allowed_late_until' => $evaluation['allowed_late_until'],
            'minutes_late' => $minutesLate,
            'default_work_units' => $defaultWorkUnits,
            'work_units' => $workUnits,
            'employment_type' => (string) $evaluation['employment_type'],
            'status' => $status,
            'source' => 'manual_adjustment',
            'note' => trim((string) ($validated['note'] ?? '')) ?: $record->note,
            'approved_by' => (int) $request->user()->id,
            'edited_after_wifi' => true,
        ]);
        $record->save();

        $attendance->logRecordEdit($record->fresh(), $request->user(), 'manual_adjustment', [
            'work_units' => $workUnits,
            'minutes_late' => $minutesLate,
            'check_in_time' => $validated['check_in_time'] ?? null,
        ]);

        return response()->json([
            'message' => sprintf(
                'Đã cập nhật công ngày %s cho %s.',
                $workDate->format('d/m/Y'),
                $targetUser->name
            ),
            'record' => $this->recordPayload($record->fresh()),
        ]);
    }

    public function holidays(Request $request): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xem ngày lễ.'], 403);
        }

        $query = AttendanceHoliday::query()->orderBy('start_date')->orderBy('holiday_date');
        if ($request->filled('from_date') || $request->filled('to_date')) {
            $from = $this->resolveDate(
                $request->input('from_date'),
                $request->filled('to_date')
                    ? $this->resolveDate($request->input('to_date'), Carbon::now('Asia/Ho_Chi_Minh'))
                    : Carbon::now('Asia/Ho_Chi_Minh')
            );
            $to = $this->resolveDate(
                $request->input('to_date'),
                $request->filled('from_date')
                    ? $this->resolveDate($request->input('from_date'), Carbon::now('Asia/Ho_Chi_Minh'))
                    : Carbon::now('Asia/Ho_Chi_Minh')
            );
            $query->overlappingRange($from, $to);
        }

        return response()->json([
            'data' => $query->get()->map(function (AttendanceHoliday $item) {
                return $this->holidayPayload($item);
            })->values(),
        ]);
    }

    public function holidayStore(Request $request): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền cấu hình ngày lễ.'], 403);
        }

        $validated = $request->validate([
            'holiday_date' => ['nullable', 'date'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date'],
            'title' => ['required', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        [$startDate, $endDate] = $this->resolveHolidayRangeFromPayload($validated);
        if ($error = $this->holidayRangeConflictMessage($startDate, $endDate)) {
            return response()->json(['message' => $error], 422);
        }

        $item = AttendanceHoliday::create([
            'holiday_date' => $startDate->toDateString(),
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'title' => trim((string) $validated['title']),
            'note' => trim((string) ($validated['note'] ?? '')) ?: null,
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
            'created_by' => $request->user()->id,
        ]);

        $this->syncHolidayRangeUntilToday($item);

        return response()->json([
            'message' => 'Đã thêm kỳ nghỉ/ngày lễ.',
            'item' => $this->holidayPayload($item),
        ], 201);
    }

    public function holidayUpdate(Request $request, AttendanceHoliday $attendanceHoliday): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật ngày lễ.'], 403);
        }

        $validated = $request->validate([
            'holiday_date' => ['nullable', 'date'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date'],
            'title' => ['required', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        [$startDate, $endDate] = $this->resolveHolidayRangeFromPayload($validated);
        if ($error = $this->holidayRangeConflictMessage($startDate, $endDate, (int) $attendanceHoliday->id)) {
            return response()->json(['message' => $error], 422);
        }

        $attendanceHoliday->update([
            'holiday_date' => $startDate->toDateString(),
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'title' => trim((string) $validated['title']),
            'note' => trim((string) ($validated['note'] ?? '')) ?: null,
            'is_active' => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : (bool) $attendanceHoliday->is_active,
        ]);

        $this->syncHolidayRangeUntilToday($attendanceHoliday->fresh());

        return response()->json([
            'message' => 'Đã cập nhật kỳ nghỉ/ngày lễ.',
            'item' => $this->holidayPayload($attendanceHoliday->fresh()),
        ]);
    }

    public function holidayDestroy(Request $request, AttendanceHoliday $attendanceHoliday): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xóa ngày lễ.'], 403);
        }

        $attendanceHoliday->delete();

        return response()->json(['message' => 'Đã xóa ngày lễ.']);
    }

    public function report(Request $request): JsonResponse
    {
        if (! $this->canViewAttendanceReport($request->user())) {
            return response()->json(['message' => 'Không có quyền xem báo cáo chấm công.'], 403);
        }

        $filterResponse = $this->validateReportUserFilter($request);
        if ($filterResponse) {
            return $filterResponse;
        }

        [$rows, $summary, $matrix] = $this->buildReport($request);

        return response()->json([
            'data' => $rows,
            'summary' => $summary,
            'matrix' => $matrix,
        ]);
    }

    public function recordShow(Request $request, AttendanceRecord $attendanceRecord): JsonResponse
    {
        if (! $this->canViewAttendanceReport($request->user())) {
            return response()->json(['message' => 'Không có quyền xem chi tiết chấm công.'], 403);
        }

        $ids = $this->visibleUserIdsForAttendance($request->user());
        if ($ids !== null && ! in_array((int) $attendanceRecord->user_id, $ids, true)) {
            return response()->json(['message' => 'Không có quyền xem bản ghi này.'], 403);
        }

        $attendanceRecord->load(['user:id,name,email,role,department', 'editLogs.actor:id,name']);
        $viewer = $request->user();
        $canEdit = $viewer && $viewer->role === 'administrator';

        return response()->json([
            'record' => $this->recordPayload($attendanceRecord),
            'edit_logs' => $attendanceRecord->editLogs->map(function ($log) {
                return [
                    'id' => (int) $log->id,
                    'action' => (string) $log->action,
                    'payload' => $log->payload,
                    'created_at' => optional($log->created_at)->toIso8601String(),
                    'actor' => $log->actor ? [
                        'id' => (int) $log->actor->id,
                        'name' => $log->actor->name,
                    ] : null,
                ];
            })->values(),
            'form_read_only' => ! $canEdit,
        ]);
    }

    public function export(Request $request)
    {
        if (! $this->canExportAttendanceReport($request->user())) {
            return response()->json(['message' => 'Chỉ kế toán hoặc quản trị mới được xuất file báo cáo công.'], 403);
        }

        $filterResponse = $this->validateReportUserFilter($request);
        if ($filterResponse) {
            return $filterResponse;
        }

        [$startDate, $endDate, $monthKey, $fromMonthFilter] = $this->resolveReportRange($request);
        [, , $matrix] = $this->buildReport($request);

        $userIds = [];
        foreach ($matrix['rows'] ?? [] as $mr) {
            $userIds[] = (int) ($mr['user_id'] ?? 0);
        }
        $requestSummaryByUser = $this->attendanceRequestExportSummaryForUsers(
            $userIds,
            $startDate,
            $endDate
        );

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Cong theo ngay');

        $sheet->setCellValue('A1', 'STT');
        $sheet->setCellValue('B1', 'Họ và tên');
        $sheet->setCellValue('C1', 'Email');
        $sheet->setCellValue('D1', 'Phòng ban');
        $sheet->setCellValue('E1', 'Vai trò');

        $days = $matrix['days'] ?? [];
        $colIdx = 6;
        foreach ($days as $day) {
            $c1 = Coordinate::stringFromColumnIndex($colIdx);
            $c2 = Coordinate::stringFromColumnIndex($colIdx + 1);
            $label = sprintf('%s %s', $day['weekday'] ?? '', Carbon::parse($day['date'])->format('d/m/Y'));
            $sheet->mergeCells("{$c1}1:{$c2}1");
            $sheet->setCellValue("{$c1}1", $label);
            $sheet->setCellValue("{$c1}2", 'Công');
            $sheet->setCellValue("{$c2}2", 'Phút trễ');
            $colIdx += 2;
        }

        $t1 = Coordinate::stringFromColumnIndex($colIdx);
        $t2 = Coordinate::stringFromColumnIndex($colIdx + 1);
        $t3 = Coordinate::stringFromColumnIndex($colIdx + 2);
        $sheet->mergeCells("{$t1}1:{$t3}1");
        $sheet->setCellValue("{$t1}1", 'Tổng hợp kỳ');
        $sheet->setCellValue("{$t1}2", 'Tổng công');
        $sheet->setCellValue("{$t2}2", 'Tổng phút trễ');
        $sheet->setCellValue("{$t3}2", 'Đơn xin phép (số lần & ngày gửi)');

        $lastColLetter = $t3;
        $sheet->getStyle('A1:'.$lastColLetter.'2')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $sheet->getStyle('A1:'.$lastColLetter.'2')->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->getStyle('A1:'.$lastColLetter.'2')->getFont()->setBold(true);

        $dataRow = 3;
        $stt = 1;
        foreach ($matrix['rows'] ?? [] as $mrow) {
            $uid = (int) ($mrow['user_id'] ?? 0);
            $sheet->setCellValue('A'.$dataRow, $stt++);
            $sheet->setCellValue('B'.$dataRow, (string) ($mrow['user_name'] ?? ''));
            $sheet->setCellValue('C'.$dataRow, (string) ($mrow['email'] ?? ''));
            $sheet->setCellValue('D'.$dataRow, (string) ($mrow['department'] ?? ''));
            $sheet->setCellValue('E'.$dataRow, (string) ($mrow['role'] ?? ''));

            $totalLateMin = 0;
            $colIdx = 6;
            foreach ($mrow['cells'] ?? [] as $cell) {
                $wu = (float) ($cell['work_units'] ?? 0);
                $ml = (int) ($cell['minutes_late'] ?? 0);
                $totalLateMin += $ml;
                $c1 = Coordinate::stringFromColumnIndex($colIdx);
                $c2 = Coordinate::stringFromColumnIndex($colIdx + 1);
                $has = ! empty($cell['has_record']);
                $sheet->setCellValue($c1.$dataRow, $has ? round($wu, 2) : '');
                $sheet->setCellValue($c2.$dataRow, $has && $ml > 0 ? $ml : '');
                $colIdx += 2;
            }

            $sheet->setCellValue(Coordinate::stringFromColumnIndex($colIdx).$dataRow, round((float) ($mrow['total_work_units'] ?? 0), 2));
            $sheet->setCellValue(Coordinate::stringFromColumnIndex($colIdx + 1).$dataRow, $totalLateMin);
            $reqLabel = $requestSummaryByUser[$uid]['label'] ?? '—';
            $sheet->setCellValue(Coordinate::stringFromColumnIndex($colIdx + 2).$dataRow, $reqLabel);

            $dataRow++;
        }

        $lastDataRow = max(2, $dataRow - 1);
        $sheet->getStyle('A1:'.$lastColLetter.$lastDataRow)->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);

        $maxColIndex = Coordinate::columnIndexFromString($lastColLetter);
        for ($i = 1; $i <= $maxColIndex; $i++) {
            $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($i))->setAutoSize(true);
        }

        $sheet->freezePane('F3');

        $fileName = $fromMonthFilter
            ? sprintf('bao-cao-cong-theo-ngay-thang-%s.xlsx', $monthKey)
            : sprintf(
                'bao-cao-cong-theo-ngay-%s-den-%s.xlsx',
                $startDate->format('Y-m-d'),
                $endDate->format('Y-m-d')
            );

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * @param  array<int>  $userIds
     * @return array<int, array{count: int, label: string}>
     */
    private function attendanceRequestExportSummaryForUsers(array $userIds, Carbon $startDate, Carbon $endDate): array
    {
        $empty = [];
        foreach ($userIds as $uid) {
            $empty[(int) $uid] = ['count' => 0, 'label' => '—'];
        }
        if ($userIds === []) {
            return $empty;
        }

        $from = $startDate->copy()->timezone('Asia/Ho_Chi_Minh')->startOfDay();
        $to = $endDate->copy()->timezone('Asia/Ho_Chi_Minh')->endOfDay();

        $rows = AttendanceRequestModel::query()
            ->whereIn('user_id', $userIds)
            ->whereBetween('created_at', [$from, $to])
            ->orderBy('created_at')
            ->get(['user_id', 'created_at']);

        $grouped = $rows->groupBy('user_id');
        foreach ($userIds as $uid) {
            $uid = (int) $uid;
            $items = $grouped->get($uid, collect());
            if ($items->isEmpty()) {
                continue;
            }
            $cnt = $items->count();
            $dates = $items->map(function ($r) {
                return optional($r->created_at)->timezone('Asia/Ho_Chi_Minh')->format('d/m/Y');
            })->unique()->values()->all();
            $empty[$uid] = [
                'count' => $cnt,
                'label' => sprintf('%d (%s)', $cnt, implode(', ', $dates)),
            ];
        }

        return $empty;
    }

    private function canExportAttendanceReport(?User $user): bool
    {
        return $user && in_array($user->role, ['admin', 'administrator', 'ke_toan'], true);
    }

    private function buildReport(Request $request): array
    {
        [$startDate, $endDate, $monthKey] = $this->resolveReportRange($request);

        $visibleIds = $this->visibleUserIdsForAttendance($request->user());

        $query = AttendanceRecord::query()
            ->with(['user:id,name,email,role,department,department_id'])
            ->whereBetween('work_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->orderBy('work_date')
            ->orderBy('user_id');

        if ($visibleIds !== null) {
            if (count($visibleIds) === 0) {
                $query->whereRaw('1 = 0');
            } else {
                $query->whereIn('user_id', $visibleIds);
            }
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->whereHas('user', function ($userQuery) use ($search) {
                $userQuery->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('role', 'like', "%{$search}%")
                    ->orWhere('department', 'like', "%{$search}%");
            });
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->input('user_id'));
        }

        /** @var \Illuminate\Support\Collection<int, AttendanceRecord> $records */
        $records = $query->get();
        $rows = $records->map(function (AttendanceRecord $item) {
            return $this->reportRowPayload($item);
        })->values();

        $attendance = app(AttendanceService::class);
        $trackedUserQuery = $attendance->trackedUsersQuery()
            ->select(['id', 'name', 'email', 'role', 'department', 'attendance_employment_type'])
            ->orderBy('name');
        if ($visibleIds !== null) {
            if (count($visibleIds) === 0) {
                $trackedUserQuery->whereRaw('1 = 0');
            } else {
                $trackedUserQuery->whereIn('id', $visibleIds);
            }
        }
        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $trackedUserQuery->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('role', 'like', "%{$search}%")
                    ->orWhere('department', 'like', "%{$search}%");
            });
        }
        if ($request->filled('user_id')) {
            $trackedUserQuery->where('id', (int) $request->input('user_id'));
        }

        $todayIso = Carbon::now('Asia/Ho_Chi_Minh')->toDateString();
        $trackedUserIds = (clone $trackedUserQuery)
            ->select('id')
            ->pluck('id');
        /** @var \Illuminate\Support\Collection<int, User> $trackedUsers */
        $trackedUsers = (clone $trackedUserQuery)->get();
        $todayWorkUnits = $trackedUserIds->isEmpty()
            ? 0
            : (float) AttendanceRecord::query()
                ->whereDate('work_date', $todayIso)
                ->whereIn('user_id', $trackedUserIds)
                ->sum('work_units');
        $summary = [
            'total_staff' => (int) $trackedUsers->count(),
            'today_work_units' => round($todayWorkUnits, 2),
        ];

        $recordIndex = [];
        foreach ($records as $record) {
            $dateKey = optional($record->work_date)->toDateString();
            if (! $dateKey) {
                continue;
            }
            $recordIndex[(int) $record->user_id][$dateKey] = $record;
        }

        $today = Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
        $dayCursor = $startDate->copy();
        $dayColumns = [];
        $weekdayLabels = [
            1 => 'T2',
            2 => 'T3',
            3 => 'T4',
            4 => 'T5',
            5 => 'T6',
            6 => 'T7',
            7 => 'CN',
        ];
        $dayKeys = [];
        while ($dayCursor->lte($endDate)) {
            $dateKey = $dayCursor->toDateString();
            $dayKeys[] = $dateKey;
            $weekday = $weekdayLabels[$dayCursor->dayOfWeekIso] ?? '';
            $dayColumns[] = [
                'date' => $dateKey,
                'weekday' => $weekday,
                'day' => (int) $dayCursor->day,
                'label' => sprintf('%s %s', $weekday, $dayCursor->format('d/m')),
                'is_weekend' => (bool) $dayCursor->isWeekend(),
                'is_today' => (bool) $dayCursor->isSameDay($today),
            ];
            $dayCursor->addDay();
        }

        $matrixRows = $trackedUsers->map(function (User $user) use ($dayKeys, $recordIndex, $attendance) {
            $userRecords = $recordIndex[(int) $user->id] ?? [];
            $totalWorkUnits = 0.0;
            $lateDays = 0;

            $cells = [];
            foreach ($dayKeys as $dayKey) {
                /** @var AttendanceRecord|null $record */
                $record = $userRecords[$dayKey] ?? null;
                if (! $record) {
                    $dayDate = Carbon::parse($dayKey, 'Asia/Ho_Chi_Minh');
                    $plannedUnits = $attendance->defaultWorkUnitsForUserOnDate($user, $dayDate);
                    $isScheduledOff = $plannedUnits <= 0;
                    $cells[] = [
                        'date' => $dayKey,
                        'record_id' => null,
                        'has_record' => false,
                        'work_units' => 0,
                        'work_units_display' => '',
                        'minutes_late' => 0,
                        'status' => $isScheduledOff ? 'scheduled_off' : 'absent',
                        'status_label' => $isScheduledOff ? 'Nghỉ theo lịch' : 'Không chấm công',
                        'source' => '',
                        'source_label' => '',
                        'check_in_at' => '—',
                        'note' => '',
                        'tone' => 'slate',
                    ];
                    continue;
                }

                $reportRow = $this->reportRowPayload($record);
                $workUnits = (float) ($reportRow['work_units'] ?? 0);
                $minutesLate = (int) ($reportRow['minutes_late'] ?? 0);
                $totalWorkUnits += $workUnits;
                if ($minutesLate > 0) {
                    $lateDays++;
                }

                $status = (string) ($reportRow['status'] ?? 'absent');
                $cells[] = [
                    'date' => $dayKey,
                    'record_id' => (int) ($reportRow['id'] ?? 0),
                    'has_record' => true,
                    'work_units' => $workUnits,
                    'work_units_display' => $this->formatMatrixWorkUnits($workUnits),
                    'minutes_late' => $minutesLate,
                    'status' => $status,
                    'status_label' => (string) ($reportRow['status_label'] ?? '—'),
                    'source' => (string) ($reportRow['source'] ?? ''),
                    'source_label' => (string) ($reportRow['source_label'] ?? ''),
                    'check_in_at' => (string) ($reportRow['check_in_at'] ?? '—'),
                    'note' => (string) ($reportRow['note'] ?? ''),
                    'tone' => $this->matrixDotTone($record),
                ];
            }

            $employmentType = $user->attendance_employment_type ?: 'full_time';
            return [
                'user_id' => (int) $user->id,
                'user_name' => $user->name ?: '—',
                'email' => $user->email ?: '',
                'role' => $user->role ?: '—',
                'department' => $user->department ?: '—',
                'employment_type' => $employmentType,
                'employment_type_label' => $this->employmentTypeLabel((string) $employmentType),
                'total_work_units' => round($totalWorkUnits, 1),
                'late_days' => (int) $lateDays,
                'cells' => $cells,
            ];
        })->values();

        $matrix = [
            'month' => $monthKey,
            'month_label' => sprintf('Tháng %s', Carbon::parse($startDate->toDateString(), 'Asia/Ho_Chi_Minh')->format('m/Y')),
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'days' => $dayColumns,
            'rows' => $matrixRows,
            'legend' => [
                ['key' => 'wifi_raw', 'label' => 'Chấm qua app (chưa chỉnh sửa)', 'tone' => 'orange'],
                ['key' => 'edited', 'label' => 'Đã chỉnh sửa / duyệt đơn', 'tone' => 'blue'],
                ['key' => 'holiday', 'label' => 'Ngày lễ', 'tone' => 'teal'],
                ['key' => 'absent', 'label' => 'Không chấm công', 'tone' => 'slate'],
            ],
        ];

        return [$rows, $summary, $matrix];
    }

    private function buildExportSummary(Request $request): array
    {
        $attendance = app(AttendanceService::class);
        [$startDate, $endDate] = $this->resolveReportRange($request);

        $visibleIds = $this->visibleUserIdsForAttendance($request->user());

        $userQuery = $attendance->trackedUsersQuery()
            ->select(['id', 'name', 'email', 'attendance_employment_type'])
            ->orderBy('name');

        if ($visibleIds !== null) {
            if (count($visibleIds) === 0) {
                $userQuery->whereRaw('1 = 0');
            } else {
                $userQuery->whereIn('id', $visibleIds);
            }
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $userQuery->where(function ($query) use ($search) {
                $query->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('role', 'like', "%{$search}%")
                    ->orWhere('department', 'like', "%{$search}%");
            });
        }

        if ($request->filled('user_id')) {
            $userQuery->where('id', (int) $request->input('user_id'));
        }

        $users = $userQuery->get();
        if ($users->isEmpty()) {
            return [];
        }

        $userIds = $users->pluck('id')->map(function ($id) {
            return (int) $id;
        })->all();

        $recordsByUser = AttendanceRecord::query()
            ->select(['user_id', 'work_units', 'minutes_late'])
            ->whereIn('user_id', $userIds)
            ->whereBetween('work_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get()
            ->groupBy('user_id');

        $requestsByUser = AttendanceRequestModel::query()
            ->select(['user_id'])
            ->whereIn('user_id', $userIds)
            ->whereBetween('request_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get()
            ->groupBy('user_id');

        return $users->map(function (User $user) use ($attendance, $recordsByUser, $requestsByUser, $startDate, $endDate) {
            $employmentType = $attendance->employmentTypeForUser($user);
            $expectedUnitsRaw = 0.0;
            $cursor = $startDate->copy();
            while ($cursor->lte($endDate)) {
                $expectedUnitsRaw += $attendance->defaultWorkUnitsForUserOnDate($user, $cursor);
                $cursor->addDay();
            }
            $expectedUnits = round($expectedUnitsRaw, 1);
            $userRecords = $recordsByUser->get($user->id, collect());
            $actualUnits = round((float) $userRecords->sum(function (AttendanceRecord $record) {
                return (float) ($record->work_units ?? 0);
            }), 1);
            $missingUnits = round(max(0, $expectedUnits - $actualUnits), 1);
            $lateWorkUnits = round((float) $userRecords->sum(function (AttendanceRecord $record) {
                if ((int) ($record->minutes_late ?? 0) <= 0) {
                    return 0;
                }
                return (float) ($record->work_units ?? 0);
            }), 1);
            $lateDays = (int) $userRecords->filter(function (AttendanceRecord $record) {
                return (int) ($record->minutes_late ?? 0) > 0;
            })->count();
            $totalLateMinutes = (int) $userRecords->sum(function (AttendanceRecord $record) {
                return (int) ($record->minutes_late ?? 0);
            });
            $requestCount = (int) $requestsByUser->get($user->id, collect())->count();

            return [
                'user_name' => $user->name ?: '—',
                'employment_type' => $employmentType,
                'employment_type_label' => $this->employmentTypeLabel($employmentType),
                'work_units' => $actualUnits,
                'missing_work_units' => $missingUnits,
                'request_count' => $requestCount,
                'late_days' => $lateDays,
                'late_work_units' => $lateWorkUnits,
                'total_late_minutes' => $totalLateMinutes,
            ];
        })->values()->all();
    }

    private function resolveReportRange(Request $request): array
    {
        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $monthRaw = trim((string) $request->input('month', ''));
        if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $monthRaw) === 1) {
            $startDate = Carbon::createFromFormat('Y-m-d', $monthRaw . '-01', 'Asia/Ho_Chi_Minh')->startOfDay();
            $endDate = $startDate->copy()->endOfMonth()->startOfDay();
            return [$startDate, $endDate, $monthRaw, true];
        }

        $startDate = $this->resolveDate($request->input('start_date'), $now->copy()->startOfMonth());
        $endDate = $this->resolveDate($request->input('end_date'), $now->copy()->endOfMonth());
        if ($endDate->lt($startDate)) {
            [$startDate, $endDate] = [$endDate, $startDate];
        }

        return [$startDate, $endDate, $startDate->format('Y-m'), false];
    }

    private function formatMatrixWorkUnits(float $workUnits): string
    {
        if (abs($workUnits - (float) round($workUnits)) < 0.0001) {
            return (string) ((int) round($workUnits));
        }

        return rtrim(rtrim(number_format($workUnits, 1, '.', ''), '0'), '.');
    }

    /**
     * Cam: chấm WiFi gốc chưa chỉnh; xanh: đã chỉnh tay / duyệt đơn; teal: ngày lễ.
     */
    private function matrixDotTone(AttendanceRecord $record): string
    {
        $status = (string) ($record->status ?? '');
        if ($status === 'holiday_auto') {
            return 'teal';
        }
        $source = (string) ($record->source ?: 'wifi');
        if ($source === 'wifi' && ! ($record->edited_after_wifi ?? false)) {
            return 'orange';
        }

        return 'blue';
    }

    private function resolveDate($value, Carbon $fallback): Carbon
    {
        try {
            return $value ? Carbon::parse((string) $value, 'Asia/Ho_Chi_Minh')->startOfDay() : $fallback->copy()->startOfDay();
        } catch (\Throwable $e) {
            return $fallback->copy()->startOfDay();
        }
    }

    private function canViewAttendanceReport(?User $user): bool
    {
        if (! $user) {
            return false;
        }
        if ($this->canManageAttendance($user)) {
            return true;
        }
        if ($user->role === 'quan_ly') {
            return (bool) $user->is_active;
        }
        if ($user->role === 'nhan_vien') {
            return (bool) $user->is_active;
        }

        return false;
    }

    /**
     * null = không giới hạn (admin / kế toán / admin hệ thống).
     *
     * @return array<int>|null
     */
    private function visibleUserIdsForAttendance(?User $viewer): ?array
    {
        if (! $viewer) {
            return [];
        }
        if (in_array($viewer->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return null;
        }
        if ($viewer->role === 'nhan_vien') {
            return [(int) $viewer->id];
        }
        if ($viewer->role === 'quan_ly') {
            $deptIds = Department::query()->where('manager_id', $viewer->id)->pluck('id');
            if ($deptIds->isEmpty()) {
                return [];
            }

            return User::query()
                ->where('is_active', true)
                ->whereIn('department_id', $deptIds)
                ->whereIn('role', ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'])
                ->pluck('id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->all();
        }

        return [];
    }

    private function validateReportUserFilter(Request $request): ?JsonResponse
    {
        if (! $request->filled('user_id')) {
            return null;
        }
        $uid = (int) $request->input('user_id');
        $ids = $this->visibleUserIdsForAttendance($request->user());
        if ($ids !== null && ! in_array($uid, $ids, true)) {
            return response()->json(['message' => 'Không có quyền xem nhân sự này.'], 403);
        }

        return null;
    }

    private function departmentManagerIdsForUser(User $subject): array
    {
        if (! $subject->department_id) {
            return [];
        }
        $dept = Department::query()->find($subject->department_id);
        if (! $dept || ! $dept->manager_id) {
            return [];
        }

        return [(int) $dept->manager_id];
    }

    private function canManageAttendance(?User $user): bool
    {
        return $user && in_array($user->role, ['admin', 'administrator', 'ke_toan'], true);
    }

    private function canTrackAttendance(?User $user): bool
    {
        return $user && $user->is_active && $user->role !== 'administrator';
    }

    private function attendanceManagerIds(): array
    {
        return User::query()
            ->where('is_active', true)
            ->whereIn('role', ['admin', 'administrator', 'ke_toan'])
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function notifyManagers(string $title, string $body, array $data = []): void
    {
        app(NotificationService::class)->notifyUsersAfterResponse(
            $this->attendanceManagerIds(),
            $title,
            $body,
            $data
        );
    }

    private function syncHolidayRangeUntilToday(?AttendanceHoliday $holiday): void
    {
        if (! $holiday || ! $holiday->is_active) {
            return;
        }

        $today = Carbon::now('Asia/Ho_Chi_Minh')->toDateString();
        $startDate = $holiday->resolvedStartDate();
        $endDate = $holiday->resolvedEndDate();
        if (! $startDate || ! $endDate || $startDate->toDateString() > $today) {
            return;
        }

        $attendance = app(AttendanceService::class);
        $syncEnd = $endDate->copy()->startOfDay();
        if ($syncEnd->toDateString() > $today) {
            $syncEnd = Carbon::parse($today, 'Asia/Ho_Chi_Minh')->startOfDay();
        }

        if ($syncEnd->lt($startDate)) {
            return;
        }

        $users = $attendance->trackedUsersQuery()->get();
        $cursor = $startDate->copy()->startOfDay();
        while ($cursor->lte($syncEnd)) {
            foreach ($users as $user) {
                $attendance->upsertHolidayRecord($user, $cursor, $holiday);
            }
            $cursor->addDay();
        }
    }

    private function devicePayload(AttendanceDevice $item): array
    {
        return [
            'id' => (int) $item->id,
            'user_id' => (int) $item->user_id,
            'device_uuid' => (string) $item->device_uuid,
            'device_name' => (string) ($item->device_name ?: ''),
            'device_platform' => (string) ($item->device_platform ?: ''),
            'device_model' => (string) ($item->device_model ?: ''),
            'status' => (string) $item->status,
            'note' => $item->note,
            'requested_at' => optional($item->requested_at)->toIso8601String(),
            'approved_at' => optional($item->approved_at)->toIso8601String(),
            'rejected_at' => optional($item->rejected_at)->toIso8601String(),
            'last_seen_at' => optional($item->last_seen_at)->toIso8601String(),
            'user' => $item->relationLoaded('user') && $item->user ? [
                'id' => (int) $item->user->id,
                'name' => $item->user->name,
                'email' => $item->user->email,
                'role' => $item->user->role,
                'department' => $item->user->department,
            ] : null,
            'decider' => $item->relationLoaded('decider') && $item->decider ? [
                'id' => (int) $item->decider->id,
                'name' => $item->decider->name,
            ] : null,
        ];
    }

    private function attendanceRequestPayload(AttendanceRequestModel $item): array
    {
        return [
            'id' => (int) $item->id,
            'user_id' => (int) $item->user_id,
            'request_type' => (string) $item->request_type,
            'request_type_label' => $this->attendanceRequestTypeLabel((string) $item->request_type),
            'request_date' => optional($item->request_date)->toDateString(),
            'request_end_date' => $item->request_end_date
                ? optional($item->request_end_date)->toDateString()
                : null,
            'expected_check_in_time' => $item->expected_check_in_time,
            'title' => (string) $item->title,
            'content' => $item->content,
            'status' => (string) $item->status,
            'approval_mode' => $item->approval_mode,
            'approved_work_units' => $item->approved_work_units,
            'decision_note' => $item->decision_note,
            'decided_at' => optional($item->decided_at)->toIso8601String(),
            'created_at' => optional($item->created_at)->toIso8601String(),
            'user' => $item->relationLoaded('user') && $item->user ? [
                'id' => (int) $item->user->id,
                'name' => $item->user->name,
                'email' => $item->user->email,
                'role' => $item->user->role,
                'department' => $item->user->department,
            ] : null,
            'decider' => $item->relationLoaded('decider') && $item->decider ? [
                'id' => (int) $item->decider->id,
                'name' => $item->decider->name,
            ] : null,
        ];
    }

    private function recordPayload(AttendanceRecord $item): array
    {
        return [
            'id' => (int) $item->id,
            'user_id' => (int) $item->user_id,
            'work_date' => optional($item->work_date)->toDateString(),
            'check_in_at' => optional($item->check_in_at)->toIso8601String(),
            'required_start_at' => optional($item->required_start_at)->toIso8601String(),
            'allowed_late_until' => optional($item->allowed_late_until)->toIso8601String(),
            'minutes_late' => (int) ($item->minutes_late ?? 0),
            'default_work_units' => (float) ($item->default_work_units ?? 0),
            'work_units' => (float) ($item->work_units ?? 0),
            'employment_type' => (string) ($item->employment_type ?: 'full_time'),
            'status' => (string) ($item->status ?: 'absent'),
            'source' => (string) ($item->source ?: 'wifi'),
            'edited_after_wifi' => (bool) ($item->edited_after_wifi ?? false),
            'dot_tone' => $this->matrixDotTone($item),
            'wifi_ssid' => $item->wifi_ssid,
            'wifi_bssid' => $item->wifi_bssid,
            'device_uuid' => $item->device_uuid,
            'device_name' => $item->device_name,
            'device_platform' => $item->device_platform,
            'note' => $item->note,
        ];
    }

    private function holidayPayload(AttendanceHoliday $item): array
    {
        $startDate = $item->resolvedStartDate();
        $endDate = $item->resolvedEndDate();

        return [
            'id' => (int) $item->id,
            'holiday_date' => optional($startDate)->toDateString(),
            'start_date' => optional($startDate)->toDateString(),
            'end_date' => optional($endDate)->toDateString(),
            'day_count' => $item->durationDays(),
            'title' => (string) $item->title,
            'note' => $item->note,
            'is_active' => (bool) $item->is_active,
        ];
    }

    private function wifiPayload(AttendanceWifiNetwork $item): array
    {
        return [
            'id' => (int) $item->id,
            'ssid' => (string) $item->ssid,
            'bssid' => $item->bssid,
            'note' => $item->note,
            'is_active' => (bool) $item->is_active,
        ];
    }

    private function reportRowPayload(AttendanceRecord $item): array
    {
        $user = $item->user;
        $employmentType = (string) ($item->employment_type ?: 'full_time');
        $employmentLabel = $this->employmentTypeLabel($employmentType);

        switch ((string) $item->status) {
            case 'present':
                $statusLabel = 'Đúng công';
                break;
            case 'late_pending':
            case 'late':
                $statusLabel = 'Đi muộn ' . ((int) ($item->minutes_late ?? 0)) . ' phút';
                break;
            case 'approved_full':
                $statusLabel = 'Duyệt đủ công';
                break;
            case 'approved_partial':
                $statusLabel = 'Duyệt công thủ công';
                break;
            case 'holiday_auto':
                $statusLabel = 'Ngày lễ tự động';
                break;
            default:
                $statusLabel = (string) $item->status;
                break;
        }

        switch ((string) $item->source) {
            case 'wifi':
                $sourceLabel = 'Chấm WiFi';
                break;
            case 'request_approval':
                $sourceLabel = 'Duyệt đơn';
                break;
            case 'manual_adjustment':
                $sourceLabel = 'Điều chỉnh tay';
                break;
            case 'holiday_auto':
                $sourceLabel = 'Cron ngày lễ';
                break;
            default:
                $sourceLabel = (string) $item->source;
                break;
        }

        return [
            'id' => (int) $item->id,
            'user_id' => $user ? (int) $user->id : 0,
            'work_date' => optional($item->work_date)->format('d/m/Y'),
            'user_name' => $user && $user->name ? $user->name : '—',
            'role' => $user && $user->role ? $user->role : '—',
            'department' => $user && $user->department ? $user->department : '—',
            'employment_type' => $employmentType,
            'employment_type_label' => $employmentLabel,
            'check_in_at' => $item->check_in_at ? $item->check_in_at->setTimezone('Asia/Ho_Chi_Minh')->format('H:i') : '—',
            'minutes_late' => (int) ($item->minutes_late ?? 0),
            'work_units' => (float) ($item->work_units ?? 0),
            'status' => (string) ($item->status ?: 'absent'),
            'status_label' => $statusLabel,
            'source' => (string) ($item->source ?: 'wifi'),
            'source_label' => $sourceLabel,
            'wifi_ssid' => $item->wifi_ssid ?: '—',
            'wifi_bssid' => $item->wifi_bssid ?: '—',
            'note' => $item->note ?: '',
            'edited_after_wifi' => (bool) ($item->edited_after_wifi ?? false),
            'dot_tone' => $this->matrixDotTone($item),
        ];
    }

    private function employmentTypeLabel(string $employmentType): string
    {
        switch ($employmentType) {
            case 'half_day_morning':
                return 'Mỗi sáng';
            case 'half_day_afternoon':
                return 'Mỗi chiều';
            default:
                return 'Toàn thời gian';
        }
    }

    private function attendanceRequestTypeLabel(string $requestType): string
    {
        switch ($requestType) {
            case 'leave_request':
                return 'Đơn xin nghỉ phép';
            default:
                return 'Đơn xin đi muộn';
        }
    }

    private function resolveHolidayRangeFromPayload(array $validated): array
    {
        $startRaw = $validated['start_date'] ?? $validated['holiday_date'] ?? null;
        $endRaw = $validated['end_date'] ?? $validated['holiday_date'] ?? null;

        if (! $startRaw || ! $endRaw) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(
                response()->json([
                    'message' => 'Cần nhập ngày bắt đầu và ngày kết thúc cho kỳ nghỉ.',
                ], 422)
            );
        }

        $startDate = Carbon::parse((string) $startRaw, 'Asia/Ho_Chi_Minh')->startOfDay();
        $endDate = Carbon::parse((string) $endRaw, 'Asia/Ho_Chi_Minh')->startOfDay();
        if ($endDate->lt($startDate)) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(
                response()->json([
                    'message' => 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.',
                ], 422)
            );
        }

        return [$startDate, $endDate];
    }

    private function holidayRangeConflictMessage(Carbon $startDate, Carbon $endDate, ?int $ignoreId = null): ?string
    {
        $query = AttendanceHoliday::query()->overlappingRange($startDate, $endDate);
        if ($ignoreId) {
            $query->where('id', '!=', $ignoreId);
        }

        if (! $query->exists()) {
            return null;
        }

        return 'Khoảng ngày lễ này đang bị chồng với một kỳ nghỉ/ngày lễ đã có.';
    }

    private function normalizeWorkUnits($value): float
    {
        return round((float) $value * 2) / 2;
    }

    private function isValidWorkUnitStep($value): bool
    {
        if (! is_numeric($value)) {
            return false;
        }

        $numeric = (float) $value;
        $scaled = round($numeric * 2, 6);

        return abs($scaled - round($scaled)) < 0.0001;
    }

    private function canManageAttendanceTypes(?User $user): bool
    {
        return $user && $user->role === 'administrator';
    }

    /**
     * @return array<int|string, mixed>
     */
    private function workTypePayload(AttendanceWorkType $item): array
    {
        return [
            'id' => (int) $item->id,
            'code' => (string) $item->code,
            'name' => (string) $item->name,
            'session' => (string) $item->session,
            'session_label' => $this->workTypeSessionLabel((string) $item->session),
            'default_work_units' => (float) ($item->default_work_units ?? 0),
            'sort_order' => (int) ($item->sort_order ?? 0),
            'is_active' => (bool) $item->is_active,
            'is_system' => (bool) $item->is_system,
            'can_delete' => ! ((bool) $item->is_system),
        ];
    }

    private function workTypeSessionLabel(string $session): string
    {
        switch ($session) {
            case AttendanceService::WORK_SESSION_MORNING:
                return 'Buổi sáng';
            case AttendanceService::WORK_SESSION_AFTERNOON:
                return 'Buổi chiều';
            case AttendanceService::WORK_SESSION_OFF:
                return 'Nghỉ';
            default:
                return 'Cả ngày';
        }
    }

    private function resolveWorkTypeDefaultUnits(string $session, $providedValue): float
    {
        $defaultBySession = match ($session) {
            AttendanceService::WORK_SESSION_MORNING,
            AttendanceService::WORK_SESSION_AFTERNOON => 0.5,
            AttendanceService::WORK_SESSION_OFF => 0.0,
            default => 1.0,
        };

        if ($session === AttendanceService::WORK_SESSION_OFF) {
            return 0.0;
        }

        if (! is_numeric($providedValue)) {
            return $defaultBySession;
        }

        return $this->normalizeWorkUnits((float) $providedValue);
    }

    /**
     * @return array<int, int>
     */
    private function normalizeWeekdayWorkTypeMap($payload, bool $strict = false): array
    {
        if (! is_array($payload) || $payload === []) {
            return [];
        }

        $types = AttendanceWorkType::query()
            ->select(['id', 'is_active'])
            ->get()
            ->keyBy('id');

        $normalized = [];
        foreach ($payload as $weekdayKey => $workTypeIdRaw) {
            $weekday = (int) $weekdayKey;
            if ($weekday < 1 || $weekday > 7) {
                if ($strict) {
                    throw new \Illuminate\Http\Exceptions\HttpResponseException(
                        response()->json([
                            'message' => 'Lịch tuần chỉ nhận thứ từ 2 đến Chủ nhật (1-7).',
                        ], 422)
                    );
                }
                continue;
            }

            $workTypeId = (int) $workTypeIdRaw;
            if ($workTypeId <= 0) {
                continue;
            }

            /** @var AttendanceWorkType|null $type */
            $type = $types->get($workTypeId);
            if (! $type) {
                if ($strict) {
                    throw new \Illuminate\Http\Exceptions\HttpResponseException(
                        response()->json([
                            'message' => sprintf('Loại chấm công #%d không tồn tại.', $workTypeId),
                        ], 422)
                    );
                }
                continue;
            }
            if (! $type->is_active) {
                if ($strict) {
                    throw new \Illuminate\Http\Exceptions\HttpResponseException(
                        response()->json([
                            'message' => sprintf('Loại chấm công #%d đang tạm ngưng, không thể gán vào lịch tuần.', $workTypeId),
                        ], 422)
                    );
                }
                continue;
            }

            $normalized[$weekday] = $workTypeId;
        }

        ksort($normalized);
        return $normalized;
    }

    /**
     * @param  array<int, int>  $weekdayWorkTypes
     * @return array<int>
     */
    private function shiftWeekdaysFromWeekdayMap(array $weekdayWorkTypes): array
    {
        if ($weekdayWorkTypes === []) {
            return [];
        }

        $typeIds = array_values(array_unique(array_map('intval', $weekdayWorkTypes)));
        $unitsByTypeId = AttendanceWorkType::query()
            ->whereIn('id', $typeIds)
            ->pluck('default_work_units', 'id')
            ->all();

        $days = [];
        foreach ($weekdayWorkTypes as $weekday => $typeId) {
            if (((float) ($unitsByTypeId[(int) $typeId] ?? 0)) <= 0) {
                continue;
            }
            $day = (int) $weekday;
            if ($day >= 1 && $day <= 7) {
                $days[$day] = $day;
            }
        }
        ksort($days);

        return array_values($days);
    }

    private function isWorkTypeInUse(int $workTypeId): bool
    {
        if ($workTypeId <= 0) {
            return false;
        }

        return User::query()
            ->whereNotNull('attendance_weekday_work_types')
            ->get(['attendance_weekday_work_types'])
            ->contains(function (User $user) use ($workTypeId) {
                if (! is_array($user->attendance_weekday_work_types)) {
                    return false;
                }
                foreach ($user->attendance_weekday_work_types as $typeIdRaw) {
                    if ((int) $typeIdRaw === $workTypeId) {
                        return true;
                    }
                }
                return false;
            });
    }

    private function canManualAdjustAttendance(?User $user): bool
    {
        return $user && $user->role === 'administrator';
    }
}
