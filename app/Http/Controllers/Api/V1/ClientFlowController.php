<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\ClientCareNote;
use App\Models\Client;
use App\Models\Opportunity;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use App\Services\ClientStaffTransferService;
use App\Services\ContractLifecycleStatusService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ClientFlowController extends Controller
{
    public function show(Client $client, Request $request): JsonResponse
    {
        $user = $request->user();
        $transferService = app(ClientStaffTransferService::class);

        if ($transferService->viewerMustOnlyRespondTransfer($user, $client)) {
            $pending = $transferService->pendingForClient((int) $client->id);

            return response()->json([
                'client' => [
                    'id' => $client->id,
                    'name' => $client->name,
                    'company' => $client->company,
                    'email' => $client->email,
                    'phone' => $client->phone,
                    'notes' => null,
                    'lead_type_id' => $client->lead_type_id,
                    'assigned_department_id' => $client->assigned_department_id,
                    'assigned_staff_id' => $client->assigned_staff_id,
                    'sales_owner_id' => $client->sales_owner_id,
                    'lead_source' => $client->lead_source,
                    'lead_channel' => $client->lead_channel,
                    'total_revenue' => $client->total_revenue,
                    'has_purchased' => $client->has_purchased,
                    'assigned_staff' => null,
                    'sales_owner' => null,
                    'care_staff_users' => [],
                ],
                'opportunities' => [],
                'contracts' => [],
                'projects' => [],
                'tasks' => [],
                'items' => [],
                'care_notes' => [],
                'comments_history' => [],
                'crm_access_mode' => 'transfer_receiver_pending',
                'pending_staff_transfer' => $pending ? $transferService->transferToArray($pending) : null,
                'permissions' => [
                    'can_add_care_note' => false,
                    'can_add_comment' => false,
                    'can_manage_client' => false,
                    'can_delete_any_comment' => false,
                ],
            ]);
        }

        if (! $this->canAccessClient($user, $client)) {
            return response()->json(['message' => 'Không có quyền xem luồng khách hàng.'], 403);
        }

        $client->load([
            'assignedStaff:id,name,email',
            'salesOwner:id,name,email',
            'careStaffUsers:id,name,email',
            'careNotes.user:id,name,email',
        ]);

        $contractStatusSql = app(ContractLifecycleStatusService::class)->sqlExpression('contracts');
        $contracts = $client->contracts()
            ->select([
                'id',
                'title',
                'code',
                'approval_status',
                'value',
                'start_date',
                'end_date',
                'signed_at',
                'project_id',
            ])
            ->selectRaw("({$contractStatusSql}) as status")
            ->orderBy('id')
            ->get();

        $opportunities = Opportunity::query()
            ->where('client_id', $client->id)
            ->with([
                'assignee:id,name,email',
                'creator:id,name,email',
                'statusConfig:id,code,name,color_hex,sort_order',
            ])
            ->select([
                'id',
                'client_id',
                'title',
                'opportunity_type',
                'amount',
                'status',
                'source',
                'success_probability',
                'product_id',
                'assigned_to',
                'watcher_ids',
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

        $transferService = app(ClientStaffTransferService::class);
        $pendingTransfer = $transferService->pendingForClient((int) $client->id);

        return response()->json([
            'client' => [
                'id' => $client->id,
                'name' => $client->name,
                'company' => $client->company,
                'email' => $client->email,
                'phone' => $client->phone,
                'notes' => $client->notes,
                'lead_type_id' => $client->lead_type_id,
                'assigned_department_id' => $client->assigned_department_id,
                'assigned_staff_id' => $client->assigned_staff_id,
                'sales_owner_id' => $client->sales_owner_id,
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
            'comments_history' => $this->normalizedCommentsHistory($client, $user),
            'permissions' => [
                'can_add_care_note' => $this->canAddCareNote($user, $client),
                'can_add_comment' => $this->canAddCareNote($user, $client),
                'can_manage_client' => $this->canManageClient($user, $client),
                'can_delete_any_comment' => in_array($user?->role, ['admin', 'administrator'], true),
            ],
            'crm_access_mode' => 'full',
            'pending_staff_transfer' => $pendingTransfer ? $transferService->transferToArray($pendingTransfer) : null,
        ]);
    }

    public function comments(Client $client, Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccessClient($user, $client)) {
            return response()->json(['message' => 'Không có quyền xem bình luận khách hàng.'], 403);
        }

        return response()->json([
            'comments_history' => $this->normalizedCommentsHistory($client, $user),
            'permissions' => [
                'can_add_comment' => $this->canAddCareNote($user, $client),
                'can_delete_any_comment' => in_array($user?->role, ['admin', 'administrator'], true),
            ],
            'fetched_at' => now()->toIso8601String(),
        ]);
    }

    public function storeComment(Client $client, Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccessClient($user, $client)) {
            return response()->json(['message' => 'Không có quyền xem luồng khách hàng.'], 403);
        }
        if (! $this->canAddCareNote($user, $client)) {
            return response()->json(['message' => 'Không có quyền thêm bình luận khách hàng này.'], 403);
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'detail' => ['required', 'string', 'max:12000'],
        ]);

        $comment = [
            'id' => (string) Str::uuid(),
            'title' => trim((string) $validated['title']),
            'detail' => trim((string) $validated['detail']),
            'created_at' => now()->toIso8601String(),
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
            'can_delete' => true,
        ];

        DB::transaction(function () use ($client, $comment) {
            /** @var Client|null $locked */
            $locked = Client::query()->lockForUpdate()->find($client->id);
            if (! $locked) {
                return;
            }

            $history = $locked->comments_history_json;
            if (! is_array($history)) {
                $history = [];
            }

            $history[] = $comment;
            $locked->comments_history_json = $history;
            $locked->save();
        });

        $this->notifyClientCommentCreated($client, $user, $comment);

        return response()->json([
            'message' => 'Đã thêm bình luận.',
            'comment' => $comment,
        ], 201);
    }

    public function destroyComment(Client $client, string $commentId, Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccessClient($user, $client)) {
            return response()->json(['message' => 'Không có quyền xem luồng khách hàng.'], 403);
        }

        $targetId = trim((string) $commentId);
        if ($targetId === '') {
            return response()->json(['message' => 'Mã bình luận không hợp lệ.'], 422);
        }

        $result = DB::transaction(function () use ($client, $user, $targetId) {
            /** @var Client|null $locked */
            $locked = Client::query()->lockForUpdate()->find($client->id);
            if (! $locked) {
                return ['status' => 404, 'message' => 'Không tìm thấy khách hàng.'];
            }

            $history = $locked->comments_history_json;
            if (! is_array($history)) {
                $history = [];
            }

            $removeIndex = null;
            $comment = null;
            foreach ($history as $index => $row) {
                if (! is_array($row)) {
                    continue;
                }
                if (trim((string) ($row['id'] ?? '')) === $targetId) {
                    $removeIndex = $index;
                    $comment = $row;
                    break;
                }
            }

            if ($removeIndex === null || ! is_array($comment)) {
                return ['status' => 404, 'message' => 'Không tìm thấy bình luận.'];
            }

            if (! $this->canDeleteComment($user, $comment)) {
                return ['status' => 403, 'message' => 'Bạn chỉ có thể xóa bình luận của chính mình.'];
            }

            unset($history[$removeIndex]);
            $locked->comments_history_json = array_values($history);
            $locked->save();

            return ['status' => 200];
        });

        if (($result['status'] ?? 500) !== 200) {
            return response()->json(['message' => $result['message'] ?? 'Không thể xóa bình luận.'], $result['status'] ?? 500);
        }

        return response()->json([
            'message' => 'Đã xóa bình luận.',
            'comment_id' => $targetId,
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

        return CrmScope::canAccessClient($user, $client);
    }

    private function canAddCareNote(?User $user, Client $client): bool
    {
        if (! $user) {
            return false;
        }

        return CrmScope::canAccessClient($user, $client);
    }

    private function canManageClient(?User $user, Client $client): bool
    {
        if (! $user) {
            return false;
        }

        return CrmScope::canManageClient($user, $client);
    }

    private function canDeleteComment(?User $user, array $comment): bool
    {
        if (! $user) {
            return false;
        }

        if (in_array($user->role, ['admin', 'administrator'], true)) {
            return true;
        }

        $commentUserId = (int) data_get($comment, 'user.id', 0);
        return $commentUserId > 0 && $commentUserId === (int) $user->id;
    }

    private function normalizedCommentsHistory(Client $client, ?User $user)
    {
        return collect($client->comments_history_json ?: [])
            ->filter(function ($item) {
                return is_array($item)
                    && ! empty(trim((string) ($item['detail'] ?? '')));
            })
            ->map(function ($item) use ($user) {
                $comment = is_array($item) ? $item : [];
                return [
                    'id' => (string) ($comment['id'] ?? Str::uuid()),
                    'title' => trim((string) ($comment['title'] ?? 'Bình luận')),
                    'detail' => trim((string) ($comment['detail'] ?? '')),
                    'created_at' => $comment['created_at'] ?? null,
                    'user' => is_array($comment['user'] ?? null)
                        ? [
                            'id' => (int) (($comment['user']['id'] ?? 0)),
                            'name' => (string) ($comment['user']['name'] ?? 'Nhân sự'),
                            'email' => (string) ($comment['user']['email'] ?? ''),
                        ]
                        : null,
                    'can_delete' => $this->canDeleteComment($user, $comment),
                ];
            })
            ->values();
    }

    /**
     * @param  array<string, mixed>  $comment
     */
    private function notifyClientCommentCreated(Client $client, User $actor, array $comment): void
    {
        try {
            $client->loadMissing([
                'assignedStaff.departmentRelation',
                'salesOwner.departmentRelation',
                'careStaffUsers:id',
            ]);

            $assignedStaffId = (int) ($client->assigned_staff_id ?: $client->sales_owner_id);
            $ownerUser = $client->assignedStaff ?: $client->salesOwner;
            $managerId = (int) optional(optional($ownerUser)->departmentRelation)->manager_id;
            $adminIds = User::query()
                ->whereIn('role', ['admin', 'administrator'])
                ->pluck('id')
                ->all();
            $careStaffIds = $client->careStaffUsers
                ->pluck('id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function ($id) {
                    return $id > 0;
                })
                ->values()
                ->all();

            $recipientIds = collect(array_merge(
                $adminIds,
                [$assignedStaffId > 0 ? $assignedStaffId : null],
                [$managerId > 0 ? $managerId : null],
                $careStaffIds
            ))
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function ($id) use ($actor) {
                    return $id > 0 && $id !== (int) $actor->id;
                })
                ->unique()
                ->values()
                ->all();

            if (empty($recipientIds)) {
                return;
            }

            $clientName = trim((string) ($client->name ?: 'Khách hàng'));
            $commentTitle = trim((string) ($comment['title'] ?? 'Bình luận'));
            $actorName = trim((string) ($actor->name ?: 'Nhân sự'));

            app(NotificationService::class)->notifyUsersAfterResponse(
                $recipientIds,
                sprintf('Có bình luận mới cho khách hàng "%s"', $clientName),
                sprintf('%s vừa bình luận "%s" trên khách hàng %s.', $actorName, $commentTitle, $clientName),
                [
                    'type' => 'crm_client_comment_added',
                    'category' => 'crm_realtime',
                    'client_id' => (int) $client->id,
                    'comment_id' => (string) ($comment['id'] ?? ''),
                    'commented_by_user_id' => (int) $actor->id,
                ]
            );
        } catch (\Throwable $e) {
            Log::warning('Notify client comment created failed', [
                'client_id' => (int) $client->id,
                'actor_id' => (int) $actor->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
