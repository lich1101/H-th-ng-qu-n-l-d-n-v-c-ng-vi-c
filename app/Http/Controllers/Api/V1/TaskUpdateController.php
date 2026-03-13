<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskUpdate;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskUpdateController extends Controller
{
    public function index(Task $task, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem báo cáo tiến độ.'], 403);
        }

        return response()->json(
            $task->updates()
                ->with(['submitter', 'reviewer'])
                ->latest()
                ->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Task $task, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền gửi báo cáo tiến độ.'], 403);
        }
        if ($request->user()?->role === 'nhan_vien') {
            return response()->json([
                'message' => 'Nhân sự chỉ gửi báo cáo trên đầu việc được giao.',
            ], 403);
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
            $stored = $request->file('attachment')->store('task_updates', 'public');
            $attachmentPath = Storage::url($stored);
        }

        $note = trim((string) ($validated['note'] ?? ''));
        if ($note === '' && empty($attachmentPath) && empty($validated['status']) && $validated['progress_percent'] === null) {
            return response()->json([
                'message' => 'Vui lòng nhập nội dung hoặc đính kèm tệp.',
            ], 422);
        }

        $update = $task->updates()->create([
            'submitted_by' => $request->user()->id,
            'status' => $validated['status'] ?? null,
            'progress_percent' => $validated['progress_percent'] ?? null,
            'note' => $note !== '' ? $note : null,
            'attachment_path' => $attachmentPath,
            'review_status' => 'pending',
        ]);

        return response()->json($update->load(['submitter', 'reviewer']), 201);
    }

    public function update(Task $task, TaskUpdate $update, Request $request): JsonResponse
    {
        if (! $this->canReviewTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa báo cáo.'], 403);
        }
        if ($update->task_id !== $task->id) {
            return response()->json(['message' => 'Báo cáo không thuộc công việc.'], 422);
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

    public function approve(Task $task, TaskUpdate $update, Request $request): JsonResponse
    {
        if (! $this->canReviewTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền duyệt báo cáo.'], 403);
        }
        if ($update->task_id !== $task->id) {
            return response()->json(['message' => 'Báo cáo không thuộc công việc.'], 422);
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

        $taskPayload = [];
        if (! empty($update->status)) {
            $taskPayload['status'] = $update->status;
        }
        if ($update->progress_percent !== null) {
            $taskPayload['progress_percent'] = $update->progress_percent;
        }
        if (! empty($taskPayload)) {
            if (($taskPayload['status'] ?? $task->status) === 'done') {
                $taskPayload['completed_at'] = now();
            }
            $task->update($taskPayload);
        }

        return response()->json($update->fresh()->load(['submitter', 'reviewer']));
    }

    public function reject(Task $task, TaskUpdate $update, Request $request): JsonResponse
    {
        if (! $this->canReviewTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền từ chối báo cáo.'], 403);
        }
        if ($update->task_id !== $task->id) {
            return response()->json(['message' => 'Báo cáo không thuộc công việc.'], 422);
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
        return (int) $task->assignee_id === (int) $user->id;
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
