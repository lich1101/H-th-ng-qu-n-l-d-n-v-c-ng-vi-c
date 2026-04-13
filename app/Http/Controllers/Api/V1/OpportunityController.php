<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Opportunity;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\StaffFilterOptionsService;
use App\Support\OpportunityComputedStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class OpportunityController extends Controller
{
    /** @var \Illuminate\Support\Collection<int, int>|null Khớp staff-filter-options?context=opportunities cho nhan_vien */
    private $opportunityNhanVienFilterStaffIds = null;

    public function index(Request $request): JsonResponse
    {
        $viewer = $request->user();
        $filtered = $this->opportunityIndexFilteredQuery($request, $viewer);

        $revenueTotal = (float) ($filtered->clone()->sum('amount') ?? 0);

        $query = $filtered->clone()->with([
            'client:id,name,company,email,phone,notes,assigned_staff_id',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'contract:id,code,title,client_id,opportunity_id',
        ]);

        $result = $query
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 20));

        $result->getCollection()->transform(function (Opportunity $o) {
            $s = $o->computedStatusPayload();
            $o->setAttribute('computed_status', $s['code']);
            $o->setAttribute('computed_status_label', $s['label']);

            return $o;
        });

        $payload = $result->toArray();
        $payload['aggregates'] = [
            'revenue_total' => $revenueTotal,
        ];

        return response()->json($payload);
    }

    private function opportunityIndexFilteredQuery(Request $request, User $viewer): Builder
    {
        $query = Opportunity::query();
        CrmScope::applyOpportunityScope($query, $viewer);

        if ($request->boolean('linkable_for_contract')) {
            $clientId = (int) $request->input('client_id', 0);
            if ($clientId <= 0) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('client_id', $clientId);
                $excludeContractId = (int) $request->input('exclude_contract_id', 0);
                $query->where(function ($q) use ($excludeContractId) {
                    $q->whereDoesntHave('contract');
                    if ($excludeContractId > 0) {
                        $q->orWhereHas('contract', function ($c) use ($excludeContractId) {
                            $c->where('contracts.id', $excludeContractId);
                        });
                    }
                });
            }
        } elseif ($request->filled('client_id')) {
            $query->where('client_id', (int) $request->input('client_id'));
        }
        if (! $request->boolean('linkable_for_contract') && $request->filled('computed_status')) {
            OpportunityComputedStatus::applyIndexFilter($query, (string) $request->input('computed_status'));
        }
        $staffFilterIds = $this->resolveStaffFilterIds($request);
        if (! empty($staffFilterIds)) {
            $canUseStaffFilter = collect($staffFilterIds)->every(function (int $staffId) use ($viewer) {
                return $this->canViewerFilterByStaff($viewer, $staffId);
            });
            if (! $canUseStaffFilter) {
                $query->whereRaw('1 = 0');
            } else {
                // Khớp cột "Phụ trách" trên UI: assignee.name, hoặc creator.name khi chưa gán phụ trách.
                // Không lọc theo nhân sự trên hồ sơ khách (sales_owner / care / assigned_staff) để tránh hiển thị sai người phụ trách cơ hội.
                $query->where(function ($builder) use ($staffFilterIds) {
                    $builder->where(function ($q) use ($staffFilterIds) {
                        $q->whereNotNull('assigned_to')->whereIn('assigned_to', $staffFilterIds);
                    })->orWhere(function ($q) use ($staffFilterIds) {
                        $q->whereNull('assigned_to')->whereIn('created_by', $staffFilterIds);
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
        if ($request->filled('expected_close_from')) {
            $query->whereDate('expected_close_date', '>=', (string) $request->input('expected_close_from'));
        }
        if ($request->filled('expected_close_to')) {
            $query->whereDate('expected_close_date', '<=', (string) $request->input('expected_close_to'));
        }

        return $query;
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'opportunity_type' => ['nullable', 'string', 'max:120'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'source' => ['nullable', 'string', 'max:120'],
            'success_probability' => ['required', 'integer', 'min:0', 'max:100'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'watcher_ids' => ['nullable', 'array'],
            'watcher_ids.*' => ['integer', 'exists:users,id'],
            'expected_close_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'contract_id' => ['nullable', 'integer', 'exists:contracts,id'],
        ]);
        $client = Client::query()->find((int) $validated['client_id']);
        if (! $client) {
            return response()->json(['message' => 'Khách hàng không tồn tại.'], 422);
        }
        if (! $this->canMutateOpportunityForClient($request->user(), $client)) {
            return response()->json([
                'message' => 'Chỉ nhân viên phụ trách khách hàng (hoặc quản lý/admin) mới được tạo cơ hội cho khách này.',
            ], 403);
        }
        $contractId = null;
        if (array_key_exists('contract_id', $validated)) {
            $v = $validated['contract_id'];
            unset($validated['contract_id']);
            $contractId = $v !== null ? (int) $v : null;
            if ($contractId !== null && $contractId <= 0) {
                $contractId = null;
            }
        }
        $validated['created_by'] = $request->user()->id;
        if (empty($validated['assigned_to'])) {
            $validated['assigned_to'] = (int) $request->user()->id;
        }
        $validated['watcher_ids'] = $this->normalizeWatcherIds($validated['watcher_ids'] ?? []);

        $opportunity = Opportunity::create($validated);
        $this->syncOpportunityContractLink($request, $opportunity, $contractId);
        $opportunity->load([
            'client:id,name,company,email,phone,notes,assigned_staff_id',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'contract:id,code,title,client_id,opportunity_id',
        ]);
        $s = $opportunity->computedStatusPayload();
        $opportunity->setAttribute('computed_status', $s['code']);
        $opportunity->setAttribute('computed_status_label', $s['label']);

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
        $opportunity->load([
            'client:id,name,company,email,phone,notes,assigned_staff_id',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'contract:id,code,title,client_id,opportunity_id',
        ]);
        $s = $opportunity->computedStatusPayload();
        $opportunity->setAttribute('computed_status', $s['code']);
        $opportunity->setAttribute('computed_status_label', $s['label']);

        return response()->json($opportunity);
    }

    public function update(Request $request, Opportunity $opportunity): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccessOpportunity($user, $opportunity)) {
            return response()->json(['message' => 'Không có quyền xem cơ hội.'], 403);
        }
        if (! $this->canMutateOpportunity($user, $opportunity)) {
            return response()->json([
                'message' => 'Chỉ nhân viên phụ trách khách hàng (hoặc quản lý/admin) mới được sửa cơ hội này.',
            ], 403);
        }
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'opportunity_type' => ['nullable', 'string', 'max:120'],
            'client_id' => ['sometimes', 'required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'source' => ['nullable', 'string', 'max:120'],
            'success_probability' => ['required', 'integer', 'min:0', 'max:100'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'watcher_ids' => ['nullable', 'array'],
            'watcher_ids.*' => ['integer', 'exists:users,id'],
            'expected_close_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'contract_id' => ['sometimes', 'nullable', 'integer', 'exists:contracts,id'],
        ]);
        $shouldSyncContract = array_key_exists('contract_id', $validated);
        $contractId = null;
        if ($shouldSyncContract) {
            $v = $validated['contract_id'];
            unset($validated['contract_id']);
            $contractId = $v !== null ? (int) $v : null;
            if ($contractId !== null && $contractId <= 0) {
                $contractId = null;
            }
        }
        if (array_key_exists('watcher_ids', $validated)) {
            $validated['watcher_ids'] = $this->normalizeWatcherIds($validated['watcher_ids'] ?? []);
        }
        if (array_key_exists('client_id', $validated)) {
            $targetClient = Client::query()->find((int) $validated['client_id']);
            if (! $targetClient || ! $this->canMutateOpportunityForClient($user, $targetClient)) {
                return response()->json([
                    'message' => 'Không có quyền gắn cơ hội cho khách hàng đã chọn.',
                ], 403);
            }
        }
        $opportunity->update($validated);
        if ($shouldSyncContract) {
            $this->syncOpportunityContractLink($request, $opportunity->fresh(), $contractId);
        }
        $opportunity->load([
            'client:id,name,company,email,phone,notes,assigned_staff_id',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'contract:id,code,title,client_id,opportunity_id',
        ]);
        $s = $opportunity->computedStatusPayload();
        $opportunity->setAttribute('computed_status', $s['code']);
        $opportunity->setAttribute('computed_status_label', $s['label']);

        return response()->json($opportunity);
    }

    public function destroy(Opportunity $opportunity): JsonResponse
    {
        $user = request()->user();
        if (! $this->canAccessOpportunity($user, $opportunity)) {
            return response()->json(['message' => 'Không có quyền xem cơ hội.'], 403);
        }
        if (! $this->canMutateOpportunity($user, $opportunity)) {
            return response()->json([
                'message' => 'Chỉ nhân viên phụ trách khách hàng (hoặc quản lý/admin) mới được xóa cơ hội này.',
            ], 403);
        }
        if ($opportunity->contract()->exists()) {
            return response()->json([
                'message' => 'Cơ hội đã có hợp đồng liên kết, không thể xóa.',
            ], 422);
        }
        $opportunity->delete();
        return response()->json(['message' => 'Đã xóa cơ hội.']);
    }

    private function syncOpportunityContractLink(Request $request, Opportunity $opportunity, ?int $contractId): void
    {
        DB::transaction(function () use ($request, $opportunity, $contractId) {
            $oppId = (int) $opportunity->id;

            if ($contractId === null || $contractId <= 0) {
                Contract::query()
                    ->where('opportunity_id', $oppId)
                    ->update(['opportunity_id' => null]);

                return;
            }

            $scopeQuery = Contract::query()->whereKey($contractId);
            CrmScope::applyContractScope($scopeQuery, $request->user());
            $contract = $scopeQuery->lockForUpdate()->first();

            if (! $contract) {
                throw ValidationException::withMessages([
                    'contract_id' => ['Không tìm thấy hợp đồng hoặc không có quyền.'],
                ]);
            }

            if ((int) $contract->client_id !== (int) $opportunity->client_id) {
                throw ValidationException::withMessages([
                    'contract_id' => ['Hợp đồng phải cùng khách hàng với cơ hội.'],
                ]);
            }

            if ($contract->opportunity_id !== null && (int) $contract->opportunity_id !== $oppId) {
                throw ValidationException::withMessages([
                    'contract_id' => ['Hợp đồng đã gắn cơ hội khác.'],
                ]);
            }

            Contract::query()
                ->where('opportunity_id', $oppId)
                ->where('id', '!=', $contractId)
                ->update(['opportunity_id' => null]);

            $contract->refresh();
            $contract->forceFill(['opportunity_id' => $oppId])->save();
        });
    }

    /**
     * Ghi (tạo/sửa/xóa): nhân viên chỉ khi là assigned_staff của khách; admin/kế toán/QL giữ quyền rộng.
     */
    private function canMutateOpportunityForClient(User $user, Client $client): bool
    {
        if (CrmScope::hasGlobalScope($user)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            return CrmScope::canManagerAccessClient($user, $client);
        }

        if ($user->role === 'nhan_vien') {
            return (int) ($client->assigned_staff_id ?? 0) === (int) $user->id;
        }

        return false;
    }

    private function canMutateOpportunity(User $user, Opportunity $opportunity): bool
    {
        if (CrmScope::hasGlobalScope($user)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            return CrmScope::canManagerAccessOpportunity($user, $opportunity);
        }

        $opportunity->loadMissing('client');
        if (! $opportunity->client) {
            return false;
        }

        return $this->canMutateOpportunityForClient($user, $opportunity->client);
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
            if ($this->opportunityNhanVienFilterStaffIds === null) {
                $this->opportunityNhanVienFilterStaffIds = app(StaffFilterOptionsService::class)
                    ->forOpportunities($viewer)
                    ->pluck('id')
                    ->map(function ($id) {
                        return (int) $id;
                    })
                    ->unique()
                    ->values();
            }

            return $this->opportunityNhanVienFilterStaffIds->contains($staffId);
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
