<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\TaskItemUpdate;
use App\Models\User;
use App\Services\TaskProgressService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskItemUpdateController extends Controller
{
    public function index(Task $task, TaskItem $item, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem báo cáo đầu việc.'], 403);
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
            return response()->json(['message' => 'Không có quyền gửi báo cáo đầu việc.'], 403);
        }
        if ($item->task_id !== $task->id) {
            return response()->json(['message' => 'Đầu việc không thuộc công việc.'], 422);
        }

        $user = $request->user();
        if ($user->role === 'nhan_vien' && (int) $item->assignee_id !== (int) $user->id) {
            return response()->json(['message' => 'Chỉ nhân sự phụ trách mới được gửi báo cáo.'], 403);
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
        if ($note === '' && empty($attachmentPath) && empty($validated['status']) && $validated['progress_percent'] === null) {
            return response()->json([
                'message' => 'Vui lòng nhập nội dung hoặc đính kèm tệp.',
            ], 422);
        }

        $update = $item->updates()->create([
            'submitted_by' => $request->user()->id,
            'status' => $validated['status'] ?? null,
            'progress_percent' => $validated['progress_percent'] ?? null,
            'note' => $note !== '' ? $note : null,
            'attachment_path' => $attachmentPath,
            'review_status' => 'pending',
        ]);

        try {
            $projectOwnerId = $task->project ? $task->project->owner_id : null;
            $managerId = null;
            if ($task->department_id) {
                $managerId = $task->department()->value('manager_id');
            }

            $targets = collect([$projectOwnerId, $managerId])
                ->filter()
                ->unique()
                ->values()
                ->all();

            if (! empty($targets)) {
                app(NotificationService::class)->notifyUsersAfterResponse(
                    $targets,
                    'Báo cáo đầu việc mới',
                    'Đầu việc: '.$item->title,
                    [
                        'type' => 'task_item_update_pending',
                        'task_id' => $task->id,
                        'task_item_id' => $item->id,
                        'task_item_update_id' => $update->id,
                    ]
                );
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json($update->load(['submitter', 'reviewer']), 201);
    }

    public function update(Task $task, TaskItem $item, TaskItemUpdate $update, Request $request): JsonResponse
    {
        if (! $this->canReviewTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa báo cáo.'], 403);
        }
        if ($item->task_id !== $task->id || $update->task_item_id !== $item->id) {
            return response()->json(['message' => 'Báo cáo không thuộc đầu việc.'], 422);
        }
        if ($update->review_status !== 'pending') {
            return response()->json(['message' => 'Báo cáo đã được xử lý.'], 422);
        }

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:todo,doing,done,blocked'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'note' => ['nullable', 'string'],
            'attachment_path' => ['nullable', 'string', 'max:255'],
        ]);

        $update->update([
            'status' => $validated['status'] ?? $update->status,
            'progress_percent' => $validated['progress_percent'] ?? $update->progress_percent,
            'note' => array_key_exists('note', $validated) ? $validated['note'] : $update->note,
            'attachment_path' => array_key_exists('attachment_path', $validated)
                ? $validated['attachment_path']
                : $update->attachment_path,
        ]);

        return response()->json($update->fresh()->load(['submitter', 'reviewer']));
    }

    public function approve(Task $task, TaskItem $item, TaskItemUpdate $update, Request $request): JsonResponse
    {
        if (! $this->canReviewTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền duyệt báo cáo.'], 403);
        }
        if ($item->task_id !== $task->id || $update->task_item_id !== $item->id) {
            return response()->json(['message' => 'Báo cáo không thuộc đầu việc.'], 422);
        }
        if ($update->review_status !== 'pending') {
            return response()->json(['message' => 'Báo cáo đã được xử lý.'], 422);
        }

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:todo,doing,done,blocked'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'note' => ['nullable', 'string'],
        ]);

        $update->update([
            'status' => $validated['status'] ?? $update->status,
            'progress_percent' => $validated['progress_percent'] ?? $update->progress_percent,
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
            $itemPayload['progress_percent'] = $update->progress_percent;
        }
        if (! empty($itemPayload)) {
            if (($itemPayload['status'] ?? $item->status) === 'done') {
                $itemPayload['progress_percent'] = 100;
            }
            $item->update($itemPayload);
        }

        TaskProgressService::recalc($task);

        return response()->json($update->fresh()->load(['submitter', 'reviewer']));
    }

    public function reject(Task $task, TaskItem $item, TaskItemUpdate $update, Request $request): JsonResponse
    {
        if (! $this->canReviewTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền từ chối báo cáo.'], 403);
        }
        if ($item->task_id !== $task->id || $update->task_item_id !== $item->id) {
            return response()->json(['message' => 'Báo cáo không thuộc đầu việc.'], 422);
        }
        if ($update->review_status !== 'pending') {
            return response()->json(['message' => 'Báo cáo đã được xử lý.'], 422);
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

        return response()->json($update->fresh()->load(['submitter', 'reviewer']));
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

    private function canReviewTask(?User $user, Task $task): bool
    {
        if (! $user) {
            return false;
        }
        if ($user->role === 'admin') {
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
}
