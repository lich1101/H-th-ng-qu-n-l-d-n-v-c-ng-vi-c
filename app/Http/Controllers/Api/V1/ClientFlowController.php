<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ClientCareNote;
use App\Models\Client;
use App\Models\Opportunity;
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

        $client->load([
            'assignedStaff:id,name,email',
            'salesOwner:id,name,email',
            'careStaffUsers:id,name,email',
            'careNotes.user:id,name,email',
        ]);

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

        $opportunities = Opportunity::query()
            ->where('client_id', $client->id)
            ->with([
                'assignee:id,name,email',
                'creator:id,name,email',
            ])
            ->select([
                'id',
                'client_id',
                'title',
                'amount',
                'status',
                'assigned_to',
                'created_by',
                'expected_close_date',
                'notes',
            ])
            ->orderByDesc('id')
            ->get();

        $projects = Project::query()
            ->where('client_id', $client->id)
            ->select([
                'id',
                'name',
                'status',
                'progress_percent',
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
                    'progress_percent',
                    'weight_percent',
                    'start_at',
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
                    'progress_percent',
                    'weight_percent',
                    'start_date',
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
                'email' => $client->email,
                'phone' => $client->phone,
                'notes' => $client->notes,
                'lead_source' => $client->lead_source,
                'lead_channel' => $client->lead_channel,
                'total_revenue' => $client->total_revenue,
                'has_purchased' => $client->has_purchased,
                'assigned_staff' => $client->assignedStaff
                    ? [
                        'id' => $client->assignedStaff->id,
                        'name' => $client->assignedStaff->name,
                        'email' => $client->assignedStaff->email,
                    ]
                    : null,
                'sales_owner' => $client->salesOwner
                    ? [
                        'id' => $client->salesOwner->id,
                        'name' => $client->salesOwner->name,
                        'email' => $client->salesOwner->email,
                    ]
                    : null,
                'care_staff_users' => $client->careStaffUsers
                    ->map(function ($staff) {
                        return [
                            'id' => $staff->id,
                            'name' => $staff->name,
                            'email' => $staff->email,
                        ];
                    })
                    ->values(),
            ],
            'opportunities' => $opportunities,
            'contracts' => $contracts,
            'projects' => $projects,
            'tasks' => $tasks,
            'items' => $items,
            'care_notes' => $client->careNotes
                ->map(function (ClientCareNote $note) {
                    return [
                        'id' => $note->id,
                        'title' => $note->title,
                        'detail' => $note->detail,
                        'created_at' => optional($note->created_at)->toIso8601String(),
                        'user' => $note->user
                            ? [
                                'id' => $note->user->id,
                                'name' => $note->user->name,
                                'email' => $note->user->email,
                            ]
                            : null,
                    ];
                })
                ->values(),
            'permissions' => [
                'can_add_care_note' => $this->canAddCareNote($user, $client),
            ],
        ]);
    }

    public function storeCareNote(Client $client, Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccessClient($user, $client)) {
            return response()->json(['message' => 'Không có quyền xem luồng khách hàng.'], 403);
        }
        if (! $this->canAddCareNote($user, $client)) {
            return response()->json(['message' => 'Không có quyền ghi chú chăm sóc khách hàng này.'], 403);
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'detail' => ['required', 'string', 'max:12000'],
        ]);

        $note = ClientCareNote::query()->create([
            'client_id' => $client->id,
            'user_id' => $user->id,
            'title' => trim((string) $validated['title']),
            'detail' => trim((string) $validated['detail']),
        ]);

        return response()->json([
            'message' => 'Đã thêm ghi chú chăm sóc.',
            'note' => [
                'id' => $note->id,
                'title' => $note->title,
                'detail' => $note->detail,
                'created_at' => optional($note->created_at)->toIso8601String(),
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                ],
            ],
        ], 201);
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
            if ($client->assigned_department_id && $deptIds->contains($client->assigned_department_id)) {
                return true;
            }
        }

        if ((int) $client->assigned_staff_id === (int) $user->id) {
            return true;
        }

        if ((int) $client->sales_owner_id === (int) $user->id) {
            return true;
        }

        return $client->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function canAddCareNote(?User $user, Client $client): bool
    {
        if (! $user) {
            return false;
        }

        if (in_array($user->role, ['admin'], true)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return $client->assigned_department_id && $deptIds->contains($client->assigned_department_id);
        }

        if ((int) $client->assigned_staff_id === (int) $user->id) {
            return true;
        }

        if ((int) $client->sales_owner_id === (int) $user->id) {
            return true;
        }

        return $client->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }
}
