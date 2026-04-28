<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Opportunity;
use App\Models\OpportunityStatus;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\StaffFilterOptionsService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class OpportunityController extends Controller
{
    /** @var \Illuminate\Support\Collection<int, int>|null Khớp staff-filter-options?context=opportunities cho nhan_vien */
    private $opportunityNhanVienFilterStaffIds = null;

    public function index(Request $request): JsonResponse
    {
        $viewer = $request->user();
        $isLinkableForContract = $request->boolean('linkable_for_contract');
        $statusOptions = $this->statusOptions();
        $scopeWithoutStatus = $this->opportunityIndexFilteredQuery($request, $viewer, false);
        $filtered = $this->opportunityIndexFilteredQuery($request, $viewer, true);
        $comparisonBase = $this->opportunityIndexFilteredQuery($request, $viewer, true, false);

        $revenueTotal = (float) ($filtered->clone()->sum('amount') ?? 0);
        $statusCounts = $isLinkableForContract
            ? $this->emptyOpportunityStatusCounts($statusOptions, (int) $filtered->clone()->count())
            : $this->buildOpportunityStatusCounts($scopeWithoutStatus, $statusOptions);
        $comparison = $isLinkableForContract
            ? $this->emptyOpportunityMonthlyComparison()
            : $this->buildOpportunityMonthlyComparison($comparisonBase->clone(), $statusOptions);

        $query = $filtered->clone()->with([
            'client:id,name,company,email,phone,notes,assigned_staff_id',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusRelation:code,name,color_hex,sort_order',
            'contract:id,code,title,client_id,opportunity_id',
        ]);

        $result = $query
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 20));

        $result->getCollection()->transform(function (Opportunity $o) use ($viewer) {
            $this->decorateOpportunityStatus($o);
            $this->appendOpportunityPermissions($o, $viewer);

            return $o;
        });

        $payload = $result->toArray();
        $payload['aggregates'] = [
            'revenue_total' => $revenueTotal,
            'status_counts' => $statusCounts,
            'comparison' => $comparison,
        ];
        $payload['status_options'] = $statusOptions;

        return response()->json($payload);
    }

    private function opportunityIndexFilteredQuery(
        Request $request,
        User $viewer,
        bool $applyStatusFilter = true,
        bool $applyExpectedCloseFilters = true
    ): Builder
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
        if (! $request->boolean('linkable_for_contract') && $applyStatusFilter) {
            $statusFilter = $this->resolveRequestedStatusFilter($request);
            if ($statusFilter !== null) {
                $query->where('status', $statusFilter);
            }
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
        if ($applyExpectedCloseFilters && $request->filled('expected_close_from')) {
            $query->whereDate('expected_close_date', '>=', (string) $request->input('expected_close_from'));
        }
        if ($applyExpectedCloseFilters && $request->filled('expected_close_to')) {
            $query->whereDate('expected_close_date', '<=', (string) $request->input('expected_close_to'));
        }

        return $query;
    }

    /**
     * @param  array<int, array{code:string,name:string,color_hex:string,sort_order:int}>  $statusOptions
     * @return array<string, int>
     */
    private function buildOpportunityStatusCounts(Builder $query, array $statusOptions): array
    {
        $counts = $this->emptyOpportunityStatusCounts($statusOptions, (int) $query->clone()->count());
        foreach ($statusOptions as $status) {
            $statusCode = (string) ($status['code'] ?? '');
            if ($statusCode === '') {
                continue;
            }
            $statusQuery = $query->clone();
            $statusQuery->where('status', $statusCode);
            $counts[$statusCode] = (int) $statusQuery->count();
        }

        return $counts;
    }

    private function buildOpportunityMonthlyComparison(Builder $baseFilteredQuery, array $statusOptions): array
    {
        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $currentFrom = $now->copy()->startOfMonth()->toDateString();
        $currentTo = $now->copy()->endOfMonth()->toDateString();
        $previousFrom = $now->copy()->subMonthNoOverflow()->startOfMonth()->toDateString();
        $previousTo = $now->copy()->subMonthNoOverflow()->endOfMonth()->toDateString();

        [$successCodes, $failedCodes] = $this->resolveOpportunityStatusBuckets($statusOptions);

        $current = $this->opportunityComparisonMetricsForPeriod(
            $baseFilteredQuery->clone(),
            $currentFrom,
            $currentTo,
            $successCodes,
            $failedCodes
        );
        $previous = $this->opportunityComparisonMetricsForPeriod(
            $baseFilteredQuery->clone(),
            $previousFrom,
            $previousTo,
            $successCodes,
            $failedCodes
        );

        return [
            'mode' => 'month',
            'current_label' => 'Tháng '.$now->format('m/Y'),
            'previous_label' => 'Tháng '.$now->copy()->subMonthNoOverflow()->format('m/Y'),
            'current_period' => [
                'from' => $currentFrom,
                'to' => $currentTo,
            ],
            'previous_period' => [
                'from' => $previousFrom,
                'to' => $previousTo,
            ],
            'date_basis' => 'created_at',
            'ignores_expected_close_filters' => true,
            'current' => $current,
            'previous' => $previous,
            'change_percent' => [
                'clients_count' => $this->percentChange($current['clients_count'], $previous['clients_count']),
                'opportunities_count' => $this->percentChange($current['opportunities_count'], $previous['opportunities_count']),
                'success_count' => $this->percentChange($current['success_count'], $previous['success_count']),
                'revenue_total' => $this->percentChange($current['revenue_total'], $previous['revenue_total']),
                'success_rate' => $this->percentChange($current['success_rate'], $previous['success_rate']),
                'failure_rate' => $this->percentChange($current['failure_rate'], $previous['failure_rate']),
                'avg_care_days' => $this->percentChange($current['avg_care_days'], $previous['avg_care_days']),
            ],
            'status_buckets' => [
                'success' => array_values($successCodes),
                'failed' => array_values($failedCodes),
            ],
        ];
    }

    private function opportunityComparisonMetricsForPeriod(
        Builder $baseFilteredQuery,
        string $fromDate,
        string $toDate,
        array $successStatusCodes,
        array $failedStatusCodes
    ): array {
        $periodQuery = $baseFilteredQuery
            ->clone()
            ->whereDate('created_at', '>=', $fromDate)
            ->whereDate('created_at', '<=', $toDate);

        $opportunitiesCount = (int) $periodQuery->clone()->count();
        $clientsCount = (int) $periodQuery->clone()
            ->whereNotNull('client_id')
            ->distinct()
            ->count('client_id');
        $revenueTotal = (float) ($periodQuery->clone()->sum('amount') ?? 0);

        $successCount = ! empty($successStatusCodes)
            ? (int) $periodQuery->clone()->whereIn('status', $successStatusCodes)->count()
            : 0;
        $failedCount = ! empty($failedStatusCodes)
            ? (int) $periodQuery->clone()->whereIn('status', $failedStatusCodes)->count()
            : 0;
        $successClientCount = ! empty($successStatusCodes)
            ? (int) $periodQuery->clone()
                ->whereIn('status', $successStatusCodes)
                ->whereNotNull('client_id')
                ->distinct()
                ->count('client_id')
            : 0;

        $createdAtRows = $periodQuery->clone()->pluck('created_at');
        $avgCareDays = 0.0;
        if ($createdAtRows->isNotEmpty()) {
            $now = Carbon::now('Asia/Ho_Chi_Minh');
            $avgCareDays = (float) $createdAtRows
                ->map(function ($createdAt) use ($now) {
                    if (! $createdAt) {
                        return 0;
                    }

                    return Carbon::parse($createdAt, 'Asia/Ho_Chi_Minh')->diffInDays($now);
                })
                ->avg();
        }

        $successRate = $opportunitiesCount > 0
            ? ($successCount / $opportunitiesCount) * 100
            : 0.0;
        $failureRate = $opportunitiesCount > 0
            ? ($failedCount / $opportunitiesCount) * 100
            : 0.0;

        return [
            'clients_count' => $clientsCount,
            'opportunities_count' => $opportunitiesCount,
            'success_count' => $successCount,
            'failed_count' => $failedCount,
            'success_clients_count' => $successClientCount,
            'revenue_total' => round($revenueTotal, 2),
            'success_rate' => round($successRate, 2),
            'failure_rate' => round($failureRate, 2),
            'avg_care_days' => round($avgCareDays, 2),
        ];
    }

    private function emptyOpportunityMonthlyComparison(): array
    {
        $empty = [
            'clients_count' => 0,
            'opportunities_count' => 0,
            'success_count' => 0,
            'failed_count' => 0,
            'success_clients_count' => 0,
            'revenue_total' => 0.0,
            'success_rate' => 0.0,
            'failure_rate' => 0.0,
            'avg_care_days' => 0.0,
        ];

        return [
            'mode' => 'month',
            'current_label' => 'Tháng hiện tại',
            'previous_label' => 'Tháng trước',
            'current_period' => ['from' => null, 'to' => null],
            'previous_period' => ['from' => null, 'to' => null],
            'date_basis' => 'created_at',
            'ignores_expected_close_filters' => true,
            'current' => $empty,
            'previous' => $empty,
            'change_percent' => [
                'clients_count' => 0.0,
                'opportunities_count' => 0.0,
                'success_count' => 0.0,
                'revenue_total' => 0.0,
                'success_rate' => 0.0,
                'failure_rate' => 0.0,
                'avg_care_days' => 0.0,
            ],
            'status_buckets' => [
                'success' => [],
                'failed' => [],
            ],
        ];
    }

    private function resolveOpportunityStatusBuckets(array $statusOptions): array
    {
        $successCodes = [];
        $failedCodes = [];

        foreach ($statusOptions as $status) {
            $code = trim((string) ($status['code'] ?? ''));
            if ($code === '') {
                continue;
            }

            $name = trim((string) ($status['name'] ?? ''));
            $haystack = Str::lower(Str::ascii($code.' '.$name));

            if ($this->textContainsAny($haystack, [
                'thanh cong',
                'success',
                'won',
                'win',
                'hoan tat',
                'hoan thanh',
                'chot',
            ])) {
                $successCodes[] = $code;
            }

            if ($this->textContainsAny($haystack, [
                'that bai',
                'fail',
                'lost',
                'huy',
                'cancel',
                'reject',
                'tu choi',
            ])) {
                $failedCodes[] = $code;
            }
        }

        if (empty($successCodes)) {
            foreach ($statusOptions as $status) {
                $code = trim((string) ($status['code'] ?? ''));
                if ($code === '') {
                    continue;
                }
                if (in_array($code, ['won', 'success'], true)) {
                    $successCodes[] = $code;
                }
            }
        }

        if (empty($failedCodes)) {
            foreach ($statusOptions as $status) {
                $code = trim((string) ($status['code'] ?? ''));
                if ($code === '') {
                    continue;
                }
                if (in_array($code, ['lost', 'failed', 'cancelled'], true)) {
                    $failedCodes[] = $code;
                }
            }
        }

        return [
            array_values(array_unique($successCodes)),
            array_values(array_unique($failedCodes)),
        ];
    }

    private function textContainsAny(string $haystack, array $needles): bool
    {
        foreach ($needles as $needle) {
            $normalizedNeedle = trim(Str::lower(Str::ascii((string) $needle)));
            if ($normalizedNeedle !== '' && str_contains($haystack, $normalizedNeedle)) {
                return true;
            }
        }

        return false;
    }

    private function percentChange($current, $previous): float
    {
        $currentValue = (float) $current;
        $previousValue = (float) $previous;

        if ($previousValue <= 0.0) {
            if ($currentValue <= 0.0) {
                return 0.0;
            }

            return 100.0;
        }

        return round((($currentValue - $previousValue) / $previousValue) * 100, 2);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'opportunity_type' => ['nullable', 'string', 'max:120'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', Rule::exists('opportunity_statuses', 'code')],
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
        $validated['status'] = trim((string) ($validated['status'] ?? '')) ?: $this->defaultOpportunityStatusCode();
        $validated['watcher_ids'] = $this->normalizeWatcherIds($validated['watcher_ids'] ?? []);

        $opportunity = Opportunity::create($validated);
        $this->syncOpportunityContractLink($request, $opportunity, $contractId);
        $opportunity->load([
            'client:id,name,company,email,phone,notes,assigned_staff_id',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusRelation:code,name,color_hex,sort_order',
            'contract:id,code,title,client_id,opportunity_id',
        ]);
        $this->decorateOpportunityStatus($opportunity);
        $this->appendOpportunityPermissions($opportunity, $request->user());

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
            'statusRelation:code,name,color_hex,sort_order',
            'contract:id,code,title,client_id,opportunity_id',
        ]);
        $this->decorateOpportunityStatus($opportunity);
        $this->appendOpportunityPermissions($opportunity, request()->user());

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
            'status' => ['nullable', 'string', Rule::exists('opportunity_statuses', 'code')],
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
        if (array_key_exists('status', $validated)) {
            $validated['status'] = trim((string) $validated['status']) ?: $this->defaultOpportunityStatusCode();
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
            'statusRelation:code,name,color_hex,sort_order',
            'contract:id,code,title,client_id,opportunity_id',
        ]);
        $this->decorateOpportunityStatus($opportunity);
        $this->appendOpportunityPermissions($opportunity, $user);

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

        $client = $opportunity->client;
        if (! $client) {
            return false;
        }

        return CrmScope::canAccessClient($user, $client);
    }

    private function appendOpportunityPermissions(Opportunity $opportunity, User $user): Opportunity
    {
        $canView = $this->canAccessOpportunity($user, $opportunity);
        $canEdit = $canView && $this->canMutateOpportunity($user, $opportunity);
        $canDelete = $canEdit && ! $this->opportunityHasLinkedContract($opportunity);

        $opportunity->setAttribute('can_view', $canView);
        $opportunity->setAttribute('can_edit', $canEdit);
        $opportunity->setAttribute('can_delete', $canDelete);

        return $opportunity;
    }

    private function opportunityHasLinkedContract(Opportunity $opportunity): bool
    {
        if ($opportunity->relationLoaded('contract')) {
            return $opportunity->contract !== null;
        }

        return $opportunity->contract()->exists();
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

    /**
     * @return array<int, array{code:string,name:string,color_hex:string,sort_order:int}>
     */
    private function statusOptions(): array
    {
        $rows = OpportunityStatus::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['code', 'name', 'color_hex', 'sort_order'])
            ->map(function (OpportunityStatus $status) {
                return [
                    'code' => (string) $status->code,
                    'name' => (string) $status->name,
                    'color_hex' => (string) ($status->color_hex ?: '#64748B'),
                    'sort_order' => (int) ($status->sort_order ?? 0),
                ];
            })
            ->values()
            ->all();

        if (! empty($rows)) {
            return $rows;
        }

        return [
            ['code' => 'open', 'name' => 'Đang mở', 'color_hex' => '#0EA5E9', 'sort_order' => 1],
            ['code' => 'won', 'name' => 'Thành công', 'color_hex' => '#22C55E', 'sort_order' => 2],
            ['code' => 'lost', 'name' => 'Thất bại', 'color_hex' => '#EF4444', 'sort_order' => 3],
        ];
    }

    private function defaultOpportunityStatusCode(): string
    {
        $options = $this->statusOptions();
        $firstCode = trim((string) ($options[0]['code'] ?? ''));

        return $firstCode !== '' ? $firstCode : 'open';
    }

    /**
     * @param  array<int, array{code:string,name:string,color_hex:string,sort_order:int}>  $statusOptions
     * @return array<string, int>
     */
    private function emptyOpportunityStatusCounts(array $statusOptions, int $allCount): array
    {
        $counts = ['all' => max(0, $allCount)];
        foreach ($statusOptions as $status) {
            $code = trim((string) ($status['code'] ?? ''));
            if ($code === '') {
                continue;
            }
            $counts[$code] = 0;
        }

        return $counts;
    }

    private function decorateOpportunityStatus(Opportunity $opportunity): void
    {
        $payload = $opportunity->computedStatusPayload();
        $code = trim((string) ($payload['code'] ?? ''));
        $label = trim((string) ($payload['label'] ?? ''));
        $colorHex = trim((string) ($payload['color_hex'] ?? '#64748B'));

        if ($code === '') {
            $code = $this->defaultOpportunityStatusCode();
        }
        if ($label === '') {
            $label = $code;
        }
        if ($colorHex === '') {
            $colorHex = '#64748B';
        }

        $opportunity->setAttribute('status', $code);
        $opportunity->setAttribute('status_label', $label);
        $opportunity->setAttribute('status_color_hex', $colorHex);

        // Giữ tương thích ngược cho web/app đang dùng key computed_status.
        $opportunity->setAttribute('computed_status', $code);
        $opportunity->setAttribute('computed_status_label', $label);
    }

    private function resolveRequestedStatusFilter(Request $request): ?string
    {
        $raw = $request->input('status');
        if ($raw === null || trim((string) $raw) === '') {
            $raw = $request->input('computed_status');
        }

        $statusCode = trim((string) $raw);
        if ($statusCode === '') {
            return null;
        }

        return $statusCode;
    }
}
