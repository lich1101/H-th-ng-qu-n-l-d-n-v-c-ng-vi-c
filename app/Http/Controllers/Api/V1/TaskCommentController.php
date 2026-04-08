<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\ProjectScope;
use App\Models\InAppNotification;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Services\FirebaseService;
use App\Services\NotificationService;
use App\Services\ProjectFileService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class TaskCommentController extends Controller
{
    private const CHAT_NOTIFICATION_TYPES = [
        'task_chat_message',
        'task_comment_tag',
    ];

    public function index(Task $task, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem trao đổi.'], 403);
        }
        $comments = $task->comments()
            ->with('user:id,name,email,role,avatar_url')
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        $commentRows = collect($comments->items());
        $this->attachTaggedUsers($commentRows);

        return response()->json([
            'data' => $commentRows->values()->all(),
            'current_page' => $comments->currentPage(),
            'last_page' => $comments->lastPage(),
            'per_page' => $comments->perPage(),
            'total' => $comments->total(),
            'chat_enabled' => ! $this->taskChatLocked($task),
            'chat_disabled_reason' => $this->taskChatDisabledReason($task),
        ]);
    }

    public function store(Task $task, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền gửi trao đổi.'], 403);
        }
        if ($this->taskChatLocked($task)) {
            return response()->json(['message' => $this->taskChatDisabledReason($task)], 422);
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
            $attachmentPath = $this->storeAttachment($task, $request);
        }

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'content' => $validated['content'],
            'tagged_user_ids' => $validated['tagged_user_ids'] ?? null,
            'attachment_path' => $attachmentPath,
        ]);

        $comment->load('user:id,name,email,role,avatar_url');
        $taggedUsers = $this->attachTaggedUsers(collect([$comment]));
        try {
            $this->syncFirebase($task, $comment, $taggedUsers);
        } catch (\Throwable $e) {
            report($e);
        }
        $taggedIds = $this->notifyTaggedUsers($request->user()->id, $taggedUsers, $task, $comment);
        $this->notifyChatParticipants($request->user()->id, $task, $comment, $taggedIds);

        return response()->json($comment, 201);
    }

    public function update(Task $task, TaskComment $comment, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền cập nhật trao đổi.'], 403);
        }
        if ($this->taskChatLocked($task)) {
            return response()->json(['message' => $this->taskChatDisabledReason($task)], 422);
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

        $previousAttachmentPath = $comment->attachment_path;
        $attachmentPath = $comment->attachment_path;
        if ($request->hasFile('attachment')) {
            $attachmentPath = $this->storeAttachment($task, $request);
        } elseif (array_key_exists('attachment_path', $validated)) {
            $attachmentPath = $validated['attachment_path'];
        }

        if (! empty($previousAttachmentPath) && $previousAttachmentPath !== $attachmentPath) {
            app(ProjectFileService::class)->deleteByPublicUrl($previousAttachmentPath);
        }

        $comment->update([
            'content' => $validated['content'],
            'tagged_user_ids' => $validated['tagged_user_ids'] ?? null,
            'attachment_path' => $attachmentPath,
            'is_recalled' => false,
            'recalled_at' => null,
        ]);

        $comment->load('user:id,name,email,role,avatar_url');
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
        if ($this->taskChatLocked($task)) {
            return response()->json(['message' => $this->taskChatDisabledReason($task)], 422);
        }
        if ($comment->task_id !== $task->id) {
            return response()->json(['message' => 'Comment does not belong to task.'], 422);
        }

        if (! $this->canMutate($request, $comment)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $previousAttachmentPath = $comment->attachment_path;
        if (! $comment->is_recalled) {
            $comment->update([
                'content' => '',
                'tagged_user_ids' => null,
                'attachment_path' => null,
                'is_recalled' => true,
                'recalled_at' => now(),
            ]);
        }

        if (! empty($previousAttachmentPath)) {
            app(ProjectFileService::class)->deleteByPublicUrl($previousAttachmentPath);
        }

        $comment->load('user:id,name,email,role,avatar_url');
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
            ->when($request->filled('search'), function ($collection) use ($request) {
                $keyword = strtolower(trim((string) $request->input('search')));
                return $collection->filter(function ($user) use ($keyword) {
                    $name = strtolower((string) ($user->name ?? ''));
                    $email = strtolower((string) ($user->email ?? ''));
                    return str_contains($name, $keyword) || str_contains($email, $keyword);
                })->values();
            })
            ->map(function ($user) {
                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'role' => $user->role,
                    'email' => $user->email,
                    'avatar_url' => $user->avatar_url,
                ];
            });

        return response()->json([
            'data' => $participants,
            'meta' => [
                'chat_enabled' => ! $this->taskChatLocked($task),
                'chat_disabled_reason' => $this->taskChatDisabledReason($task),
                'scope_labels' => [
                    'Admin / Administrator',
                    'Người phụ trách dự án',
                    'Người phụ trách công việc',
                    'Tất cả người phụ trách đầu việc',
                ],
            ],
        ]);
    }

    public function threads(Request $request): JsonResponse
    {
        $user = $request->user();
        $limit = max(10, min(500, (int) $request->input('limit', 500)));

        $query = Task::query()
            ->with([
                'project:id,name,code',
                'department:id,name',
                'assignee:id,name,email,avatar_url',
                'latestComment.user:id,name,email,avatar_url',
            ])
            ->withCount('comments')
            ->withMax('comments', 'created_at');

        $this->applyChatScope($query, $user);

        if ($request->filled('search')) {
            $keyword = trim((string) $request->input('search'));
            $query->where(function (Builder $builder) use ($keyword) {
                $builder->where('title', 'like', "%{$keyword}%")
                    ->orWhere('description', 'like', "%{$keyword}%")
                    ->orWhereHas('project', function (Builder $projectQuery) use ($keyword) {
                        $projectQuery->where('name', 'like', "%{$keyword}%")
                            ->orWhere('code', 'like', "%{$keyword}%");
                    })
                    ->orWhereHas('assignee', function (Builder $assigneeQuery) use ($keyword) {
                        $assigneeQuery->where('name', 'like', "%{$keyword}%")
                            ->orWhere('email', 'like', "%{$keyword}%");
                    })
                    ->orWhereHas('comments', function (Builder $commentQuery) use ($keyword) {
                        $commentQuery->where('content', 'like', "%{$keyword}%");
                    });
            });
        }

        $tasks = $query
            ->orderByRaw('COALESCE(comments_max_created_at, updated_at, created_at) DESC')
            ->limit($limit)
            ->get();

        $unreadByTask = InAppNotification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->whereIn('type', self::CHAT_NOTIFICATION_TYPES)
            ->whereRaw("JSON_EXTRACT(data, '$.task_id') IS NOT NULL")
            ->selectRaw("CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.task_id')) AS UNSIGNED) as task_id, COUNT(*) as unread_count")
            ->groupBy(DB::raw("CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.task_id')) AS UNSIGNED)"))
            ->get()
            ->keyBy(function ($row) {
                return (int) $row->task_id;
            });

        $threads = $tasks->map(function (Task $task) use ($unreadByTask) {
            $latestComment = $task->latestComment;
            $activityAt = optional($latestComment)->created_at ?: $task->updated_at ?: $task->created_at;
            $unreadCount = (int) ($unreadByTask->get((int) $task->id)->unread_count ?? 0);

            $preview = 'Chưa có tin nhắn nào.';
            if ($latestComment) {
                if ($latestComment->is_recalled) {
                    $preview = 'Tin nhắn đã được thu hồi.';
                } elseif (! empty(trim((string) $latestComment->content))) {
                    $preview = $latestComment->content;
                } elseif (! empty($latestComment->attachment_path)) {
                    $preview = 'Đã gửi tệp đính kèm.';
                }
            }

            return [
                'key' => 'task:'.$task->id,
                'task_id' => (int) $task->id,
                'title' => $task->title,
                'task_status' => $task->status,
                'body' => $preview,
                'project_name' => optional($task->project)->name,
                'project_code' => optional($task->project)->code,
                'department_name' => optional($task->department)->name,
                'assignee_name' => optional($task->assignee)->name,
                'last_actor_name' => optional(optional($latestComment)->user)->name,
                'last_comment_id' => $latestComment ? (int) $latestComment->id : null,
                'comment_count' => (int) ($task->comments_count ?? 0),
                'unread_count' => $unreadCount,
                'is_read' => $unreadCount <= 0,
                'activity_at' => optional($activityAt)->toIso8601String(),
                'project_handover_status' => optional($task->project)->handover_status,
                'chat_enabled' => ! $this->taskChatLocked($task),
                'chat_disabled_reason' => $this->taskChatDisabledReason($task),
            ];
        })->values();

        return response()->json([
            'data' => $threads,
            'meta' => [
                'limit' => $limit,
                'total' => $threads->count(),
            ],
        ]);
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
        return ProjectScope::canAccessTaskChat($user, $task);
    }

    private function applyChatScope(Builder $query, $user): void
    {
        ProjectScope::applyTaskChatScope($query, $user);
    }

    private function resolveChatParticipants(Task $task)
    {
        $ids = $this->resolveChatParticipantIds($task);
        return User::query()
            ->whereIn('id', $ids)
            ->get(['id', 'name', 'role', 'email', 'avatar_url']);
    }

    private function resolveChatParticipantIds(Task $task)
    {
        return ProjectScope::resolveChatParticipantIds($task);
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
            'attachment_name' => $comment->attachment_name,
        ];

        $firebase->pushTaskMessage($task->id, $comment->id, $payload);
    }

    private function notifyTaggedUsers(int $senderId, $taggedUsers, Task $task, TaskComment $comment): array
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
            return [];
        }
        $ids = $users->pluck('id')->filter()->unique()->values()->all();
        $ids = array_values(array_filter($ids, function ($id) use ($senderId) {
            return (int) $id !== (int) $senderId;
        }));
        if (empty($ids)) {
            return [];
        }

        $notifier = app(NotificationService::class);
        $title = 'Bạn được nhắc đến trong trao đổi';
        $body = 'Công việc: '.$task->title;
        try {
            $notifier->notifyUsersAfterResponse($ids, $title, $body, [
                'type' => 'task_comment_tag',
                'task_id' => $task->id,
                'comment_id' => $comment->id,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }

        return $ids;
    }

    private function notifyChatParticipants(int $senderId, Task $task, TaskComment $comment, array $excludedUserIds = []): void
    {
        $participantIds = $this->resolveChatParticipantIds($task)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) use ($senderId, $excludedUserIds) {
                return $id > 0
                    && $id !== (int) $senderId
                    && ! in_array((int) $id, $excludedUserIds, true);
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
            $notifier->notifyUsersAfterResponse($participantIds, $title, $body, [
                'type' => 'task_chat_message',
                'task_id' => $task->id,
                'comment_id' => $comment->id,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function taskChatLocked(Task $task): bool
    {
        $handoverStatus = $task->relationLoaded('project')
            ? (string) optional($task->project)->handover_status
            : (string) $task->project()->value('handover_status');

        return $handoverStatus === 'approved';
    }

    private function taskChatDisabledReason(Task $task): ?string
    {
        if ($this->taskChatLocked($task)) {
            return 'Dự án đã bàn giao xong, chat công việc đã bị khóa.';
        }

        return null;
    }

    private function storeAttachment(Task $task, Request $request): string
    {
        if (! $request->hasFile('attachment')) {
            return '';
        }

        if ($task->project) {
            $fileService = app(ProjectFileService::class);
            $chatFolder = $fileService->ensureFolder(
                $task->project,
                'Trao doi cong viec',
                $request->user()->id
            );

            $projectFile = $fileService->upload(
                $task->project,
                $request->file('attachment'),
                $request->user()->id,
                $chatFolder,
                $task->title
            );

            return $fileService->publicUrl($projectFile->path) ?? '';
        }

        $storedPath = $request->file('attachment')->store('task_comments', 'public');

        return Storage::url($storedPath);
    }
}
