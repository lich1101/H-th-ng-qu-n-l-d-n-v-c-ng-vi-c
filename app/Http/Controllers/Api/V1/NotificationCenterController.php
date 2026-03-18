<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\DeadlineReminder;
use App\Models\InAppNotification;
use App\Models\NotificationRead;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationCenterController extends Controller
{
    private const CHAT_NOTIFICATION_TYPES = [
        'task_chat_message',
        'task_comment_tag',
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $reads = NotificationRead::query()
            ->where('user_id', $user->id)
            ->get()
            ->keyBy(function ($item) {
                return $item->source_type.':'.$item->source_id;
            });

        $inAppQuery = InAppNotification::query()
            ->where('user_id', $user->id)
            ->orderByDesc('id');

        $notifications = (clone $inAppQuery)
            ->orderByDesc('id')
            ->limit((int) $request->input('notify_limit', 30))
            ->get()
            ->map(function ($item) {
                $data = is_array($item->data) ? $item->data : [];
                return [
                    'id' => $item->id,
                    'type' => $item->type,
                    'title' => $item->title,
                    'body' => $item->body,
                    'data' => $item->data,
                    'task_id' => isset($data['task_id']) ? (int) $data['task_id'] : null,
                    'comment_id' => isset($data['comment_id']) ? (int) $data['comment_id'] : null,
                    'created_at' => $item->created_at,
                    'read_at' => $item->read_at,
                    'is_read' => ! is_null($item->read_at),
                ];
            });

        $remindersScope = $this->remindersScopeForUser($user);

        $reminders = (clone $remindersScope)
            ->with(['task', 'taskItem'])
            ->orderByDesc('scheduled_at')
            ->limit((int) $request->input('reminder_limit', 20))
            ->get()
            ->map(function ($item) use ($reads) {
                $key = 'deadline_reminder:'.$item->id;
                return [
                    'id' => $item->id,
                    'type' => 'deadline_reminder',
                    'status' => $item->status,
                    'channel' => $item->channel,
                    'trigger_type' => $item->trigger_type,
                    'task_id' => optional($item->task)->id,
                    'task_item_id' => optional($item->taskItem)->id,
                    'task_title' => optional($item->task)->title,
                    'scheduled_at' => $item->scheduled_at,
                    'sent_at' => $item->sent_at,
                    'is_read' => isset($reads[$key]) && !is_null($reads[$key]->read_at),
                ];
            });

        $logsScope = $this->activityLogsScopeForUser($user);

        $logs = (clone $logsScope)
            ->with('user')
            ->orderByDesc('created_at')
            ->limit((int) $request->input('log_limit', 20))
            ->get()
            ->map(function ($item) use ($reads) {
                $key = 'activity_log:'.$item->id;
                return [
                    'id' => $item->id,
                    'type' => 'activity_log',
                    'action' => $item->action,
                    'subject_type' => $item->subject_type,
                    'subject_id' => $item->subject_id,
                    'actor' => optional($item->user)->name,
                    'created_at' => $item->created_at,
                    'is_read' => isset($reads[$key]) && !is_null($reads[$key]->read_at),
                ];
            });

        $unreadInApp = (clone $inAppQuery)
            ->whereNull('read_at')
            ->count();
        $unreadChat = (clone $inAppQuery)
            ->whereNull('read_at')
            ->whereIn('type', self::CHAT_NOTIFICATION_TYPES)
            ->count();
        $unreadInAppNonChat = max(0, (int) $unreadInApp - (int) $unreadChat);

        $unreadReminders = (clone $remindersScope)
            ->whereNotExists(function ($query) use ($user) {
                $query->select(DB::raw(1))
                    ->from('notification_reads')
                    ->whereColumn('notification_reads.source_id', 'deadline_reminders.id')
                    ->where('notification_reads.user_id', $user->id)
                    ->where('notification_reads.source_type', 'deadline_reminder')
                    ->whereNotNull('notification_reads.read_at');
            })
            ->count();

        $unreadLogs = (clone $logsScope)
            ->whereNotExists(function ($query) use ($user) {
                $query->select(DB::raw(1))
                    ->from('notification_reads')
                    ->whereColumn('notification_reads.source_id', 'activity_logs.id')
                    ->where('notification_reads.user_id', $user->id)
                    ->where('notification_reads.source_type', 'activity_log')
                    ->whereNotNull('notification_reads.read_at');
            })
            ->count();

        $unreadNotification = (int) $unreadInAppNonChat + (int) $unreadReminders + (int) $unreadLogs;

        return response()->json([
            'notifications' => $notifications,
            'reminders' => $reminders,
            'logs' => $logs,
            'unread_count' => (int) $unreadChat + $unreadNotification,
            'unread_in_app' => $unreadInApp,
            'unread_chat' => (int) $unreadChat,
            'unread_notification' => $unreadNotification,
            'unread_breakdown' => [
                'in_app_chat' => (int) $unreadChat,
                'in_app_non_chat' => (int) $unreadInAppNonChat,
                'deadline_reminder' => (int) $unreadReminders,
                'activity_log' => (int) $unreadLogs,
            ],
        ]);
    }

    public function markRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'source_type' => ['required', 'in:deadline_reminder,activity_log,in_app'],
            'source_id' => ['required', 'integer', 'min:1'],
        ]);

        if ($validated['source_type'] === 'in_app') {
            InAppNotification::query()
                ->where('id', $validated['source_id'])
                ->where('user_id', $request->user()->id)
                ->update(['read_at' => now()]);
            return response()->json(['message' => 'Đã đánh dấu đã đọc.']);
        }

        NotificationRead::updateOrCreate(
            [
                'user_id' => $request->user()->id,
                'source_type' => $validated['source_type'],
                'source_id' => $validated['source_id'],
            ],
            [
                'read_at' => now(),
            ]
        );

        return response()->json(['message' => 'Đã đánh dấu đã đọc.']);
    }

    public function markTaskChatRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'task_id' => ['required', 'integer', 'min:1'],
        ]);

        InAppNotification::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->whereIn('type', self::CHAT_NOTIFICATION_TYPES)
            ->where('data->task_id', $validated['task_id'])
            ->update(['read_at' => now()]);

        return response()->json(['message' => 'Đã đánh dấu hội thoại là đã đọc.']);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'source_type' => ['nullable', 'in:deadline_reminder,activity_log,in_app,chat_in_app,non_chat_in_app'],
        ]);

        $sourceType = $validated['source_type'] ?? 'all';
        $user = $request->user();
        $now = now();

        if (in_array($sourceType, ['all', 'in_app'], true)) {
            InAppNotification::query()
                ->where('user_id', $user->id)
                ->whereNull('read_at')
                ->update(['read_at' => $now]);
            if ($sourceType === 'in_app') {
                return response()->json(['message' => 'Đã đánh dấu tất cả là đã đọc.']);
            }
        }

        if ($sourceType === 'chat_in_app') {
            InAppNotification::query()
                ->where('user_id', $user->id)
                ->whereNull('read_at')
                ->whereIn('type', self::CHAT_NOTIFICATION_TYPES)
                ->update(['read_at' => $now]);
            return response()->json(['message' => 'Đã đánh dấu tất cả chat là đã đọc.']);
        }

        if ($sourceType === 'non_chat_in_app') {
            InAppNotification::query()
                ->where('user_id', $user->id)
                ->whereNull('read_at')
                ->where(function ($query) {
                    $query->whereNull('type')
                        ->orWhereNotIn('type', self::CHAT_NOTIFICATION_TYPES);
                })
                ->update(['read_at' => $now]);
            return response()->json(['message' => 'Đã đánh dấu thông báo hệ thống là đã đọc.']);
        }

        if (in_array($sourceType, ['all', 'deadline_reminder'], true)) {
            $this->markScopeAsRead(
                $this->remindersScopeForUser($user),
                $user->id,
                'deadline_reminder'
            );
            if ($sourceType === 'deadline_reminder') {
                return response()->json(['message' => 'Đã đánh dấu tất cả là đã đọc.']);
            }
        }

        if (in_array($sourceType, ['all', 'activity_log'], true)) {
            $this->markScopeAsRead(
                $this->activityLogsScopeForUser($user),
                $user->id,
                'activity_log'
            );
        }

        return response()->json(['message' => 'Đã đánh dấu tất cả là đã đọc.']);
    }

    public function clearRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'source_type' => ['nullable', 'in:deadline_reminder,activity_log,in_app,all'],
        ]);

        $sourceType = $validated['source_type'] ?? 'in_app';
        $userId = $request->user()->id;
        $deleted = 0;

        if (in_array($sourceType, ['all', 'in_app'], true)) {
            $deleted += InAppNotification::query()
                ->where('user_id', $userId)
                ->whereNotNull('read_at')
                ->delete();
            if ($sourceType === 'in_app') {
                return response()->json(['message' => 'Đã xóa thông báo đã xem.']);
            }
        }

        if (in_array($sourceType, ['all', 'deadline_reminder'], true)) {
            $deleted += NotificationRead::query()
                ->where('user_id', $userId)
                ->where('source_type', 'deadline_reminder')
                ->whereNotNull('read_at')
                ->delete();
        }

        if (in_array($sourceType, ['all', 'activity_log'], true)) {
            $deleted += NotificationRead::query()
                ->where('user_id', $userId)
                ->where('source_type', 'activity_log')
                ->whereNotNull('read_at')
                ->delete();
        }

        return response()->json([
            'message' => 'Đã xóa thông báo đã xem.',
            'deleted' => $deleted,
        ]);
    }

    private function remindersScopeForUser(User $user): Builder
    {
        $scope = DeadlineReminder::query();
        if (! in_array($user->role, ['admin'], true)) {
            $scope->where(function ($builder) use ($user) {
                $builder->whereHas('task', function ($taskQuery) use ($user) {
                    $taskQuery->where('assignee_id', $user->id);
                })->orWhereHas('taskItem', function ($itemQuery) use ($user) {
                    $itemQuery->where('assignee_id', $user->id);
                });
            });
        }

        return $scope;
    }

    private function activityLogsScopeForUser(User $user): Builder
    {
        $scope = ActivityLog::query();
        if (! in_array($user->role, ['admin', 'ke_toan'], true)) {
            if ($user->role === 'quan_ly') {
                $scope->where(function ($builder) use ($user) {
                    $builder->where('user_id', $user->id)
                        ->orWhere('changes->manager_id', $user->id);
                });
            } else {
                $scope->where('user_id', $user->id);
            }
        }

        return $scope;
    }

    private function markScopeAsRead(Builder $scope, int $userId, string $sourceType): void
    {
        $now = now();
        (clone $scope)
            ->select('id')
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($userId, $sourceType, $now) {
                if ($rows->isEmpty()) {
                    return;
                }

                $payload = $rows->map(function ($row) use ($userId, $sourceType, $now) {
                    return [
                        'user_id' => $userId,
                        'source_type' => $sourceType,
                        'source_id' => $row->id,
                        'read_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                })->all();

                NotificationRead::query()->upsert(
                    $payload,
                    ['user_id', 'source_type', 'source_id'],
                    ['read_at', 'updated_at']
                );
            });
    }
}
