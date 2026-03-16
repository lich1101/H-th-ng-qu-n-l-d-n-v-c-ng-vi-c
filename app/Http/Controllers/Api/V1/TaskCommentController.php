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
        if ($task->status === 'done') {
            return response()->json(['message' => 'Công việc đã hoàn thành, không thể gửi trao đổi.'], 422);
        }
        $this->normalizeTaggedIds($request);
        $validated = $request->validate([
            'content' => ['required', 'string'],
            'tagged_user_ids' => ['nullable', 'array'],
            'tagged_user_ids.*' => ['integer', 'exists:users,id'],
            'tagged_user_emails' => ['nullable', 'array'],
            'tagged_user_emails.*' => ['email'],
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
            'tagged_user_ids' => $validated['tagged_user_ids'] ?? null,
            'attachment_path' => $attachmentPath,
        ]);

        $comment->load('user');
        $taggedUsers = $this->attachTaggedUsers(collect([$comment]));
        try {
            $this->syncFirebase($task, $comment, $taggedUsers);
        } catch (\Throwable $e) {
            report($e);
        }
        $this->notifyTaggedUsers($request->user()->id, $taggedUsers, $task, $comment);
        $this->notifyChatParticipants($request->user()->id, $task, $comment);

        return response()->json($comment, 201);
    }

    public function update(Task $task, TaskComment $comment, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền cập nhật trao đổi.'], 403);
        }
        if ($task->status === 'done') {
            return response()->json(['message' => 'Công việc đã hoàn thành, không thể cập nhật trao đổi.'], 422);
        }
        if ($comment->task_id !== $task->id) {
            return response()->json(['message' => 'Comment does not belong to task.'], 422);
        }

        if (! $this->canMutate($request, $comment)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        if ($comment->is_recalled) {
            return response()->json(['message' => 'Tin nhắn đã bị thu hồi, không thể chỉnh sửa.'], 422);
        }

        $this->normalizeTaggedIds($request);
        $validated = $request->validate([
            'content' => ['required', 'string'],
            'tagged_user_ids' => ['nullable', 'array'],
            'tagged_user_ids.*' => ['integer', 'exists:users,id'],
            'tagged_user_emails' => ['nullable', 'array'],
            'tagged_user_emails.*' => ['email'],
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
            'tagged_user_ids' => $validated['tagged_user_ids'] ?? null,
            'attachment_path' => $attachmentPath,
            'is_recalled' => false,
            'recalled_at' => null,
        ]);

        $comment->load('user');
        $taggedUsers = $this->attachTaggedUsers(collect([$comment]));
        try {
            $this->syncFirebase($task, $comment, $taggedUsers);
        } catch (\Throwable $e) {
            report($e);
        }
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

        if (! $comment->is_recalled) {
            $comment->update([
                'content' => '',
                'tagged_user_ids' => null,
                'attachment_path' => null,
                'is_recalled' => true,
                'recalled_at' => now(),
            ]);
        }

        $comment->load('user');
        $taggedUsers = $this->attachTaggedUsers(collect([$comment]));
        try {
            $this->syncFirebase($task, $comment, $taggedUsers);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json(['message' => 'Comment recalled.']);
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
                    'avatar_url' => $user->avatar_url,
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

        return (int) $comment->user_id === (int) $user->id;
    }

    private function normalizeTaggedIds(Request $request): void
    {
        $ids = $request->input('tagged_user_ids');
        if (is_string($ids)) {
            $decoded = json_decode($ids, true);
            if (is_array($decoded)) {
                $ids = $decoded;
            } elseif (str_contains($ids, ',')) {
                $list = array_filter(array_map('trim', explode(',', $ids)));
                $ids = array_values(array_filter($list, function ($item) {
                    return is_numeric($item);
                }));
            }
        }

        $emails = $request->input('tagged_user_emails');
        if (is_string($emails)) {
            $decodedEmails = json_decode($emails, true);
            if (is_array($decodedEmails)) {
                $emails = $decodedEmails;
            } elseif (str_contains($emails, ',')) {
                $emails = array_filter(array_map('trim', explode(',', $emails)));
            }
        }

        $ids = is_array($ids) ? $ids : [];
        $emails = is_array($emails) ? $emails : [];

        $emails = array_values(array_filter(array_map('strtolower', $emails)));
        if (! empty($emails)) {
            $emailIds = User::query()
                ->whereIn('email', $emails)
                ->pluck('id')
                ->all();
            $ids = array_merge($ids, $emailIds);
        }

        $ids = array_values(array_unique(array_filter($ids)));
        if (! empty($ids) || $request->has('tagged_user_ids') || $request->has('tagged_user_emails')) {
            $request->merge(['tagged_user_ids' => $ids]);
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
            ->flatMap(function ($comment) {
                return $comment->tagged_user_ids ?? [];
            })
            ->filter()
            ->unique()
            ->values();

        $users = $tagIds->isEmpty()
            ? collect()
            : User::query()
                ->whereIn('id', $tagIds)
                ->get(['id', 'name', 'role', 'email', 'avatar_url'])
                ->keyBy('id');

        $comments->each(function ($comment) use ($users) {
            $tagged = collect($comment->tagged_user_ids ?? [])
                ->map(function ($id) use ($users) {
                    return $users->get($id);
                })
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
            'is_recalled' => (bool) $comment->is_recalled,
            'recalled_at' => optional($comment->recalled_at)->toIso8601String(),
            'user' => [
                'id' => $comment->user_id,
                'name' => $user ? $user->name : null,
                'role' => $user ? $user->role : null,
                'avatar_url' => $user ? $user->avatar_url : null,
            ],
            'tagged_user_ids' => $comment->tagged_user_ids ?? [],
            'tagged_users' => collect($taggedUsers)
                ->map(function ($u) {
                    return [
                        'id' => $u->id,
                        'name' => $u->name,
                        'role' => $u->role,
                        'email' => $u->email,
                        'avatar_url' => $u->avatar_url,
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
            $ids = collect($comment->tagged_user_ids ?? [])
                ->filter()
                ->unique()
                ->values()
                ->all();
            if (! empty($ids)) {
                $users = User::query()->whereIn('id', $ids)->get();
            }
        }
        if ($users->isEmpty()) {
            return;
        }
        $ids = $users->pluck('id')->filter()->unique()->values()->all();
        $ids = array_values(array_filter($ids, function ($id) use ($senderId) {
            return (int) $id !== (int) $senderId;
        }));
        if (empty($ids)) {
            return;
        }

        $notifier = app(NotificationService::class);
        $title = 'Bạn được nhắc đến trong trao đổi';
        $body = 'Công việc: '.$task->title;
        try {
            $notifier->notifyUsers($ids, $title, $body, [
                'type' => 'task_comment_tag',
                'task_id' => $task->id,
                'comment_id' => $comment->id,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function notifyChatParticipants(int $senderId, Task $task, TaskComment $comment): void
    {
        $participantIds = $this->resolveChatParticipantIds($task)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) use ($senderId) {
                return $id > 0 && $id !== (int) $senderId;
            })
            ->unique()
            ->values()
            ->all();

        if (empty($participantIds)) {
            return;
        }

        $notifier = app(NotificationService::class);
        $title = 'Tin nhắn mới trong công việc';
        $body = 'Công việc: '.$task->title;
        try {
            $notifier->notifyUsers($participantIds, $title, $body, [
                'type' => 'task_chat_message',
                'task_id' => $task->id,
                'comment_id' => $comment->id,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
