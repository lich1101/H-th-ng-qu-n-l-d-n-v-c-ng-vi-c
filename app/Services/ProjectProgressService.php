<?php

namespace App\Services;

use App\Models\Project;

class ProjectProgressService
{
    public static function recalc(Project $project): void
    {
        $tasks = $project->tasks()->get(['id', 'progress_percent', 'status']);
        if ($tasks->isEmpty()) {
            $project->update(['progress_percent' => 0]);
            return;
        }

        $avg = (int) round($tasks->avg('progress_percent') ?? 0);
        $avg = max(0, min(100, $avg));

        $project->update(['progress_percent' => $avg]);
    }
}
