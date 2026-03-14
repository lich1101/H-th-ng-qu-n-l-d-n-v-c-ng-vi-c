<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Services\FirebaseService;
use App\Services\NotificationService;
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
        $comments = $task->comments()
            ->with('user')
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        $this->attachTaggedUsers($comments->getCollection());

        return response()->json($comments);
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

        $comment->load('user');
        $taggedUsers = $this->attachTaggedUsers(collect([$comment]));
        $this->syncFirebase($task, $comment, $taggedUsers);
        $this->notifyTaggedUsers($request->user()->id, $taggedUsers, $task, $comment);

        return response()->json($comment, 201);
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

        $comment->load('user');
        $taggedUsers = $this->attachTaggedUsers(collect([$comment]));
        $this->syncFirebase($task, $comment, $taggedUsers);
        $this->notifyTaggedUsers($request->user()->id, $taggedUsers, $task, $comment);

        return response()->json($comment);
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

        $firebase = app(FirebaseService::class);
        $firebase->deleteTaskMessage($task->id, $comment->id);

        return response()->json(['message' => 'Comment deleted.']);
    }

    public function participants(Task $task, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem danh sách chat.'], 403);
        }

        $participants = $this->resolveChatParticipants($task)
            ->map(function ($user) {
                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'role' => $user->role,
                    'email' => $user->email,
                ];
            });

        return response()->json(['data' => $participants]);
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

        $participants = $this->resolveChatParticipantIds($task);
        return $participants->contains($user->id);
    }

    private function resolveChatParticipants(Task $task)
    {
        $ids = $this->resolveChatParticipantIds($task);
        return User::query()
            ->whereIn('id', $ids)
            ->get(['id', 'name', 'role', 'email']);
    }

    private function resolveChatParticipantIds(Task $task)
    {
        $ids = collect();
        $adminIds = User::query()->where('role', 'admin')->pluck('id');
        $ids = $ids->merge($adminIds);

        if ($task->department_id) {
            $managerId = Department::query()
                ->where('id', $task->department_id)
                ->value('manager_id');
            if ($managerId) {
                $ids->push($managerId);
            }
        }

        $itemAssignees = $task->items()
            ->whereNotNull('assignee_id')
            ->pluck('assignee_id');
        $ids = $ids->merge($itemAssignees);

        if ($task->assignee_id) {
            $ids->push($task->assignee_id);
        }

        return $ids->filter()->unique()->values();
    }

    private function attachTaggedUsers($comments)
    {
        $comments = collect($comments);
        if ($comments->isEmpty()) {
            return collect();
        }

        $tagIds = $comments
            ->flatMap(fn ($comment) => $comment->tagged_user_ids ?? [])
            ->filter()
            ->unique()
            ->values();

        $users = $tagIds->isEmpty()
            ? collect()
            : User::query()->whereIn('id', $tagIds)->get(['id', 'name', 'role'])->keyBy('id');

        $comments->each(function ($comment) use ($users) {
            $tagged = collect($comment->tagged_user_ids ?? [])
                ->map(fn ($id) => $users->get($id))
                ->filter()
                ->values();
            $comment->setAttribute('tagged_users', $tagged);
        });

        return $users->values();
    }

    private function syncFirebase(Task $task, TaskComment $comment, $taggedUsers): void
    {
        $firebase = app(FirebaseService::class);
        $user = $comment->user;
        $payload = [
            'task_id' => $task->id,
            'content' => $comment->content,
            'created_at' => optional($comment->created_at)->toIso8601String(),
            'updated_at' => optional($comment->updated_at)->toIso8601String(),
            'user_id' => $comment->user_id,
            'user' => [
                'id' => $comment->user_id,
                'name' => $user ? $user->name : null,
                'role' => $user ? $user->role : null,
            ],
            'tagged_user_ids' => $comment->tagged_user_ids ?? [],
            'tagged_users' => collect($taggedUsers)
                ->map(function ($u) {
                    return [
                        'id' => $u->id,
                        'name' => $u->name,
                        'role' => $u->role,
                    ];
                })
                ->values()
                ->all(),
            'attachment_path' => $comment->attachment_path,
        ];

        $firebase->pushTaskMessage($task->id, $comment->id, $payload);
    }

    private function notifyTaggedUsers(int $senderId, $taggedUsers, Task $task, TaskComment $comment): void
    {
        $users = collect($taggedUsers)->filter();
        if ($users->isEmpty()) {
            return;
        }
        $ids = $users->pluck('id')->filter()->unique()->values()->all();
        $ids = array_values(array_filter($ids, fn ($id) => (int) $id !== (int) $senderId));
        if (empty($ids)) {
            return;
        }

        $notifier = app(NotificationService::class);
        $title = 'Bạn được nhắc đến trong trao đổi';
        $body = 'Công việc: '.$task->title;
        $notifier->notifyUsers($ids, $title, $body, [
            'type' => 'task_comment_tag',
            'task_id' => $task->id,
            'comment_id' => $comment->id,
        ]);
    }
}
