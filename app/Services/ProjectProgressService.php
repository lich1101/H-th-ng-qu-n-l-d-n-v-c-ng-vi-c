<?php

namespace App\Services;

use App\Models\Project;

class ProjectProgressService
{
    public static function recalc(Project $project): void
    {
        $tasks = $project->tasks()->get(['id', 'progress_percent', 'weight_percent', 'status']);
        if ($tasks->isEmpty()) {
            $project->update(['progress_percent' => 0]);
            return;
        }

        $avg = self::weightedProgress($tasks);

        $project->update(['progress_percent' => $avg]);
    }

    private static function weightedProgress($tasks): int
    {
        $weightedSum = 0;
        $totalWeight = 0;

        foreach ($tasks as $task) {
            $weight = (int) ($task->weight_percent ?? 0);
            if ($weight <= 0) {
                continue;
            }

            $totalWeight += $weight;
            $progress = max(0, min(100, (int) ($task->progress_percent ?? 0)));
            $weightedSum += (($progress * $weight) / 100);
        }

        if ($totalWeight > 0) {
            return max(0, min(100, (int) round($weightedSum)));
        }

        return 0;
    }
}
