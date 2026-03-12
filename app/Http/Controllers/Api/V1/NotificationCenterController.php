<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\DeadlineReminder;
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

        $reminders = DeadlineReminder::query()
            ->with('task')
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

        return response()->json([
            'reminders' => $reminders,
            'logs' => $logs,
        ]);
    }

    public function markRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'source_type' => ['required', 'in:deadline_reminder,activity_log'],
            'source_id' => ['required', 'integer', 'min:1'],
        ]);

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
            'source_type' => ['required', 'in:deadline_reminder,activity_log'],
        ]);

        if ($validated['source_type'] === 'deadline_reminder') {
            $ids = DeadlineReminder::query()->pluck('id')->all();
        } else {
            $ids = ActivityLog::query()->pluck('id')->all();
        }

        foreach ($ids as $id) {
            NotificationRead::updateOrCreate(
                [
                    'user_id' => $request->user()->id,
                    'source_type' => $validated['source_type'],
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
