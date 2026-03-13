<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class PublicMobileController extends Controller
{
    public function summary(): JsonResponse
    {
        $progressItems = Project::withCount([
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

        $activities = ActivityLog::with('user')
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
        $activeTasks = Task::query()
            ->whereNotIn('status', ['done'])
            ->whereNotNull('assignee_id');
        $activeByUser = $activeTasks
            ->clone()
            ->select('assignee_id', DB::raw('COUNT(*) as total'))
            ->groupBy('assignee_id')
            ->pluck('total', 'assignee_id');
        $overdueByUser = Task::query()
            ->whereNotIn('status', ['done'])
            ->whereNotNull('deadline')
            ->where('deadline', '<', now())
            ->select('assignee_id', DB::raw('COUNT(*) as total'))
            ->groupBy('assignee_id')
            ->pluck('total', 'assignee_id');

        $workload = User::query()
            ->whereNotIn('role', ['admin'])
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
            ->filter(fn ($item) => $item['is_overload'])
            ->values()
            ->take(6);

        return response()->json([
            'projects_in_progress' => Project::where('status', 'dang_trien_khai')->count(),
            'tasks_due_soon' => Task::whereNotNull('deadline')
                ->whereBetween('deadline', [now(), now()->addDays(3)])
                ->whereNotIn('status', ['done'])
                ->count(),
            'tasks_overdue' => Task::whereNotNull('deadline')
                ->where('deadline', '<', now())
                ->whereNotIn('status', ['done'])
                ->count(),
            'on_time_rate' => $this->onTimeRate(),
            'project_progress' => $progressItems,
            'recent_activities' => $activities,
            'workload_overload' => $overloadList,
            'workload_threshold' => $workloadThreshold,
        ]);
    }

    public function accountsSummary(): JsonResponse
    {
        $total = User::count();
        $active = User::where('is_active', true)->count();

        return response()->json([
            'total_users' => $total,
            'active_users' => $active,
            'inactive_users' => max(0, $total - $active),
            'roles' => User::selectRaw('role, COUNT(*) as total')
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

    private function onTimeRate(): float
    {
        $total = Task::count();
        if ($total === 0) {
            return 0;
        }
        $overdue = Task::whereNotNull('deadline')
            ->where('deadline', '<', now())
            ->whereNotIn('status', ['done'])
            ->count();

        return round((($total - $overdue) / $total) * 100, 1);
    }
}
