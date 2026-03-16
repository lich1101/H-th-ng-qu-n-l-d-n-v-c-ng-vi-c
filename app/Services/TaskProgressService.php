<?php

namespace App\Services;

use App\Models\Task;
use App\Services\ProjectProgressService;

class TaskProgressService
{
    public static function recalc(Task $task): void
    {
        $items = $task->items()->get();
        if ($items->isEmpty()) {
            $task->update([
                'progress_percent' => 0,
                'status' => $task->status === 'done' ? 'todo' : $task->status,
                'completed_at' => null,
            ]);
            return;
        }

        $avg = (int) round($items->avg('progress_percent') ?? 0);
        $avg = max(0, min(100, $avg));

        $statuses = $items->pluck('status')->filter()->map(function ($s) {
            return (string) $s;
        })->all();
        $allDone = count($statuses) > 0 && collect($statuses)->every(function ($s) {
            return $s === 'done';
        });
        $hasDoing = in_array('doing', $statuses, true);
        $hasBlocked = in_array('blocked', $statuses, true);

        $status = 'todo';
        if ($allDone) {
            $status = 'done';
        } elseif ($hasDoing) {
            $status = 'doing';
        } elseif ($hasBlocked) {
            $status = 'blocked';
        }

        $payload = [
            'progress_percent' => $avg,
            'status' => $status,
        ];
        if ($status === 'done') {
            $payload['completed_at'] = now();
        } else {
            $payload['completed_at'] = null;
        }

        $task->update($payload);

        if ($task->project) {
            try {
                ProjectProgressService::recalc($task->project);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
