<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class PublicMobileController extends Controller
{
    public function summary(): JsonResponse
    {
        return response()->json([
            'projects_in_progress' => Project::where('status', 'dang_trien_khai')->count(),
            'tasks_due_soon' => Task::whereNotNull('deadline')
                ->whereBetween('deadline', [now(), now()->addDays(3)])
                ->count(),
            'tasks_overdue' => Task::whereNotNull('deadline')
                ->where('deadline', '<', now())
                ->whereNotIn('status', ['done', 'hoan_tat_ban_giao'])
                ->count(),
            'on_time_rate' => $this->onTimeRate(),
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
            ->whereNotIn('status', ['done', 'hoan_tat_ban_giao'])
            ->count();

        return round((($total - $overdue) / $total) * 100, 1);
    }
}
