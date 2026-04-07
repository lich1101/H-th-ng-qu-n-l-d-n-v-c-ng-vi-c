<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Opportunity;
use App\Models\OpportunityStatus;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OpportunityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $viewer = $request->user();
        $query = Opportunity::query()->with([
            'client:id,name,company,email,phone',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusConfig:id,code,name,color_hex,sort_order',
        ]);
        CrmScope::applyOpportunityScope($query, $viewer);

        if ($request->filled('client_id')) {
            $query->where('client_id', (int) $request->input('client_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }
        $staffFilterIds = $this->resolveStaffFilterIds($request);
        if (! empty($staffFilterIds)) {
            $canUseStaffFilter = collect($staffFilterIds)->every(function (int $staffId) use ($viewer) {
                return $this->canViewerFilterByStaff($viewer, $staffId);
            });
            if (! $canUseStaffFilter) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where(function ($builder) use ($staffFilterIds) {
                    $builder->whereIn('assigned_to', $staffFilterIds)
                        ->orWhereIn('created_by', $staffFilterIds)
                        ->orWhereHas('client', function ($clientQuery) use ($staffFilterIds) {
                            $clientQuery->whereIn('assigned_staff_id', $staffFilterIds)
                                ->orWhereIn('sales_owner_id', $staffFilterIds)
                                ->orWhereHas('careStaffUsers', function ($careQuery) use ($staffFilterIds) {
                                    $careQuery->whereIn('users.id', $staffFilterIds);
                                });
                        });
                });
            }
        }
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%")
                    ->orWhere('opportunity_type', 'like', "%{$search}%")
                    ->orWhere('source', 'like', "%{$search}%")
                    ->orWhereHas('client', function ($c) use ($search) {
                        $c->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    });
            });
        }

        $result = $query
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 20));

        return response()->json($result);
    }

    public function store(Request $request): JsonResponse
    {
        $statusCodes = OpportunityStatus::query()->pluck('code')->all();
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'opportunity_type' => ['nullable', 'string', 'max:120'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', Rule::in($statusCodes)],
            'source' => ['nullable', 'string', 'max:120'],
            'success_probability' => ['required', 'integer', 'min:0', 'max:100'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'watcher_ids' => ['nullable', 'array'],
            'watcher_ids.*' => ['integer', 'exists:users,id'],
            'expected_close_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        $validated['status'] = $validated['status'] ?? $this->defaultStatusCode();
        $validated['created_by'] = $request->user()->id;
        if (empty($validated['assigned_to'])) {
            $validated['assigned_to'] = (int) $request->user()->id;
        }
        $validated['watcher_ids'] = $this->normalizeWatcherIds($validated['watcher_ids'] ?? []);

        $opportunity = Opportunity::create($validated);
        $opportunity->load([
            'client:id,name,company,email,phone',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusConfig:id,code,name,color_hex,sort_order',
        ]);

        $this->notifyOpportunityCreated($opportunity, $request->user());

        return response()->json($opportunity, 201);
    }

    private function notifyOpportunityCreated(Opportunity $opportunity, User $creator): void
    {
        try {
            $opportunity->loadMissing([
                'client.assignedStaff.departmentRelation',
                'client.salesOwner.departmentRelation',
                'client.careStaffUsers:id',
            ]);

            $client = $opportunity->client;
            if (! $client) {
                return;
            }

            $adminIds = User::query()
                ->whereIn('role', ['admin', 'administrator'])
                ->pluck('id')
                ->all();

            $clientAssignee = $client->assignedStaff ?: $client->salesOwner;
            $assigneeId = (int) optional($clientAssignee)->id;
            $managerId = (int) optional(optional($clientAssignee)->departmentRelation)->manager_id;

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

            $targetIds = collect(array_merge(
                $adminIds,
                [$assigneeId > 0 ? $assigneeId : null],
                [$managerId > 0 ? $managerId : null],
                $careStaffIds
            ))
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function ($id) use ($creator) {
                    return $id > 0 && $id !== (int) $creator->id;
                })
                ->unique()
                ->values()
                ->all();

            if (empty($targetIds)) {
                return;
            }

            $clientName = trim((string) ($client->name ?: 'Khách hàng'));
            $opportunityTitle = trim((string) ($opportunity->title ?: 'Cơ hội mới'));
            $creatorName = trim((string) ($creator->name ?: 'Nhân sự'));
            $title = 'Khách hàng có cơ hội mới';
            $body = sprintf(
                '%s vừa thêm cơ hội "%s" cho khách hàng %s.',
                $creatorName,
                $opportunityTitle,
                $clientName
            );

            app(NotificationService::class)->notifyUsersAfterResponse(
                $targetIds,
                $title,
                $body,
                [
                    'type' => 'crm_client_opportunity_created',
                    'category' => 'crm_realtime',
                    'client_id' => (int) $client->id,
                    'opportunity_id' => $opportunity->id,
                    'creator_id' => $creator->id,
                ]
            );
        } catch (\Throwable $e) {
            Log::warning('Notify opportunity created failed', [
                'opportunity_id' => (int) $opportunity->id,
                'creator_id' => (int) $creator->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function show(Opportunity $opportunity): JsonResponse
    {
        if (! $this->canAccessOpportunity(request()->user(), $opportunity)) {
            return response()->json(['message' => 'Không có quyền xem cơ hội.'], 403);
        }
        return response()->json($opportunity->load([
            'client:id,name,company,email,phone',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusConfig:id,code,name,color_hex,sort_order',
            'contracts',
        ]));
    }

    public function update(Request $request, Opportunity $opportunity): JsonResponse
    {
        if (! $this->canAccessOpportunity($request->user(), $opportunity)) {
            return response()->json(['message' => 'Không có quyền cập nhật cơ hội.'], 403);
        }
        $statusCodes = OpportunityStatus::query()->pluck('code')->all();
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'opportunity_type' => ['nullable', 'string', 'max:120'],
            'client_id' => ['sometimes', 'required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', Rule::in($statusCodes)],
            'source' => ['nullable', 'string', 'max:120'],
            'success_probability' => ['required', 'integer', 'min:0', 'max:100'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'watcher_ids' => ['nullable', 'array'],
            'watcher_ids.*' => ['integer', 'exists:users,id'],
            'expected_close_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        if (array_key_exists('watcher_ids', $validated)) {
            $validated['watcher_ids'] = $this->normalizeWatcherIds($validated['watcher_ids'] ?? []);
        }
        $opportunity->update($validated);
        return response()->json($opportunity->load([
            'client:id,name,company,email,phone',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusConfig:id,code,name,color_hex,sort_order',
        ]));
    }

    public function destroy(Opportunity $opportunity): JsonResponse
    {
        if (! $this->canAccessOpportunity(request()->user(), $opportunity)) {
            return response()->json(['message' => 'Không có quyền xóa cơ hội.'], 403);
        }
        $opportunity->delete();
        return response()->json(['message' => 'Đã xóa cơ hội.']);
    }

    private function canAccessOpportunity(User $user, Opportunity $opportunity): bool
    {
        if (CrmScope::hasGlobalScope($user)) {
            return true;
        }
        if (! $opportunity->client) {
            $opportunity->load('client');
        }
        if ($user->role === 'quan_ly') {
            return CrmScope::canManagerAccessOpportunity($user, $opportunity);
        }

        $watchers = collect((array) ($opportunity->watcher_ids ?? []))
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            });

        return ($opportunity->client && (
            (int) $opportunity->client->assigned_staff_id === (int) $user->id
            || (int) $opportunity->client->sales_owner_id === (int) $user->id
            || (int) $opportunity->created_by === (int) $user->id
            || (int) $opportunity->assigned_to === (int) $user->id
            || $opportunity->client->careStaffUsers()
                ->where('users.id', (int) $user->id)
                ->exists()
        )) || $watchers->contains((int) $user->id);
    }

    private function defaultStatusCode(): string
    {
        $default = OpportunityStatus::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->value('code');

        return $default ?: 'open';
    }

    private function canViewerFilterByStaff(User $viewer, int $staffId): bool
    {
        if ($staffId <= 0) {
            return false;
        }

        if (CrmScope::hasGlobalScope($viewer)) {
            return User::query()->where('id', $staffId)->exists();
        }

        if ($viewer->role === 'quan_ly') {
            return CrmScope::managerVisibleUserIds($viewer)->contains($staffId);
        }

        if ($viewer->role === 'nhan_vien') {
            return (int) $viewer->id === $staffId;
        }

        return false;
    }

    private function resolveStaffFilterIds(Request $request): array
    {
        $raw = $request->input('staff_ids', []);
        if (is_string($raw)) {
            $raw = preg_split('/[\s,;|]+/', $raw) ?: [];
        }
        if (! is_array($raw)) {
            $raw = [];
        }

        $legacyFilters = [
            $request->input('assigned_to_ids', []),
            $request->input('assigned_staff_ids', []),
        ];

        foreach ($legacyFilters as $legacy) {
            if (is_string($legacy)) {
                $legacy = preg_split('/[\s,;|]+/', $legacy) ?: [];
            }
            if (is_array($legacy)) {
                $raw = array_merge($raw, $legacy);
            }
        }

        if ($request->filled('assigned_to')) {
            $raw[] = $request->input('assigned_to');
        }

        return collect($raw)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, mixed>  $rawIds
     * @return array<int, int>
     */
    private function normalizeWatcherIds(array $rawIds): array
    {
        $normalized = collect($rawIds)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();

        return $normalized;
    }
}
