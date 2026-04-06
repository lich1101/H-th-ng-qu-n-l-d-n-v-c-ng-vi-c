<?php

namespace App\Services;

use App\Models\Project;
use App\Models\Task;
use App\Models\WorkflowTopic;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class WorkflowTopicApplierService
{
    public function applyToProject(Project $project, int $workflowTopicId, int $actorId): void
    {
        $topic = WorkflowTopic::query()
            ->with(['tasks.items'])
            ->where('is_active', true)
            ->find($workflowTopicId);

        if (! $topic || $topic->tasks->isEmpty()) {
            return;
        }

        $projectStart = $this->resolveProjectStart($project);
        $projectEnd = $this->resolveProjectEnd($project, $projectStart);
        $projectOwnerId = (int) ($project->owner_id ?? 0);
        $defaultTaskAssigneeId = $projectOwnerId > 0 ? $projectOwnerId : null;

        DB::transaction(function () use ($project, $topic, $actorId, $projectStart, $projectEnd, $defaultTaskAssigneeId) {
            foreach ($topic->tasks as $taskTemplate) {
                [$taskStart, $taskEnd] = $this->resolveRangeByOffset(
                    $projectStart,
                    $projectEnd,
                    (int) ($taskTemplate->start_offset_days ?? 0),
                    (int) ($taskTemplate->duration_days ?? 1)
                );

                $task = Task::query()->create([
                    'project_id' => (int) $project->id,
                    'department_id' => null,
                    'title' => (string) $taskTemplate->title,
                    'description' => $taskTemplate->description,
                    'priority' => (string) ($taskTemplate->priority ?: 'medium'),
                    'status' => (string) ($taskTemplate->status ?: 'todo'),
                    'start_at' => $taskStart->copy()->startOfDay(),
                    'deadline' => $taskEnd->copy()->endOfDay(),
                    'completed_at' => null,
                    'progress_percent' => 0,
                    'weight_percent' => max(1, min(100, (int) ($taskTemplate->weight_percent ?? 1))),
                    'created_by' => $actorId,
                    'assigned_by' => $actorId,
                    'assignee_id' => $defaultTaskAssigneeId,
                    'reviewer_id' => null,
                    'require_acknowledgement' => false,
                    'acknowledged_at' => null,
                ]);

                foreach ($taskTemplate->items as $itemTemplate) {
                    [$itemStart, $itemEnd] = $this->resolveRangeByOffset(
                        $taskStart,
                        $taskEnd,
                        (int) ($itemTemplate->start_offset_days ?? 0),
                        (int) ($itemTemplate->duration_days ?? 1)
                    );

                    $task->items()->create([
                        'title' => (string) $itemTemplate->title,
                        'description' => $itemTemplate->description,
                        'priority' => (string) ($itemTemplate->priority ?: 'medium'),
                        'status' => (string) ($itemTemplate->status ?: 'todo'),
                        'progress_percent' => 0,
                        'weight_percent' => max(1, min(100, (int) ($itemTemplate->weight_percent ?? 1))),
                        'start_date' => $itemStart->copy()->toDateString(),
                        'deadline' => $itemEnd->copy()->endOfDay(),
                        'assignee_id' => null,
                        'created_by' => $actorId,
                        'assigned_by' => $actorId,
                        'reviewer_id' => null,
                    ]);
                }
            }
        });

        try {
            ProjectProgressService::recalc($project);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function resolveProjectStart(Project $project): Carbon
    {
        if (! empty($project->start_date)) {
            return Carbon::parse($project->start_date, 'Asia/Ho_Chi_Minh')->startOfDay();
        }

        return Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
    }

    private function resolveProjectEnd(Project $project, Carbon $projectStart): Carbon
    {
        if (! empty($project->deadline)) {
            $deadline = Carbon::parse($project->deadline, 'Asia/Ho_Chi_Minh')->startOfDay();
            if ($deadline->lt($projectStart)) {
                return $projectStart->copy();
            }
            return $deadline;
        }

        return $projectStart->copy()->addDays(30);
    }

    private function resolveRangeByOffset(
        Carbon $parentStart,
        Carbon $parentEnd,
        int $startOffsetDays,
        int $durationDays
    ): array {
        $start = $parentStart->copy()->addDays($startOffsetDays);
        if ($start->lt($parentStart)) {
            $start = $parentStart->copy();
        }
        if ($start->gt($parentEnd)) {
            $start = $parentEnd->copy();
        }

        $normalizedDuration = max(1, $durationDays);
        $end = $start->copy()->addDays($normalizedDuration - 1);
        if ($end->gt($parentEnd)) {
            $end = $parentEnd->copy();
        }
        if ($end->lt($start)) {
            $end = $start->copy();
        }

        return [$start, $end];
    }
}
