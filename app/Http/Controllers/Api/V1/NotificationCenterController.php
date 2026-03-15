<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\DeadlineReminder;
use App\Models\InAppNotification;
use App\Models\NotificationRead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationCenterController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $reads = NotificationRead::query()
            ->where('user_id', $user->id)
            ->get()
            ->keyBy(function ($item) {
                return $item->source_type.':'.$item->source_id;
            });

        $notifications = InAppNotification::query()
            ->where('user_id', $user->id)
            ->orderByDesc('id')
            ->limit((int) $request->input('notify_limit', 30))
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'type' => $item->type,
                    'title' => $item->title,
                    'body' => $item->body,
                    'data' => $item->data,
                    'created_at' => $item->created_at,
                    'read_at' => $item->read_at,
                    'is_read' => ! is_null($item->read_at),
                ];
            });

        $remindersQuery = DeadlineReminder::query()->with(['task', 'taskItem']);
        if (! in_array($user->role, ['admin'], true)) {
            $remindersQuery->where(function ($builder) use ($user) {
                $builder->whereHas('task', function ($taskQuery) use ($user) {
                    $taskQuery->where('assignee_id', $user->id);
                })->orWhereHas('taskItem', function ($itemQuery) use ($user) {
                    $itemQuery->where('assignee_id', $user->id);
                });
            });
        }

        $reminders = $remindersQuery
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
                    'task_title' => optional($item->task)->title,
                    'scheduled_at' => $item->scheduled_at,
                    'sent_at' => $item->sent_at,
                    'is_read' => isset($reads[$key]) && !is_null($reads[$key]->read_at),
                ];
            });

        $logsQuery = ActivityLog::query()->with('user')->orderByDesc('created_at');
        if (! in_array($user->role, ['admin', 'ke_toan'], true)) {
            if ($user->role === 'quan_ly') {
                $logsQuery->where(function ($builder) use ($user) {
                    $builder->where('user_id', $user->id)
                        ->orWhere('changes->manager_id', $user->id);
                });
            } else {
                $logsQuery->where('user_id', $user->id);
            }
        }

        $logs = $logsQuery
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

        $unreadInApp = InAppNotification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();
        $unreadReminders = $reminders->where('is_read', false)->count();
        $unreadLogs = $logs->where('is_read', false)->count();

        return response()->json([
            'notifications' => $notifications,
            'reminders' => $reminders,
            'logs' => $logs,
            'unread_count' => $unreadInApp + $unreadReminders + $unreadLogs,
            'unread_in_app' => $unreadInApp,
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

    public function markAllRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'source_type' => ['nullable', 'in:deadline_reminder,activity_log,in_app'],
        ]);

        $sourceType = $validated['source_type'] ?? 'all';

        if (in_array($sourceType, ['all', 'in_app'], true)) {
            InAppNotification::query()
                ->where('user_id', $request->user()->id)
                ->whereNull('read_at')
                ->update(['read_at' => now()]);
            if ($sourceType === 'in_app') {
                return response()->json(['message' => 'Đã đánh dấu tất cả là đã đọc.']);
            }
        }

        if (in_array($sourceType, ['all', 'deadline_reminder'], true)) {
            $ids = DeadlineReminder::query()->pluck('id')->all();
            foreach ($ids as $id) {
                NotificationRead::updateOrCreate(
                    [
                        'user_id' => $request->user()->id,
                        'source_type' => 'deadline_reminder',
                        'source_id' => $id,
                    ],
                    [
                        'read_at' => now(),
                    ]
                );
            }
            if ($sourceType === 'deadline_reminder') {
                return response()->json(['message' => 'Đã đánh dấu tất cả là đã đọc.']);
            }
        }

        $ids = ActivityLog::query()->pluck('id')->all();
        foreach ($ids as $id) {
            NotificationRead::updateOrCreate(
                [
                    'user_id' => $request->user()->id,
                    'source_type' => 'activity_log',
                    'source_id' => $id,
                ],
                [
                    'read_at' => now(),
                ]
            );
        }

        return response()->json(['message' => 'Đã đánh dấu tất cả là đã đọc.']);
    }
}
