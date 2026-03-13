<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskComment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskCommentController extends Controller
{
    public function index(Task $task, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem trao đổi.'], 403);
        }
        return response()->json(
            $task->comments()
                ->with('user')
                ->latest()
                ->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Task $task, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền gửi trao đổi.'], 403);
        }
        $this->normalizeTaggedIds($request);
        $validated = $request->validate([
            'content' => ['required', 'string'],
            'tagged_user_ids' => ['nullable', 'array'],
            'tagged_user_ids.*' => ['integer', 'exists:users,id'],
            'attachment_path' => ['nullable', 'string', 'max:255'],
            'attachment' => ['nullable', 'file', 'max:10240'],
        ]);

        $attachmentPath = $validated['attachment_path'] ?? null;
        if ($request->hasFile('attachment')) {
            $storedPath = $request->file('attachment')->store('task_comments', 'public');
            $attachmentPath = Storage::url($storedPath);
        }

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'content' => $validated['content'],
            'tagged_user_ids' => isset($validated['tagged_user_ids']) ? json_encode($validated['tagged_user_ids']) : null,
            'attachment_path' => $attachmentPath,
        ]);

        return response()->json($comment->load('user'), 201);
    }

    public function update(Task $task, TaskComment $comment, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền cập nhật trao đổi.'], 403);
        }
        if ($comment->task_id !== $task->id) {
            return response()->json(['message' => 'Comment does not belong to task.'], 422);
        }

        if (! $this->canMutate($request, $comment)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->normalizeTaggedIds($request);
        $validated = $request->validate([
            'content' => ['required', 'string'],
            'tagged_user_ids' => ['nullable', 'array'],
            'tagged_user_ids.*' => ['integer', 'exists:users,id'],
            'attachment_path' => ['nullable', 'string', 'max:255'],
            'attachment' => ['nullable', 'file', 'max:10240'],
        ]);

        $attachmentPath = $comment->attachment_path;
        if ($request->hasFile('attachment')) {
            $storedPath = $request->file('attachment')->store('task_comments', 'public');
            $attachmentPath = Storage::url($storedPath);
        } elseif (array_key_exists('attachment_path', $validated)) {
            $attachmentPath = $validated['attachment_path'];
        }

        $comment->update([
            'content' => $validated['content'],
            'tagged_user_ids' => isset($validated['tagged_user_ids']) ? json_encode($validated['tagged_user_ids']) : null,
            'attachment_path' => $attachmentPath,
        ]);

        return response()->json($comment->load('user'));
    }

    public function destroy(Task $task, TaskComment $comment, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xóa trao đổi.'], 403);
        }
        if ($comment->task_id !== $task->id) {
            return response()->json(['message' => 'Comment does not belong to task.'], 422);
        }

        if (! $this->canMutate($request, $comment)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $comment->delete();

        return response()->json(['message' => 'Comment deleted.']);
    }

    private function canMutate(Request $request, TaskComment $comment): bool
    {
        $user = $request->user();

        if (! $user) {
            return false;
        }

        if ($comment->user_id === $user->id) {
            return true;
        }

        return in_array($user->role, ['admin', 'quan_ly'], true);
    }

    private function normalizeTaggedIds(Request $request): void
    {
        $raw = $request->input('tagged_user_ids');
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $request->merge(['tagged_user_ids' => $decoded]);
                return;
            }
            if (str_contains($raw, ',')) {
                $list = array_filter(array_map('trim', explode(',', $raw)));
                $ids = array_values(array_filter($list, fn ($item) => is_numeric($item)));
                $request->merge(['tagged_user_ids' => $ids]);
            }
        }
    }

    private function canAccessTask($user, Task $task): bool
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
}
