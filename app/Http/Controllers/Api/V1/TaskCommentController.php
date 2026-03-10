<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskComment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskCommentController extends Controller
{
    public function index(Task $task, Request $request): JsonResponse
    {
        return response()->json(
            $task->comments()
                ->with('user')
                ->latest()
                ->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Task $task, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'content' => ['required', 'string'],
            'tagged_user_ids' => ['nullable', 'array'],
            'tagged_user_ids.*' => ['integer', 'exists:users,id'],
            'attachment_path' => ['nullable', 'string', 'max:255'],
        ]);

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'content' => $validated['content'],
            'tagged_user_ids' => isset($validated['tagged_user_ids']) ? json_encode($validated['tagged_user_ids']) : null,
            'attachment_path' => $validated['attachment_path'] ?? null,
        ]);

        return response()->json($comment->load('user'), 201);
    }

    public function update(Task $task, TaskComment $comment, Request $request): JsonResponse
    {
        if ($comment->task_id !== $task->id) {
            return response()->json(['message' => 'Comment does not belong to task.'], 422);
        }

        if (! $this->canMutate($request, $comment)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'content' => ['required', 'string'],
            'tagged_user_ids' => ['nullable', 'array'],
            'tagged_user_ids.*' => ['integer', 'exists:users,id'],
            'attachment_path' => ['nullable', 'string', 'max:255'],
        ]);

        $comment->update([
            'content' => $validated['content'],
            'tagged_user_ids' => isset($validated['tagged_user_ids']) ? json_encode($validated['tagged_user_ids']) : null,
            'attachment_path' => $validated['attachment_path'] ?? null,
        ]);

        return response()->json($comment->load('user'));
    }

    public function destroy(Task $task, TaskComment $comment, Request $request): JsonResponse
    {
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

        return in_array($user->role, ['admin', 'truong_phong_san_xuat'], true);
    }
}
