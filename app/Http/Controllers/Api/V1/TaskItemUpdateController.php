<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\TaskItemUpdate;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\TaskProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskItemUpdateController extends Controller
{
    public function index(Task $task, TaskItem $item, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
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
        if (! $this->canAccessTask($request->user(), $task)) {
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

    private function canAccessTask(?User $user, Task $task): bool
    {
        if (! $user) {
            return false;
        }
        if ($user->role === 'admin') {
            return true;
        }
        if ($user->role === 'ke_toan') {
            return false;
        }
        if ($this->isProjectOwner($user, $task)) {
            return true;
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            if ($task->department_id && $deptIds->contains($task->department_id)) {
                return true;
            }
            if ($task->assignee && $deptIds->contains($task->assignee->department_id)) {
                return true;
            }
            return (int) $task->created_by === (int) $user->id
                || (int) $task->assigned_by === (int) $user->id;
        }

        return $task->items()->where('assignee_id', $user->id)->exists()
            || (int) $task->assignee_id === (int) $user->id;
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
}
