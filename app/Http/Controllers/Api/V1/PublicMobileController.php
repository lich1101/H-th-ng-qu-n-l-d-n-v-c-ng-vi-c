<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Http\Helpers\ProjectScope;
use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PublicMobileController extends Controller
{
    public function summary(Request $request): JsonResponse
    {
        $viewer = $request->user('sanctum');
        $projectQuery = Project::query();
        $taskQuery = Task::query();

        if ($viewer) {
            ProjectScope::applyProjectScope($projectQuery, $viewer);
            ProjectScope::applyTaskScope($taskQuery, $viewer);
        }

        $progressItems = (clone $projectQuery)->withCount([
            'tasks as total_tasks',
            'tasks as completed_tasks' => function ($query) {
                $query->whereIn('status', ['done']);
            },
        ])
            ->orderByDesc('updated_at')
            ->limit(5)
            ->get()
            ->map(function ($project) {
                $total = (int) $project->total_tasks;
                $completed = (int) $project->completed_tasks;
                $progress = $total > 0 ? round(($completed / $total) * 100) : 0;
                $teamLabel = $project->service_type === 'khac'
                    ? ($project->service_type_other ?: 'Khác')
                    : ($project->service_type ?: 'Team nội bộ');

                return [
                    'name' => $project->name,
                    'team' => $teamLabel,
                    'progress' => $progress,
                ];
            })
            ->values();

        $activitiesQuery = ActivityLog::with('user');
        if ($viewer) {
            if ($viewer->role === 'quan_ly') {
                $visibleUserIds = CrmScope::managerVisibleUserIds($viewer);
                $activitiesQuery->whereIn('user_id', $visibleUserIds->all());
            } elseif (! CrmScope::hasGlobalScope($viewer)) {
                $activitiesQuery->where('user_id', $viewer->id);
            }
        }
        $activities = $activitiesQuery
            ->orderByDesc('created_at')
            ->limit(6)
            ->get()
            ->map(function ($log) {
                return [
                    'user' => optional($log->user)->name ?? 'Hệ thống',
                    'content' => $log->action ?: 'cập nhật',
                    'time' => optional($log->created_at)->diffForHumans() ?? 'vừa xong',
                ];
            })
            ->values();

        $workloadThreshold = (int) env('WORKLOAD_THRESHOLD', 8);
        $activeTasks = (clone $taskQuery)
            ->whereNotIn('status', ['done'])
            ->whereNotNull('assignee_id');
        $activeByUser = (clone $activeTasks)
            ->select('assignee_id', DB::raw('COUNT(*) as total'))
            ->groupBy('assignee_id')
            ->pluck('total', 'assignee_id');
        $overdueByUser = (clone $taskQuery)
            ->whereNotIn('status', ['done'])
            ->whereNotNull('assignee_id')
            ->whereNotNull('deadline')
            ->where('deadline', '<', now())
            ->select('assignee_id', DB::raw('COUNT(*) as total'))
            ->groupBy('assignee_id')
            ->pluck('total', 'assignee_id');

        $workloadUserQuery = User::query()
            ->whereNotIn('role', ['admin', 'administrator']);
        if ($viewer) {
            if ($viewer->role === 'quan_ly') {
                $workloadUserQuery->whereIn('id', CrmScope::managerVisibleUserIds($viewer)->all());
            } elseif (! CrmScope::hasGlobalScope($viewer)) {
                $workloadUserQuery->where('id', $viewer->id);
            }
        }

        $workload = $workloadUserQuery
            ->get()
            ->map(function ($user) use ($activeByUser, $overdueByUser, $workloadThreshold) {
                $active = (int) ($activeByUser[$user->id] ?? 0);
                $overdue = (int) ($overdueByUser[$user->id] ?? 0);
                return [
                    'user_id' => $user->id,
                    'name' => $user->name ?? $user->email,
                    'role' => $user->role,
                    'active_tasks' => $active,
                    'overdue_tasks' => $overdue,
                    'is_overload' => $active >= $workloadThreshold || $overdue >= 2,
                ];
            })
            ->sortByDesc('active_tasks')
            ->values();

        $overloadList = $workload
            ->filter(function ($item) {
                return $item['is_overload'];
            })
            ->values()
            ->take(6);

        return response()->json([
            'projects_in_progress' => (clone $projectQuery)
                ->where('status', 'dang_trien_khai')
                ->count(),
            'tasks_due_soon' => (clone $taskQuery)
                ->whereNotNull('deadline')
                ->whereBetween('deadline', [now(), now()->addDays(3)])
                ->whereNotIn('status', ['done'])
                ->count(),
            'tasks_overdue' => (clone $taskQuery)
                ->whereNotNull('deadline')
                ->where('deadline', '<', now())
                ->whereNotIn('status', ['done'])
                ->count(),
            'on_time_rate' => $this->onTimeRate($taskQuery),
            'project_progress' => $progressItems,
            'recent_activities' => $activities,
            'workload_overload' => $overloadList,
            'workload_threshold' => $workloadThreshold,
        ]);
    }

    public function accountsSummary(Request $request): JsonResponse
    {
        $viewer = $request->user('sanctum');
        $query = User::query();

        if ($viewer) {
            if ($viewer->role === 'quan_ly') {
                $query->whereIn('id', CrmScope::managerVisibleUserIds($viewer)->all());
            } elseif (! CrmScope::hasGlobalScope($viewer)) {
                $query->where('id', $viewer->id);
            }
        }

        $total = (clone $query)->count();
        $active = (clone $query)->where('is_active', true)->count();

        return response()->json([
            'total_users' => $total,
            'active_users' => $active,
            'inactive_users' => max(0, $total - $active),
            'roles' => $query->selectRaw('role, COUNT(*) as total')
                ->groupBy('role')
                ->orderByDesc('total')
                ->get()
                ->map(function ($item) {
                    return [
                        'label' => $item->role,
                        'value' => (int) $item->total,
                    ];
                }),
        ]);
    }

    private function onTimeRate($taskQuery): float
    {
        $total = (clone $taskQuery)->count();
        if ($total === 0) {
            return 0;
        }
        $overdue = (clone $taskQuery)->whereNotNull('deadline')
            ->where('deadline', '<', now())
            ->whereNotIn('status', ['done'])
            ->count();

        return round((($total - $overdue) / $total) * 100, 1);
    }
}
