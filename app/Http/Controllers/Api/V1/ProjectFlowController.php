<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectFlowController extends Controller
{
    public function show(Project $project, Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccessProject($user, $project)) {
            return response()->json(['message' => 'Không có quyền xem luồng dự án.'], 403);
        }

        $contract = $project->contract()->select([
            'id',
            'title',
            'code',
            'status',
            'approval_status',
            'value',
            'start_date',
            'end_date',
            'signed_at',
            'payment_times',
            'notes',
        ])->first();

        $tasks = Task::query()
            ->where('project_id', $project->id)
            ->with([
                'assignee:id,name,email,role',
                'department:id,name',
                'reviewer:id,name,email,role',
            ])
            ->select([
                'id',
                'project_id',
                'title',
                'description',
                'priority',
                'status',
                'start_at',
                'deadline',
                'completed_at',
                'assignee_id',
                'department_id',
                'reviewer_id',
                'progress_percent',
                'require_acknowledgement',
                'acknowledged_at',
            ])
            ->orderBy('id')
            ->get();

        $taskIds = $tasks->pluck('id')->all();
        $items = $taskIds
            ? TaskItem::query()
                ->whereIn('task_id', $taskIds)
                ->with([
                    'assignee:id,name,email,role',
                    'reviewer:id,name,email,role',
                ])
                ->select([
                    'id',
                    'task_id',
                    'title',
                    'description',
                    'priority',
                    'status',
                    'deadline',
                    'assignee_id',
                    'reviewer_id',
                    'progress_percent',
                    'start_date',
                    'created_at',
                ])
                ->orderBy('id')
                ->get()
            : collect();

        return response()->json([
            'project' => $project->load([
                'owner:id,name,email,role',
                'client:id,name,company',
            ]),
            'contract' => $contract,
            'tasks' => $tasks,
            'items' => $items,
        ]);
    }

    private function canAccessProject(?User $user, Project $project): bool
    {
        if (! $user) {
            return false;
        }
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return true;
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return Task::query()
                ->where('project_id', $project->id)
                ->whereIn('department_id', $deptIds)
                ->exists();
        }
        return TaskItem::query()
            ->whereHas('task', function ($builder) use ($project) {
                $builder->where('project_id', $project->id);
            })
            ->where('assignee_id', $user->id)
            ->exists();
    }
}
