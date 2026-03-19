<?php

namespace App\Services;

use App\Models\Task;
use App\Services\ProjectProgressService;

class TaskProgressService
{
    public static function recalc(Task $task): void
    {
        $items = $task->items()->get(['id', 'progress_percent', 'weight_percent', 'status']);
        if ($items->isEmpty()) {
            $task->update([
                'progress_percent' => 0,
                'status' => $task->status === 'done' ? 'todo' : $task->status,
                'completed_at' => null,
            ]);
            return;
        }

        $avg = self::weightedProgress($items);

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

    private static function weightedProgress($items): int
    {
        $weightedSum = 0;
        $totalWeight = 0;

        foreach ($items as $item) {
            $weight = (int) ($item->weight_percent ?? 0);
            if ($weight <= 0) {
                continue;
            }

            $totalWeight += $weight;
            $progress = max(0, min(100, (int) ($item->progress_percent ?? 0)));
            $weightedSum += (($progress * $weight) / 100);
        }

        if ($totalWeight > 0) {
            return max(0, min(100, (int) round($weightedSum)));
        }

        return 0;
    }
}
