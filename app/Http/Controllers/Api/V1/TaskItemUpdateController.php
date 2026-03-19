<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\ProjectScope;
use App\Models\AppSetting;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\TaskItemUpdate;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\TaskProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

class TaskItemUpdateController extends Controller
{
    public function index(Task $task, TaskItem $item, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem phiếu duyệt đầu việc.'], 403);
        }
        if ($item->task_id !== $task->id) {
            return response()->json(['message' => 'Đầu việc không thuộc công việc.'], 422);
        }

        return response()->json(
            $item->updates()
                ->with(['submitter', 'reviewer'])
                ->latest()
                ->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Task $task, TaskItem $item, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền gửi phiếu duyệt đầu việc.'], 403);
        }
        if ($item->task_id !== $task->id) {
            return response()->json(['message' => 'Đầu việc không thuộc công việc.'], 422);
        }

        $user = $request->user();
        if ($user->role === 'nhan_vien' && (int) $item->assignee_id !== (int) $user->id) {
            return response()->json(['message' => 'Chỉ nhân sự phụ trách mới được gửi phiếu duyệt tiến độ.'], 403);
        }

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:todo,doing,done,blocked'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'note' => ['nullable', 'string'],
            'attachment_path' => ['nullable', 'string', 'max:255'],
            'attachment' => ['nullable', 'file', 'max:10240'],
        ]);

        $attachmentPath = $validated['attachment_path'] ?? null;
        if ($request->hasFile('attachment')) {
            $stored = $request->file('attachment')->store('task_item_updates', 'public');
            $attachmentPath = Storage::url($stored);
        }

        $note = trim((string) ($validated['note'] ?? ''));
        if ($note === '' && empty($attachmentPath) && empty($validated['status']) && ! isset($validated['progress_percent'])) {
            return response()->json([
                'message' => 'Vui lòng nhập nội dung, trạng thái, tiến độ hoặc đính kèm tệp.',
            ], 422);
        }

        $update = $item->updates()->create([
            'submitted_by' => $user->id,
            'status' => $validated['status'] ?? null,
            'progress_percent' => isset($validated['progress_percent']) ? (int) $validated['progress_percent'] : null,
            'note' => $note !== '' ? $note : null,
            'attachment_path' => $attachmentPath,
            'review_status' => 'pending',
        ]);

        $this->notifySubmission($task, $item, $update, $user);

        return response()->json($update->load(['submitter', 'reviewer']), 201);
    }

    public function update(Task $task, TaskItem $item, TaskItemUpdate $update, Request $request): JsonResponse
    {
        if ($item->task_id !== $task->id || $update->task_item_id !== $item->id) {
            return response()->json(['message' => 'Phiếu duyệt không thuộc đầu việc.'], 422);
        }
        if (! $this->canEditPendingUpdate($request->user(), $task, $item, $update)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa phiếu duyệt này.'], 403);
        }

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:todo,doing,done,blocked'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'note' => ['nullable', 'string'],
            'attachment_path' => ['nullable', 'string', 'max:255'],
            'attachment' => ['nullable', 'file', 'max:10240'],
        ]);

        $attachmentPath = array_key_exists('attachment_path', $validated)
            ? $validated['attachment_path']
            : $update->attachment_path;
        if ($request->hasFile('attachment')) {
            $stored = $request->file('attachment')->store('task_item_updates', 'public');
            $attachmentPath = Storage::url($stored);
        }

        $update->update([
            'status' => array_key_exists('status', $validated) ? $validated['status'] : $update->status,
            'progress_percent' => array_key_exists('progress_percent', $validated)
                ? (int) $validated['progress_percent']
                : $update->progress_percent,
            'note' => array_key_exists('note', $validated) ? $validated['note'] : $update->note,
            'attachment_path' => $attachmentPath,
        ]);

        return response()->json($update->fresh()->load(['submitter', 'reviewer']));
    }

    public function insight(Task $task, TaskItem $item, Request $request): JsonResponse
    {
        if ($item->task_id !== $task->id) {
            return response()->json(['message' => 'Đầu việc không thuộc công việc.'], 422);
        }
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem đầu việc này.'], 403);
        }
        if (! $this->canApproveTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem biểu đồ tiến độ đầu việc.'], 403);
        }

        $task->loadMissing([
            'project:id,name,owner_id',
            'department:id,name,manager_id',
            'assignee:id,name,email,department_id',
        ]);
        $item->loadMissing([
            'assignee:id,name,email,department_id',
            'updates' => function ($query) {
                $query->with(['submitter:id,name,email', 'reviewer:id,name,email'])
                    ->orderBy('created_at');
            },
        ]);

        return response()->json($this->buildInsightPayload($task, $item));
    }

    public function approve(Task $task, TaskItem $item, TaskItemUpdate $update, Request $request): JsonResponse
    {
        if ($item->task_id !== $task->id || $update->task_item_id !== $item->id) {
            return response()->json(['message' => 'Phiếu duyệt không thuộc đầu việc.'], 422);
        }
        if (! $this->canApproveTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền duyệt phiếu duyệt này.'], 403);
        }
        if ($update->review_status !== 'pending') {
            return response()->json(['message' => 'Phiếu duyệt đã được xử lý.'], 422);
        }

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:todo,doing,done,blocked'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'note' => ['nullable', 'string'],
        ]);

        $update->update([
            'status' => array_key_exists('status', $validated) ? $validated['status'] : $update->status,
            'progress_percent' => array_key_exists('progress_percent', $validated)
                ? (int) $validated['progress_percent']
                : $update->progress_percent,
            'note' => array_key_exists('note', $validated) ? $validated['note'] : $update->note,
            'review_status' => 'approved',
            'review_note' => null,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        $itemPayload = [];
        if (! empty($update->status)) {
            $itemPayload['status'] = $update->status;
        }
        if ($update->progress_percent !== null) {
            $itemPayload['progress_percent'] = (int) $update->progress_percent;
        }
        if (! empty($itemPayload)) {
            if (($itemPayload['status'] ?? $item->status) === 'done') {
                $itemPayload['progress_percent'] = 100;
            }
            $item->update($itemPayload);
        }

        TaskProgressService::recalc($task);
        $this->notifyFeedback($task, $item, $update, $request->user(), 'approved');

        return response()->json($update->fresh()->load(['submitter', 'reviewer']));
    }

    public function reject(Task $task, TaskItem $item, TaskItemUpdate $update, Request $request): JsonResponse
    {
        if ($item->task_id !== $task->id || $update->task_item_id !== $item->id) {
            return response()->json(['message' => 'Phiếu duyệt không thuộc đầu việc.'], 422);
        }
        if (! $this->canApproveTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền từ chối phiếu duyệt này.'], 403);
        }
        if ($update->review_status !== 'pending') {
            return response()->json(['message' => 'Phiếu duyệt đã được xử lý.'], 422);
        }

        $validated = $request->validate([
            'review_note' => ['required', 'string', 'max:500'],
        ]);

        $update->update([
            'review_status' => 'rejected',
            'review_note' => $validated['review_note'],
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        $this->notifyFeedback($task, $item, $update, $request->user(), 'rejected');

        return response()->json($update->fresh()->load(['submitter', 'reviewer']));
    }

    public function destroy(Task $task, TaskItem $item, TaskItemUpdate $update, Request $request): JsonResponse
    {
        if ($item->task_id !== $task->id || $update->task_item_id !== $item->id) {
            return response()->json(['message' => 'Phiếu duyệt không thuộc đầu việc.'], 422);
        }
        if (! $this->canEditPendingUpdate($request->user(), $task, $item, $update)) {
            return response()->json(['message' => 'Không có quyền xóa phiếu duyệt này.'], 403);
        }

        $update->delete();
        $this->notifyFeedback($task, $item, $update, $request->user(), 'deleted');

        return response()->json(['message' => 'Đã xóa phiếu duyệt đầu việc.']);
    }

    private function canApproveTask(?User $user, Task $task): bool
    {
        if (! $user) {
            return false;
        }
        if ($user->role === 'admin') {
            return true;
        }
        if ($this->isProjectOwner($user, $task)) {
            return true;
        }
        if ($user->role !== 'quan_ly') {
            return false;
        }

        $deptIds = $user->managedDepartments()->pluck('id');
        if ($task->department_id && $deptIds->contains($task->department_id)) {
            return true;
        }

        return $task->assignee && $deptIds->contains($task->assignee->department_id);
    }

    private function canEditPendingUpdate(?User $user, Task $task, TaskItem $item, TaskItemUpdate $update): bool
    {
        if (! $user || $update->review_status !== 'pending') {
            return false;
        }
        if ($this->canApproveTask($user, $task)) {
            return true;
        }

        return (int) $update->submitted_by === (int) $user->id
            || (int) $item->assignee_id === (int) $user->id;
    }

    private function isProjectOwner(User $user, Task $task): bool
    {
        $ownerId = $task->project ? $task->project->owner_id : $task->project()->value('owner_id');

        return $ownerId && (int) $ownerId === (int) $user->id;
    }

    private function notifySubmission(Task $task, TaskItem $item, TaskItemUpdate $update, User $actor): void
    {
        if (! $this->submissionNotificationsEnabled()) {
            return;
        }

        try {
            $targetIds = array_merge(
                $this->adminIds(),
                array_filter([
                    $this->projectOwnerId($task),
                    $this->departmentManagerId($task),
                ])
            );

            $targetIds = array_values(array_filter(array_unique(array_map('intval', $targetIds)), function ($id) use ($actor) {
                return $id > 0 && $id !== (int) $actor->id;
            }));

            if (empty($targetIds)) {
                return;
            }

            $title = 'Có phiếu duyệt đầu việc mới';
            $body = $actor->name.' vừa gửi phiếu duyệt cho đầu việc: '.$item->title;

            app(NotificationService::class)->notifyUsersAfterResponse(
                $targetIds,
                $title,
                $body,
                [
                    'type' => 'task_item_update_pending',
                    'task_id' => $task->id,
                    'task_item_id' => $item->id,
                    'task_item_update_id' => $update->id,
                    'submitted_by' => $actor->id,
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function notifyFeedback(Task $task, TaskItem $item, TaskItemUpdate $update, User $actor, string $action): void
    {
        if (! $this->feedbackNotificationsEnabled()) {
            return;
        }

        try {
            $targets = array_filter([
                (int) $update->submitted_by,
                (int) $item->assignee_id,
            ]);
            $targets = array_values(array_filter(array_unique($targets), function ($id) use ($actor) {
                return $id > 0 && $id !== (int) $actor->id;
            }));

            if (empty($targets)) {
                return;
            }

            $messages = [
                'approved' => [
                    'title' => 'Phiếu duyệt đầu việc đã được duyệt',
                    'body' => 'Đầu việc: '.$item->title.' • Người phản hồi: '.$actor->name,
                ],
                'rejected' => [
                    'title' => 'Phiếu duyệt đầu việc không được duyệt',
                    'body' => 'Đầu việc: '.$item->title.' • Người phản hồi: '.$actor->name,
                ],
                'deleted' => [
                    'title' => 'Phiếu duyệt đầu việc đã bị xóa',
                    'body' => 'Đầu việc: '.$item->title.' • Người thực hiện: '.$actor->name,
                ],
            ];

            $payload = isset($messages[$action]) ? $messages[$action] : $messages['rejected'];

            app(NotificationService::class)->notifyUsersAfterResponse(
                $targets,
                $payload['title'],
                $payload['body'],
                [
                    'type' => 'task_item_update_feedback',
                    'task_id' => $task->id,
                    'task_item_id' => $item->id,
                    'task_item_update_id' => $update->id,
                    'feedback_action' => $action,
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function submissionNotificationsEnabled(): bool
    {
        $setting = AppSetting::query()->first();

        return $setting ? (bool) ($setting->task_item_update_submission_notification_enabled ?? true) : true;
    }

    private function feedbackNotificationsEnabled(): bool
    {
        $setting = AppSetting::query()->first();

        return $setting ? (bool) ($setting->task_item_update_feedback_notification_enabled ?? true) : true;
    }

    private function adminIds(): array
    {
        return User::query()
            ->where('role', 'admin')
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function projectOwnerId(Task $task): ?int
    {
        $ownerId = $task->project ? $task->project->owner_id : $task->project()->value('owner_id');

        return $ownerId ? (int) $ownerId : null;
    }

    private function departmentManagerId(Task $task): ?int
    {
        if (! $task->department_id) {
            return null;
        }

        $managerId = $task->department()->value('manager_id');

        return $managerId ? (int) $managerId : null;
    }

    private function buildInsightPayload(Task $task, TaskItem $item): array
    {
        $now = Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
        $start = $item->start_date
            ? Carbon::parse($item->start_date, 'Asia/Ho_Chi_Minh')->startOfDay()
            : ($item->created_at ? Carbon::parse($item->created_at, 'Asia/Ho_Chi_Minh')->startOfDay() : $now->copy());
        $deadline = $item->deadline
            ? Carbon::parse($item->deadline, 'Asia/Ho_Chi_Minh')->startOfDay()
            : null;

        if (! $deadline || $deadline->lessThan($start)) {
            $deadline = $now->copy();
        }

        $rangeEnd = $deadline->copy();
        if ($rangeEnd->lessThan($now)) {
            $rangeEnd = $now->copy();
        }

        $approvedUpdates = collect($item->updates)
            ->filter(function (TaskItemUpdate $update) {
                return (string) $update->review_status === 'approved';
            })
            ->sortBy(function (TaskItemUpdate $update) {
                return $update->created_at ? $update->created_at->timestamp : 0;
            })
            ->values();

        $points = [];
        $cursor = $start->copy();
        $approvedIndex = 0;
        $approvedProgress = 0;
        $totalDays = max(1, $start->diffInDays($deadline));

        while ($cursor->lessThanOrEqualTo($rangeEnd)) {
            while ($approvedIndex < $approvedUpdates->count()) {
                /** @var TaskItemUpdate $candidate */
                $candidate = $approvedUpdates[$approvedIndex];
                $candidateDate = $candidate->created_at
                    ? Carbon::parse($candidate->created_at, 'Asia/Ho_Chi_Minh')->startOfDay()
                    : null;
                if (! $candidateDate || $candidateDate->greaterThan($cursor)) {
                    break;
                }
                $approvedProgress = (int) ($candidate->progress_percent ?? $approvedProgress);
                $approvedProgress = max(0, min(100, $approvedProgress));
                $approvedIndex++;
            }

            $elapsedDays = min($totalDays, max(0, $start->diffInDays($cursor, false)));
            $expected = (int) round(($elapsedDays / $totalDays) * 100);
            $expected = max(0, min(100, $expected));

            $actual = $approvedProgress;
            if ($cursor->equalTo($rangeEnd)) {
                $actual = max($actual, (int) ($item->progress_percent ?? 0));
            }
            $actual = max(0, min(100, $actual));

            $points[] = [
                'date' => $cursor->toDateString(),
                'label' => $cursor->format('d/m'),
                'expected_progress' => $expected,
                'actual_progress' => $actual,
                'is_today' => $cursor->equalTo($now),
            ];

            $cursor->addDay();
        }

        $expectedToday = 0;
        if ($now->greaterThanOrEqualTo($start)) {
        $effectiveToday = $now->lessThan($deadline) ? $now : $deadline;
        $elapsedToday = min($totalDays, max(0, $start->diffInDays($effectiveToday, false)));
            $expectedToday = (int) round(($elapsedToday / $totalDays) * 100);
        }
        $expectedToday = max(0, min(100, $expectedToday));

        $actualToday = max(0, min(100, (int) ($item->progress_percent ?? 0)));
        $lagPercent = max(0, $expectedToday - $actualToday);

        return [
            'summary' => [
                'task_id' => $task->id,
                'task_title' => (string) $task->title,
                'task_item_id' => $item->id,
                'task_item_title' => (string) $item->title,
                'assignee_name' => optional($item->assignee)->name ?: optional($task->assignee)->name ?: 'Chưa phân công',
                'department_name' => optional($task->department)->name ?: '—',
                'start_date' => $start->toDateString(),
                'deadline' => $deadline->toDateString(),
                'expected_progress_today' => $expectedToday,
                'actual_progress_today' => $actualToday,
                'lag_percent' => $lagPercent,
                'is_late' => $lagPercent > 0,
                'status' => (string) $item->status,
            ],
            'chart' => $points,
            'approved_updates' => $approvedUpdates->map(function (TaskItemUpdate $update) {
                return [
                    'id' => $update->id,
                    'progress_percent' => $update->progress_percent !== null ? (int) $update->progress_percent : null,
                    'status' => $update->status,
                    'note' => $update->note,
                    'created_at' => optional($update->created_at)->toIso8601String(),
                    'reviewed_at' => optional($update->reviewed_at)->toIso8601String(),
                    'submitter' => $update->submitter ? [
                        'id' => $update->submitter->id,
                        'name' => $update->submitter->name,
                    ] : null,
                    'reviewer' => $update->reviewer ? [
                        'id' => $update->reviewer->id,
                        'name' => $update->reviewer->name,
                    ] : null,
                ];
            })->values()->all(),
        ];
    }
}
