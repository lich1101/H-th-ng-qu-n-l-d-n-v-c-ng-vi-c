<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\JsonResponse;

class ReportController extends Controller
{
    public function dashboardSummary(): JsonResponse
    {
        $totalProjects = Project::count();
        $inProgressProjects = Project::where('status', 'dang_trien_khai')->count();
        $pendingReviewProjects = Project::where('status', 'cho_duyet')->count();

        $totalTasks = Task::count();
        $completedTasks = Task::whereIn('status', ['done', 'hoan_tat_ban_giao'])->count();
        $overdueTasks = Task::whereNotNull('deadline')
            ->where('deadline', '<', now())
            ->whereNotIn('status', ['done', 'hoan_tat_ban_giao'])
            ->count();

        $serviceBreakdown = Project::selectRaw('service_type, COUNT(*) as total')
            ->groupBy('service_type')
            ->orderByDesc('total')
            ->get()
            ->map(function ($item) {
                return [
                    'label' => $item->service_type,
                    'value' => (int) $item->total,
                ];
            })
            ->values();

        $onTimeRate = $totalTasks > 0
            ? round((($totalTasks - $overdueTasks) / $totalTasks) * 100, 1)
            : 0;

        return response()->json([
            'projects' => [
                'total' => $totalProjects,
                'in_progress' => $inProgressProjects,
                'pending_review' => $pendingReviewProjects,
            ],
            'tasks' => [
                'total' => $totalTasks,
                'completed' => $completedTasks,
                'overdue' => $overdueTasks,
                'on_time_rate' => $onTimeRate,
            ],
            'service_breakdown' => $serviceBreakdown,
        ]);
    }
}
