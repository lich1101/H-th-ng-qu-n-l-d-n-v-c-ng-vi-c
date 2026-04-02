<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\AttendanceDevice;
use App\Models\AttendanceHoliday;
use App\Models\AttendanceRecord;
use App\Models\AttendanceReminderLog;
use App\Models\AttendanceRequest as AttendanceRequestModel;
use App\Models\AttendanceWifiNetwork;
use App\Models\User;
use App\Services\AttendanceService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
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

        return response()->json([
            'settings' => $settings,
            'today_record' => $todayRecord ? $this->recordPayload($todayRecord) : null,
            'device' => $device ? $this->devicePayload($device) : null,
            'recent_requests' => $recentRequests->map(function (AttendanceRequestModel $item) {
                return $this->attendanceRequestPayload($item);
            })->values(),
            'can_manage_attendance' => $this->canManageAttendance($user),
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
            ->select(['id', 'name', 'email', 'role', 'department', 'department_id', 'is_active', 'attendance_employment_type'])
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

    public function staffUpdate(Request $request, User $user): JsonResponse
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật cấu hình nhân viên.'], 403);
        }

        $validated = $request->validate([
            'attendance_employment_type' => ['required', 'in:full_time,half_day_morning,half_day_afternoon'],
        ]);

        $user->update([
            'attendance_employment_type' => (string) $validated['attendance_employment_type'],
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
            $notifications->notifyUsers(
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

        if (! $this->canManageAttendance($user)) {
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
            'expected_check_in_time' => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'title' => ['required', 'string', 'max:191'],
            'content' => ['nullable', 'string', 'max:5000'],
        ]);

        $requestType = (string) $validated['request_type'];

        $item = AttendanceRequestModel::create([
            'user_id' => $user->id,
            'request_type' => $requestType,
            'request_date' => Carbon::parse($validated['request_date'], 'Asia/Ho_Chi_Minh')->toDateString(),
            'expected_check_in_time' => $validated['expected_check_in_time'] ?? null,
            'title' => trim((string) $validated['title']),
            'content' => trim((string) ($validated['content'] ?? '')) ?: null,
            'status' => 'pending',
        ]);

        $requestTypeLabel = $this->attendanceRequestTypeLabel($requestType);

        $notifications->notifyUsers(
            $this->attendanceManagerIds(),
            sprintf('Có %s cần duyệt', mb_strtolower($requestTypeLabel)),
            sprintf('%s vừa gửi %s cho ngày %s.', $user->name, mb_strtolower($requestTypeLabel), Carbon::parse($item->request_date)->format('d/m/Y')),
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

        $validated = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
            'approval_mode' => ['nullable', 'in:full_work,no_change,manual'],
            'approved_work_units' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'decision_note' => ['nullable', 'string', 'max:5000'],
        ]);

        $status = (string) $validated['status'];
        $approvalMode = $status === 'approved'
            ? (string) ($validated['approval_mode'] ?? 'full_work')
            : null;
        if ($status === 'approved' && $approvalMode === 'manual' && ! $this->isValidWorkUnitStep($validated['approved_work_units'] ?? null)) {
            return response()->json([
                'message' => 'Số công thủ công chỉ nhận bước 0.1 và tối đa 1.0 công.',
            ], 422);
        }
        $approvedUnits = $status === 'approved' && $approvalMode === 'manual'
            ? $this->normalizeWorkUnits($validated['approved_work_units'] ?? 0)
            : ($status === 'approved' && $approvalMode === 'full_work' ? null : null);

        $attendanceRequest->update([
            'status' => $status,
            'approval_mode' => $approvalMode,
            'approved_work_units' => $approvedUnits,
            'decision_note' => trim((string) ($validated['decision_note'] ?? '')) ?: null,
            'decided_by' => $request->user()->id,
            'decided_at' => now(),
        ]);

        $record = null;
        if ($status === 'approved') {
            $record = $attendance->applyApprovedRequest($attendanceRequest->fresh(['user']), $request->user());
        }

        $notifications->notifyUsers(
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
        if (! $this->canManageAttendance($request->user())) {
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
                'message' => 'Số công thủ công chỉ nhận bước 0.1 trong khoảng từ 0.0 đến 1.0 công.',
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
        ]);
        $record->save();

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
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xem báo cáo chấm công.'], 403);
        }

        [$rows, $summary] = $this->buildReport($request);

        return response()->json([
            'data' => $rows,
            'summary' => $summary,
        ]);
    }

    public function export(Request $request)
    {
        if (! $this->canManageAttendance($request->user())) {
            return response()->json(['message' => 'Không có quyền xuất báo cáo chấm công.'], 403);
        }

        [$rows] = $this->buildReport($request);
        $summaryRows = $this->buildExportSummary($request);

        $spreadsheet = new Spreadsheet();
        $summarySheet = $spreadsheet->getActiveSheet();
        $summarySheet->setTitle('Tong hop');

        $summaryHeaders = [
            'Tên nhân viên',
            'Kiểu làm việc',
            'Số công',
            'Số công thiếu',
            'Số lần gửi đơn',
            'Số ngày đi muộn',
            'Tổng thời gian muộn (phút)',
        ];

        $summarySheet->fromArray($summaryHeaders, null, 'A1');
        $summaryRowIndex = 2;
        foreach ($summaryRows as $row) {
            $summarySheet->fromArray([
                $row['user_name'],
                $row['employment_type_label'],
                $row['work_units'],
                $row['missing_work_units'],
                $row['request_count'],
                $row['late_days'],
                $row['total_late_minutes'],
            ], null, 'A'.$summaryRowIndex);
            $summaryRowIndex++;
        }

        foreach (range('A', 'G') as $column) {
            $summarySheet->getColumnDimension($column)->setAutoSize(true);
        }

        $detailSheet = $spreadsheet->createSheet();
        $detailSheet->setTitle('Chi tiet');

        $detailHeaders = [
            'Ngày',
            'Nhân sự',
            'Vai trò',
            'Phòng ban',
            'Hình thức làm',
            'Giờ vào',
            'Trễ (phút)',
            'Công',
            'Trạng thái',
            'Nguồn',
            'WiFi',
            'BSSID',
            'Ghi chú',
        ];

        $detailSheet->fromArray($detailHeaders, null, 'A1');
        $rowIndex = 2;
        foreach ($rows as $row) {
            $detailSheet->fromArray([
                $row['work_date'],
                $row['user_name'],
                $row['role'],
                $row['department'],
                $row['employment_type_label'],
                $row['check_in_at'],
                $row['minutes_late'],
                $row['work_units'],
                $row['status_label'],
                $row['source_label'],
                $row['wifi_ssid'],
                $row['wifi_bssid'],
                $row['note'],
            ], null, 'A'.$rowIndex);
            $rowIndex++;
        }

        foreach (range('A', 'M') as $column) {
            $detailSheet->getColumnDimension($column)->setAutoSize(true);
        }

        $spreadsheet->setActiveSheetIndex(0);

        $fileName = sprintf(
            'bao-cao-cham-cong-%s-den-%s.xlsx',
            $request->input('start_date', Carbon::now('Asia/Ho_Chi_Minh')->startOfMonth()->toDateString()),
            $request->input('end_date', Carbon::now('Asia/Ho_Chi_Minh')->endOfMonth()->toDateString())
        );

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function buildReport(Request $request): array
    {
        $startDate = $this->resolveDate($request->input('start_date'), Carbon::now('Asia/Ho_Chi_Minh')->startOfMonth());
        $endDate = $this->resolveDate($request->input('end_date'), Carbon::now('Asia/Ho_Chi_Minh')->endOfMonth());

        $query = AttendanceRecord::query()
            ->with(['user:id,name,email,role,department,department_id'])
            ->whereBetween('work_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->orderBy('work_date')
            ->orderBy('user_id');

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

        $records = $query->get();
        $rows = $records->map(function (AttendanceRecord $item) {
            return $this->reportRowPayload($item);
        })->values();
        $summary = [
            'total_rows' => $rows->count(),
            'total_work_units' => round($rows->sum(function ($item) {
                return (float) ($item['work_units'] ?? 0);
            }), 2),
            'late_count' => $rows->whereIn('status', ['late_pending', 'late'])->count(),
            'approved_full_count' => $rows->where('status', 'approved_full')->count(),
            'holiday_count' => $rows->where('status', 'holiday_auto')->count(),
        ];

        return [$rows, $summary];
    }

    private function buildExportSummary(Request $request): array
    {
        $attendance = app(AttendanceService::class);
        $startDate = $this->resolveDate($request->input('start_date'), Carbon::now('Asia/Ho_Chi_Minh')->startOfMonth());
        $endDate = $this->resolveDate($request->input('end_date'), Carbon::now('Asia/Ho_Chi_Minh')->endOfMonth());
        $totalDays = max(1, $startDate->diffInDays($endDate) + 1);

        $userQuery = $attendance->trackedUsersQuery()
            ->select(['id', 'name', 'email', 'attendance_employment_type'])
            ->orderBy('name');

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

        return $users->map(function (User $user) use ($attendance, $recordsByUser, $requestsByUser, $totalDays) {
            $employmentType = $attendance->employmentTypeForUser($user);
            $defaultWorkUnits = $attendance->defaultWorkUnitsForEmployment($employmentType);
            $expectedUnits = round($totalDays * $defaultWorkUnits, 1);
            $userRecords = $recordsByUser->get($user->id, collect());
            $actualUnits = round((float) $userRecords->sum(function (AttendanceRecord $record) {
                return (float) ($record->work_units ?? 0);
            }), 1);
            $missingUnits = round(max(0, $expectedUnits - $actualUnits), 1);
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
                'total_late_minutes' => $totalLateMinutes,
            ];
        })->values()->all();
    }

    private function resolveDate($value, Carbon $fallback): Carbon
    {
        try {
            return $value ? Carbon::parse((string) $value, 'Asia/Ho_Chi_Minh')->startOfDay() : $fallback->copy()->startOfDay();
        } catch (\Throwable $e) {
            return $fallback->copy()->startOfDay();
        }
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
        app(NotificationService::class)->notifyUsers(
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
        return round((float) $value, 1);
    }

    private function isValidWorkUnitStep($value): bool
    {
        if (! is_numeric($value)) {
            return false;
        }

        $numeric = (float) $value;
        $scaled = round($numeric * 10, 6);

        return abs($scaled - round($scaled)) < 0.0001;
    }
}
