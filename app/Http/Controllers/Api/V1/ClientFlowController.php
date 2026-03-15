<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientFlowController extends Controller
{
    public function show(Client $client, Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccessClient($user, $client)) {
            return response()->json(['message' => 'Không có quyền xem luồng khách hàng.'], 403);
        }

        $contracts = $client->contracts()
            ->select([
                'id',
                'title',
                'code',
                'status',
                'approval_status',
                'value',
                'start_date',
                'end_date',
                'signed_at',
                'project_id',
            ])
            ->orderBy('id')
            ->get();

        $projects = Project::query()
            ->where('client_id', $client->id)
            ->select([
                'id',
                'name',
                'status',
                'deadline',
                'contract_id',
                'service_type',
                'service_type_other',
            ])
            ->orderBy('id')
            ->get();

        $projectIds = $projects->pluck('id')->all();
        $tasks = $projectIds
            ? Task::query()
                ->whereIn('project_id', $projectIds)
                ->with(['assignee', 'department'])
                ->select([
                    'id',
                    'project_id',
                    'title',
                    'status',
                    'deadline',
                    'assignee_id',
                    'department_id',
                ])
                ->orderBy('id')
                ->get()
            : collect();

        $taskIds = $tasks->pluck('id')->all();
        $items = $taskIds
            ? TaskItem::query()
                ->whereIn('task_id', $taskIds)
                ->with('assignee')
                ->select([
                    'id',
                    'task_id',
                    'title',
                    'status',
                    'deadline',
                    'assignee_id',
                ])
                ->orderBy('id')
                ->get()
            : collect();

        return response()->json([
            'client' => [
                'id' => $client->id,
                'name' => $client->name,
                'company' => $client->company,
                'lead_source' => $client->lead_source,
                'lead_channel' => $client->lead_channel,
                'total_revenue' => $client->total_revenue,
                'has_purchased' => $client->has_purchased,
            ],
            'contracts' => $contracts,
            'projects' => $projects,
            'tasks' => $tasks,
            'items' => $items,
        ]);
    }

    private function canAccessClient(?User $user, Client $client): bool
    {
        if (! $user) {
            return false;
        }
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return true;
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return $client->assigned_department_id && $deptIds->contains($client->assigned_department_id);
        }

        return (int) $client->assigned_staff_id === (int) $user->id;
    }
}
