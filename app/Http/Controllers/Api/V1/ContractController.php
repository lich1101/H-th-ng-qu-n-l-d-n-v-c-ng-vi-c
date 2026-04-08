<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractCareNote;
use App\Models\ContractCost;
use App\Models\ContractFinanceRequest;
use App\Models\ContractItem;
use App\Models\ContractPayment;
use App\Models\Product;
use App\Models\Project;
use App\Models\RevenueTier;
use App\Models\User;
use App\Services\ContractFinanceRequestService;
use App\Services\DataTransfers\ClientFinancialSyncService;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;

class ContractController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $baseQuery = $this->contractIndexFilteredQuery($request);
        $aggregates = $this->contractListAggregates($baseQuery);

        $query = $baseQuery->clone()
            ->with([
                'client',
                'client.careStaffUsers:id',
                'project',
                'linkedProject',
                'opportunity',
                'creator:id,name,email,avatar_url',
                'approver:id,name,email,avatar_url',
                'collector:id,name,email,avatar_url',
                'handoverReceiver:id,name,email,avatar_url',
                'careStaffUsers:id,name,email,avatar_url,department_id',
            ])
            ->withCount('items')
            ->withSum('items as items_total_value', 'total_price')
            ->withCount('payments')
            ->withSum('payments as payments_total', 'amount')
            ->withSum('costs as costs_total', 'amount');
        if ($request->boolean('with_items')) {
            $query->with('items');
        }

        $sortBy = (string) $request->input('sort_by', 'signed_at');
        $sortDir = $this->normalizeSortDirection((string) $request->input('sort_dir', 'desc'));
        $this->applyContractSorting($query, $sortBy, $sortDir);

        /** @var \Illuminate\Pagination\LengthAwarePaginator $contracts */
        $contracts = $query
            ->paginate((int) $request->input('per_page', 15));
        $contracts->setCollection($contracts->getCollection()->transform(function (Contract $contract) use ($request) {
            return $this->appendContractPermissions($contract, $request->user());
        }));

        $payload = $contracts->toArray();
        $payload['aggregates'] = $aggregates;

        return response()->json($payload);
    }

    /**
     * Danh sách hợp đồng sau CRM scope + filter (chưa eager load, sort, paginate).
     */
    private function contractIndexFilteredQuery(Request $request): Builder
    {
        $query = Contract::query();
        CrmScope::applyContractScope($query, $request->user());

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('client_id')) {
            $query->where('client_id', (int) $request->input('client_id'));
        }
        $staffFilterIds = $this->resolveStaffFilterIds($request);
        if (! empty($staffFilterIds)) {
            $query->where(function (Builder $builder) use ($staffFilterIds) {
                $builder->whereIn('collector_user_id', $staffFilterIds)
                    ->orWhereIn('created_by', $staffFilterIds)
                    ->orWhereIn('handover_received_by', $staffFilterIds)
                    ->orWhereHas('careStaffUsers', function (Builder $careStaffQuery) use ($staffFilterIds) {
                        $careStaffQuery->whereIn('users.id', $staffFilterIds);
                    })
                    ->orWhereHas('client', function (Builder $clientQuery) use ($staffFilterIds) {
                        $clientQuery->whereIn('assigned_staff_id', $staffFilterIds)
                            ->orWhereIn('sales_owner_id', $staffFilterIds)
                            ->orWhereHas('careStaffUsers', function (Builder $careStaffQuery) use ($staffFilterIds) {
                                $careStaffQuery->whereIn('users.id', $staffFilterIds);
                            });
                    });
            });
        }
        if ($request->filled('approval_status')) {
            $query->where('approval_status', (string) $request->input('approval_status'));
        }
        if ($request->filled('handover_receive_status')) {
            $query->where('handover_receive_status', (string) $request->input('handover_receive_status'));
        }
        if ($request->filled('has_project')) {
            $hasProject = $request->input('has_project');
            if ($hasProject === 'yes') {
                $query->where(function (Builder $builder) {
                    $builder->whereNotNull('contracts.project_id')
                        ->orWhereExists(function ($sub) {
                            $sub->selectRaw('1')
                                ->from('projects')
                                ->whereColumn('projects.contract_id', 'contracts.id');
                        });
                });
            } elseif ($hasProject === 'no') {
                $query->whereNull('contracts.project_id')
                    ->whereNotExists(function ($sub) {
                        $sub->selectRaw('1')
                            ->from('projects')
                            ->whereColumn('projects.contract_id', 'contracts.id');
                    });
            }
        }
        if ($request->filled('project_status')) {
            $ps = (string) $request->input('project_status');
            $query->where(function (Builder $builder) use ($ps) {
                $builder->whereHas('project', function (Builder $q) use ($ps) {
                    $q->where('status', $ps);
                })->orWhereHas('linkedProject', function (Builder $q) use ($ps) {
                    $q->where('status', $ps);
                });
            });
        }
        if ($request->boolean('available_only')) {
            $projectId = (int) $request->input('project_id', 0);
            $query->where(function ($builder) use ($projectId) {
                $builder->whereNull('project_id');
                if ($projectId > 0) {
                    $builder->orWhere('project_id', $projectId);
                }
            });
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($builder) use ($search) {
                $builder->where('code', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%")
                    ->orWhere('approval_note', 'like', "%{$search}%")
                    ->orWhereHas('client', function ($clientQuery) use ($search) {
                        $clientQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    })
                    ->orWhereHas('project', function ($projectQuery) use ($search) {
                        $projectQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%");
                    })
                    ->orWhereHas('linkedProject', function ($projectQuery) use ($search) {
                        $projectQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%");
                    });
            });
        }

        return $query;
    }

    /**
     * Tổng doanh thu (giá trị hiệu lực), dòng tiền (đã thu), công nợ, chi phí — toàn bộ dòng thỏa filter, không paginate.
     * Khớp model Contract: effective_value, payments_total, debt_outstanding, costs_total.
     */
    private function contractListAggregates(Builder $filteredQuery): array
    {
        $idsSub = $filteredQuery->clone()->select('contracts.id');

        $itemsAgg = ContractItem::query()
            ->selectRaw('contract_id, COALESCE(SUM(total_price), 0) as items_sum, COUNT(*) as items_cnt')
            ->groupBy('contract_id');

        $paymentsAgg = ContractPayment::query()
            ->selectRaw('contract_id, COALESCE(SUM(amount), 0) as pay_sum')
            ->groupBy('contract_id');

        $costsAgg = ContractCost::query()
            ->selectRaw('contract_id, COALESCE(SUM(amount), 0) as cost_sum')
            ->groupBy('contract_id');

        $effSql = '(CASE WHEN COALESCE(items_agg.items_cnt, 0) > 0 THEN COALESCE(items_agg.items_sum, 0) ELSE COALESCE(contracts.value, 0) END)';

        $row = Contract::query()
            ->whereIn('contracts.id', $idsSub)
            ->leftJoinSub($itemsAgg, 'items_agg', function ($join) {
                $join->on('items_agg.contract_id', '=', 'contracts.id');
            })
            ->leftJoinSub($paymentsAgg, 'pay_agg', function ($join) {
                $join->on('pay_agg.contract_id', '=', 'contracts.id');
            })
            ->leftJoinSub($costsAgg, 'cost_agg', function ($join) {
                $join->on('cost_agg.contract_id', '=', 'contracts.id');
            })
            ->selectRaw("
                COALESCE(SUM({$effSql}), 0) as revenue_total,
                COALESCE(SUM(COALESCE(pay_agg.pay_sum, 0)), 0) as cashflow_total,
                COALESCE(SUM(CASE WHEN ({$effSql} - COALESCE(pay_agg.pay_sum, 0)) > 0 THEN ({$effSql} - COALESCE(pay_agg.pay_sum, 0)) ELSE 0 END), 0) as debt_total,
                COALESCE(SUM(COALESCE(cost_agg.cost_sum, 0)), 0) as costs_total
            ")
            ->first();

        if (! $row) {
            return [
                'revenue_total' => 0.0,
                'cashflow_total' => 0.0,
                'debt_total' => 0.0,
                'costs_total' => 0.0,
            ];
        }

        return [
            'revenue_total' => (float) ($row->revenue_total ?? 0),
            'cashflow_total' => (float) ($row->cashflow_total ?? 0),
            'debt_total' => (float) ($row->debt_total ?? 0),
            'costs_total' => (float) ($row->costs_total ?? 0),
        ];
    }

    public function show(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canViewContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem hợp đồng.'], 403);
        }

        $this->loadContractDetail($contract);

        return response()->json(
            $this->appendContractPermissions($contract, $request->user())
        );
    }

    private function normalizeSortDirection(string $direction): string
    {
        return strtolower($direction) === 'asc' ? 'asc' : 'desc';
    }

    private function applyContractSorting(Builder $query, string $sortBy, string $sortDir): void
    {
        $direction = $this->normalizeSortDirection($sortDir);
        $rawDirection = strtoupper($direction);

        switch ($sortBy) {
            case 'code':
                $query->orderBy('contracts.code', $direction);
                break;
            case 'title':
                $query->orderBy('contracts.title', $direction);
                break;
            case 'client_name':
                $query->orderBy(
                    Client::query()
                        ->select('name')
                        ->whereColumn('clients.id', 'contracts.client_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'client_phone':
                $query->orderBy(
                    Client::query()
                        ->select('phone')
                        ->whereColumn('clients.id', 'contracts.client_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'signed_at':
                $query->orderByRaw('CASE WHEN contracts.signed_at IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('contracts.signed_at', $direction);
                break;
            case 'end_date':
                $query->orderByRaw('CASE WHEN contracts.end_date IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('contracts.end_date', $direction);
                break;
            case 'notes':
                $query->orderBy('contracts.notes', $direction);
                break;
            case 'collector_name':
                $query->orderBy(
                    User::query()
                        ->select('name')
                        ->whereColumn('users.id', 'contracts.collector_user_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'value':
                $query->orderBy('contracts.value', $direction);
                break;
            case 'payments_total':
                $query->orderBy('payments_total', $direction);
                break;
            case 'debt_outstanding':
                $query->orderByRaw('(COALESCE(contracts.value, 0) - COALESCE(payments_total, 0)) ' . $rawDirection);
                break;
            case 'costs_total':
                $query->orderBy('costs_total', $direction);
                break;
            case 'payments_count':
                $query->orderBy('payments_count', $direction);
                break;
            case 'status':
                $query->orderBy('contracts.status', $direction);
                break;
            case 'approval_status':
                $query->orderBy('contracts.approval_status', $direction);
                break;
            case 'handover_receive_status':
                $query->orderBy('contracts.handover_receive_status', $direction);
                break;
            default:
                $query->orderByRaw('CASE WHEN contracts.signed_at IS NULL THEN 1 ELSE 0 END')
                    ->orderByDesc('contracts.signed_at');
                $direction = 'desc';
                break;
        }

        $query->orderBy('contracts.id', $direction);
    }

    public function store(Request $request): JsonResponse
    {
        $rules = array_merge($this->rules(null, true), [
            'pending_payment_requests' => ['nullable', 'array', 'max:100'],
            'pending_payment_requests.*.amount' => ['required', 'numeric', 'min:0'],
            'pending_payment_requests.*.paid_at' => ['nullable', 'date'],
            'pending_payment_requests.*.method' => ['nullable', 'string', 'max:60'],
            'pending_payment_requests.*.note' => ['nullable', 'string'],
            'pending_cost_requests' => ['nullable', 'array', 'max:100'],
            'pending_cost_requests.*.amount' => ['required', 'numeric', 'min:0'],
            'pending_cost_requests.*.cost_date' => ['nullable', 'date'],
            'pending_cost_requests.*.cost_type' => ['nullable', 'string', 'max:120'],
            'pending_cost_requests.*.note' => ['nullable', 'string'],
        ]);

        $validated = $request->validate($rules);
        $careStaffIds = $this->extractCareStaffIds($validated);
        $pendingPayments = isset($validated['pending_payment_requests']) && is_array($validated['pending_payment_requests'])
            ? $validated['pending_payment_requests'] : [];
        $pendingCosts = isset($validated['pending_cost_requests']) && is_array($validated['pending_cost_requests'])
            ? $validated['pending_cost_requests'] : [];
        unset($validated['pending_payment_requests'], $validated['pending_cost_requests']);

        $client = Client::query()->find((int) $validated['client_id']);
        if (! $client) {
            return response()->json(['message' => 'Khách hàng không tồn tại.'], 422);
        }
        if (! $this->canManageContractClient($request->user(), $client)) {
            return response()->json(['message' => 'Nhân viên chăm sóc chỉ có quyền xem hợp đồng, không được tạo/cập nhật/xóa.'], 403);
        }
        if ($error = $this->validateAssignableCareStaffIds($request->user(), $careStaffIds)) {
            return response()->json(['message' => $error], 422);
        }
        $validated['code'] = $this->generateContractCode();
        $validated['created_by'] = $request->user()->id;
        unset($validated['project_id'], $validated['create_and_approve'], $validated['status']);

        $items = $this->normalizeItems($request->input('items', []));
        if (! empty($items)) {
            $validated['value'] = $this->sumItems($items);
        }

        $validated['collector_user_id'] = $this->resolveCollectorUserId($request, $validated);
        $validated = array_merge($validated, $this->resolveApproval($request));

        $contract = null;

        try {
            DB::transaction(function () use ($request, &$contract, $validated, $careStaffIds, $items, $pendingPayments, $pendingCosts) {
                $contract = Contract::create($validated);
                $this->syncCareStaff($contract, $careStaffIds, $request->user());

                if (! empty($items)) {
                    $this->syncItems($contract, $items);
                }

                $contract->refreshFinancials();

                $this->createPendingFinanceRequestsForNewContract(
                    $contract,
                    $request->user(),
                    $pendingPayments,
                    $pendingCosts
                );

                if (($contract->fresh()->approval_status ?? '') === 'approved') {
                    app(ContractFinanceRequestService::class)->approveAllPendingForContract($contract, $request->user());
                }
            });
        } catch (ValidationException $e) {
            return response()->json([
                'message' => collect($e->errors())->flatten()->first() ?: 'Dữ liệu phiếu thu/chi không hợp lệ.',
                'errors' => $e->errors(),
            ], 422);
        }

        $contract->refresh();
        $contract->loadMissing('client');

        if ($contract->approval_status === 'approved' && $contract->client) {
            $this->syncClientRevenue($contract->client);
        }

        $approverIds = \App\Support\ContractApproverIds::query((int) $request->user()->id);
        if (! empty($approverIds)) {
            try {
                $pending = ($contract->approval_status ?? '') === 'pending';
                $actorName = (string) ($request->user()->name ?? '');
                app(NotificationService::class)->notifyUsersAfterResponse(
                    $approverIds,
                    $pending ? 'Hợp đồng mới cần duyệt' : 'Hợp đồng mới đã được tạo (tự duyệt)',
                    $pending
                        ? 'Hợp đồng: '.$contract->title
                        : ($actorName !== '' ? $actorName.' vừa tạo và duyệt hợp đồng: ' : 'Hợp đồng: ').$contract->title,
                    [
                        'type' => 'contract_approval',
                        'category' => 'crm_realtime',
                        'force_delivery' => true,
                        'contract_id' => $contract->id,
                        'approval_target' => 'contract',
                    ]
                );
            } catch (\Throwable $e) {
                report($e);
            }
        }

        $this->loadContractDetail($contract);

        return response()->json($this->appendContractPermissions($contract, $request->user()), 201);
    }

    public function update(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canManageContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền cập nhật hợp đồng.'], 403);
        }
        $wasApproved = ($contract->approval_status ?? '') === 'approved';
        $validated = $request->validate($this->rules($contract->id, true));
        unset($validated['status']);
        $careStaffIds = $this->extractCareStaffIds($validated);
        $client = Client::query()->find((int) $validated['client_id']);
        if (! $client) {
            return response()->json(['message' => 'Khách hàng không tồn tại.'], 422);
        }
        if (! $this->canManageContractClient($request->user(), $client, $contract)) {
            return response()->json(['message' => 'Nhân viên chăm sóc chỉ có quyền xem hợp đồng, không được tạo/cập nhật/xóa.'], 403);
        }
        if ($error = $this->validateAssignableCareStaffIds($request->user(), $careStaffIds)) {
            return response()->json(['message' => $error], 422);
        }
        $items = $this->normalizeItems($request->input('items', []));
        if (! empty($items)) {
            $validated['value'] = $this->sumItems($items);
        }

        $validated['collector_user_id'] = $this->resolveCollectorUserId($request, $validated, $contract);

        if (! $this->canApprove($request->user())) {
            unset($validated['approval_status'], $validated['approved_by'], $validated['approved_at'], $validated['approval_note']);
        } elseif (isset($validated['approval_status'])) {
            if ($validated['approval_status'] === 'approved') {
                $validated['approved_by'] = $request->user()->id;
                $validated['approved_at'] = now();
            } else {
                $validated['approved_by'] = null;
                $validated['approved_at'] = null;
            }
        }

        try {
            DB::transaction(function () use ($request, $contract, $validated, $careStaffIds, $items, $wasApproved) {
                $contract->update($validated);
                $this->syncCareStaff($contract, $careStaffIds, $request->user());

                if (! empty($items)) {
                    $this->syncItems($contract, $items);
                }

                $contract->refreshFinancials();
                $contract->refresh();

                if (
                    ! $wasApproved
                    && ($contract->approval_status ?? '') === 'approved'
                    && $this->canApprove($request->user())
                ) {
                    app(ContractFinanceRequestService::class)->approveAllPendingForContract($contract, $request->user());
                }
            });
        } catch (\Illuminate\Validation\ValidationException $e) {
            $first = collect($e->errors())->flatten()->first();

            return response()->json([
                'message' => $first ?: 'Không thể duyệt phiếu tài chính kèm theo hợp đồng.',
                'errors' => $e->errors(),
            ], 422);
        }

        $contract->refresh();
        if ($contract->client) {
            $this->syncClientRevenue($contract->client);
        }

        $this->loadContractDetail($contract);

        return response()->json($this->appendContractPermissions($contract, $request->user()));
    }

    public function approve(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canApprove($request->user())) {
            return response()->json(['message' => 'Không có quyền duyệt hợp đồng.'], 403);
        }

        $validated = $request->validate([
            'approval_note' => ['nullable', 'string'],
        ]);

        try {
            DB::transaction(function () use ($contract, $request, $validated) {
                $contract->update([
                    'approval_status' => 'approved',
                    'approved_by' => $request->user()->id,
                    'approved_at' => now(),
                    'approval_note' => $validated['approval_note'] ?? $contract->approval_note,
                ]);

                $contract->refresh();
                app(ContractFinanceRequestService::class)->approveAllPendingForContract($contract, $request->user());
            });
        } catch (\Illuminate\Validation\ValidationException $e) {
            $first = collect($e->errors())->flatten()->first();

            return response()->json([
                'message' => $first ?: 'Không thể duyệt phiếu tài chính kèm theo hợp đồng.',
                'errors' => $e->errors(),
            ], 422);
        }

        $contract->refresh();
        $contract->refreshFinancials();
        if ($contract->client) {
            $this->syncClientRevenue($contract->client);
        }

        $this->loadContractDetail($contract);

        return response()->json($this->appendContractPermissions($contract, $request->user()));
    }

    public function cancel(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canManageContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền hủy hợp đồng.'], 403);
        }

        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $reason = trim((string) ($validated['note'] ?? ''));
        $prev = trim((string) ($contract->notes ?? ''));
        $stamp = '[Hủy hợp đồng]';
        $line = $reason !== '' ? "{$stamp}: {$reason}" : $stamp;
        $contract->update([
            'status' => 'cancelled',
            'notes' => $prev !== '' ? "{$prev}\n\n{$line}" : $line,
        ]);

        $contract->refresh();
        if ($contract->client) {
            $this->syncClientRevenue($contract->client);
        }

        $this->loadContractDetail($contract);

        return response()->json($this->appendContractPermissions($contract, $request->user()));
    }

    public function destroy(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canManageContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xóa hợp đồng.'], 403);
        }
        if ($contract->project_id) {
            Project::where('id', $contract->project_id)
                ->where('contract_id', $contract->id)
                ->update(['contract_id' => null]);
        }

        $client = $contract->client;
        $contract->delete();

        if ($client) {
            $this->syncClientRevenue($client);
        }

        return response()->json(['message' => 'Contract deleted.']);
    }

    public function storeCareNote(Request $request, Contract $contract): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewContract($user, $contract)) {
            return response()->json(['message' => 'Không có quyền xem hợp đồng.'], 403);
        }
        if (! $this->canAddCareNote($user, $contract)) {
            return response()->json(['message' => 'Không có quyền thêm cập nhật chăm sóc cho hợp đồng này.'], 403);
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'detail' => ['required', 'string', 'max:12000'],
        ]);

        $note = ContractCareNote::query()->create([
            'contract_id' => $contract->id,
            'user_id' => $user->id,
            'title' => trim((string) $validated['title']),
            'detail' => trim((string) $validated['detail']),
        ]);

        return response()->json([
            'message' => 'Đã thêm ghi chú chăm sóc hợp đồng.',
            'note' => [
                'id' => $note->id,
                'title' => $note->title,
                'detail' => $note->detail,
                'created_at' => optional($note->created_at)->toIso8601String(),
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'avatar_url' => $user->avatar_url,
                ],
            ],
        ], 201);
    }

    private function rules(?int $contractId = null, bool $withOptional = false): array
    {
        $rules = [
            'title' => ['required', 'string', 'max:255'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'opportunity_id' => ['nullable', 'integer', 'exists:opportunities,id'],
            'value' => ['nullable', 'numeric', 'min:0'],
            'payment_times' => ['nullable', 'integer', 'min:1', 'max:120'],
            'revenue' => ['nullable', 'numeric', 'min:0'],
            'debt' => ['nullable', 'numeric', 'min:0'],
            'cash_flow' => ['nullable', 'numeric'],
            'approval_status' => ['nullable', 'string', 'in:pending,approved,rejected'],
            'signed_at' => ['nullable', 'date'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'approval_note' => ['nullable', 'string'],
            'collector_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'care_staff_ids' => ['nullable', 'array'],
            'care_staff_ids.*' => ['integer', 'exists:users,id'],
            'create_and_approve' => ['nullable', 'boolean'],
        ];
        return $rules;
    }

    /** Chỉ admin / administrator / kế toán được duyệt hợp đồng (trưởng phòng và nhân viên không). */
    private function canApprove($user): bool
    {
        return $user && in_array($user->role, ['admin', 'administrator', 'ke_toan'], true);
    }

    private function resolveApproval(Request $request): array
    {
        $user = $request->user();
        if ($this->canApprove($user) && $request->boolean('create_and_approve')) {
            return [
                'approval_status' => 'approved',
                'approved_by' => $user->id,
                'approved_at' => now(),
            ];
        }

        return [
            'approval_status' => 'pending',
            'approved_by' => null,
            'approved_at' => null,
        ];
    }

    private function resolveCollectorUserId(Request $request, array $validated, ?Contract $contract = null): ?int
    {
        $user = $request->user();
        $requestedCollectorId = isset($validated['collector_user_id'])
            ? (int) $validated['collector_user_id']
            : null;

        if (! $user) {
            return $requestedCollectorId;
        }

        if ($user->role === 'nhan_vien') {
            return (int) $user->id;
        }

        if ($user->role === 'quan_ly') {
            $allowedIds = $this->allowedCollectorIdsForManager($user);

            if ($requestedCollectorId && in_array($requestedCollectorId, $allowedIds, true)) {
                return $requestedCollectorId;
            }

            if ($contract && $contract->collector_user_id && in_array((int) $contract->collector_user_id, $allowedIds, true)) {
                return (int) $contract->collector_user_id;
            }

            return (int) $user->id;
        }

        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            $allowedIds = $this->allowedCollectorIdsForAdminAndAccounting();

            if ($requestedCollectorId && in_array($requestedCollectorId, $allowedIds, true)) {
                return $requestedCollectorId;
            }

            if ($contract && $contract->collector_user_id && in_array((int) $contract->collector_user_id, $allowedIds, true)) {
                return (int) $contract->collector_user_id;
            }

            return null;
        }

        return $requestedCollectorId ?: ($contract ? (int) $contract->collector_user_id : null);
    }

    private function allowedCollectorIdsForManager(User $user): array
    {
        return User::query()
            ->where('is_active', true)
            ->where(function (Builder $builder) use ($user) {
                $builder->where('id', $user->id)
                    ->orWhere(function (Builder $employeeBuilder) use ($user) {
                        $employeeBuilder->where('role', 'nhan_vien')
                            ->whereIn('department_id', $user->managedDepartments()->pluck('id'));
                    });
            })
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function allowedCollectorIdsForAdminAndAccounting(): array
    {
        return User::query()
            ->where('is_active', true)
            ->whereNotIn('role', ['admin', 'administrator', 'ke_toan'])
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function allowedCareStaffIdsForManager(User $user): array
    {
        return User::query()
            ->where('is_active', true)
            ->where('role', 'nhan_vien')
            ->whereIn('department_id', $user->managedDepartments()->pluck('id'))
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function allowedCareStaffIdsForAdminAndAccounting(): array
    {
        return User::query()
            ->where('is_active', true)
            ->where('role', 'nhan_vien')
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function extractCareStaffIds(array &$validated): array
    {
        $ids = collect($validated['care_staff_ids'] ?? [])
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();

        unset($validated['care_staff_ids']);

        return $ids;
    }

    private function validateAssignableCareStaffIds(User $user, array $careStaffIds): ?string
    {
        if (empty($careStaffIds)) {
            return null;
        }

        if ($user->role === 'quan_ly') {
            $allowedIds = $this->allowedCareStaffIdsForManager($user);
        } elseif (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            $allowedIds = $this->allowedCareStaffIdsForAdminAndAccounting();
        } else {
            return 'Không có quyền gán nhân viên chăm sóc cho hợp đồng.';
        }

        $invalidIds = array_values(array_diff($careStaffIds, $allowedIds));

        return empty($invalidIds)
            ? null
            : 'Danh sách nhân viên chăm sóc không hợp lệ hoặc vượt phạm vi được phép gán.';
    }

    private function syncCareStaff(Contract $contract, array $careStaffIds, User $user): void
    {
        $payload = [];
        foreach ($careStaffIds as $staffId) {
            $payload[(int) $staffId] = ['assigned_by' => $user->id];
        }

        $contract->careStaffUsers()->sync($payload);
    }

    private function normalizeItems(array $items): array
    {
        if (empty($items)) {
            return [];
        }
        $items = array_values(array_filter($items, function ($item) {
            return is_array($item) && (! empty($item['product_id']) || ! empty($item['product_name']));
        }));
        if (empty($items)) {
            return [];
        }

        $productIds = collect($items)
            ->pluck('product_id')
            ->filter()
            ->unique()
            ->values()
            ->all();
        $products = $productIds
            ? Product::whereIn('id', $productIds)->get()->keyBy('id')
            : collect();

        return collect($items)->map(function ($item) use ($products) {
            $product = null;
            if (! empty($item['product_id'])) {
                $product = $products->get((int) $item['product_id']);
            }
            $name = $item['product_name'] ?? ($product ? $product->name : 'Sản phẩm');
            $unit = $item['unit'] ?? ($product ? $product->unit : null);
            $unitPrice = isset($item['unit_price'])
                ? $this->parseNumericInput($item['unit_price'])
                : ($product ? $this->parseNumericInput($product->unit_price) : 0);
            $quantity = max(1, (int) round($this->parseNumericInput($item['quantity'] ?? 1)));
            $total = $unitPrice * $quantity;

            $row = [
                'product_id' => $product ? $product->id : null,
                'product_name' => $name,
                'unit' => $unit,
                'unit_price' => $unitPrice,
                'quantity' => $quantity,
                'total_price' => $total,
                'note' => $item['note'] ?? null,
            ];
            if (! empty($item['id'])) {
                $row['id'] = (int) $item['id'];
            }

            return $row;
        })->values()->all();
    }

    private function parseNumericInput($value): float
    {
        if ($value === null || $value === '') {
            return 0.0;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        $raw = preg_replace('/\s+/u', '', (string) $value);
        $raw = preg_replace('/(₫|đ|VNĐ|VND)/iu', '', $raw);

        $hasComma = strpos($raw, ',') !== false;
        $hasDot = strpos($raw, '.') !== false;

        if ($hasComma && $hasDot) {
            $raw = str_replace('.', '', $raw);
            $raw = str_replace(',', '.', $raw);
        } elseif ($hasComma) {
            $parts = explode(',', $raw);
            $raw = count($parts) > 2 || (count($parts) === 2 && strlen($parts[1]) === 3)
                ? str_replace(',', '', $raw)
                : str_replace(',', '.', $raw);
        } elseif ($hasDot) {
            $parts = explode('.', $raw);
            if (count($parts) > 2 || (count($parts) === 2 && strlen($parts[1]) === 3)) {
                $raw = str_replace('.', '', $raw);
            }
        }

        $raw = preg_replace('/[^0-9.\-]/', '', $raw);

        return is_numeric($raw) ? (float) $raw : 0.0;
    }

    private function sumItems(array $items): float
    {
        return (float) collect($items)->sum(function ($item) {
            return (float) ($item['total_price'] ?? 0);
        });
    }

    private function syncItems(Contract $contract, array $items): void
    {
        $hasAnyId = collect($items)->contains(function ($row) {
            return ! empty($row['id']);
        });

        if (! $hasAnyId) {
            $contract->items()->delete();
            foreach ($items as $item) {
                $data = $item;
                unset($data['id']);
                $contract->items()->create($data);
            }

            return;
        }

        $existingIds = $contract->items()->pluck('id')->map(function ($id) {
            return (int) $id;
        })->all();
        $keptIds = [];

        foreach ($items as $row) {
            $id = isset($row['id']) ? (int) $row['id'] : 0;
            $data = [
                'product_id' => $row['product_id'] ?? null,
                'product_name' => $row['product_name'] ?? '',
                'unit' => $row['unit'] ?? null,
                'unit_price' => $row['unit_price'] ?? 0,
                'quantity' => $row['quantity'] ?? 1,
                'total_price' => $row['total_price'] ?? 0,
                'note' => $row['note'] ?? null,
            ];

            if ($id > 0 && in_array($id, $existingIds, true)) {
                ContractItem::query()
                    ->where('id', $id)
                    ->where('contract_id', $contract->id)
                    ->update($data);
                $keptIds[] = $id;
            } else {
                $created = $contract->items()->create($data);
                $keptIds[] = (int) $created->id;
            }
        }

        $contract->items()->whereNotIn('id', $keptIds)->delete();
    }

    private function syncClientRevenue(Client $client): void
    {
        app(ClientFinancialSyncService::class)->sync($client);
    }

    private function generateContractCode(): string
    {
        $date = now()->format('Ymd');
        for ($i = 0; $i < 5; $i++) {
            $random = Str::upper(Str::random(4));
            $code = "CTR-{$date}-{$random}";
            if (! Contract::where('code', $code)->exists()) {
                return $code;
            }
        }

        return 'CTR-' . $date . '-' . strtoupper(Str::random(6));
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

        $legacyRaw = $request->input('collector_user_ids', []);
        if (is_string($legacyRaw)) {
            $legacyRaw = preg_split('/[\s,;|]+/', $legacyRaw) ?: [];
        }
        if (is_array($legacyRaw)) {
            $raw = array_merge($raw, $legacyRaw);
        }

        if ($request->filled('collector_user_id')) {
            $raw[] = $request->input('collector_user_id');
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

    private function appendContractPermissions(Contract $contract, User $user): Contract
    {
        $contract->setAttribute('can_view', $this->canViewContract($user, $contract));
        $contract->setAttribute('can_manage', $this->canManageContract($user, $contract));
        $contract->setAttribute('can_delete', $this->canManageContract($user, $contract));
        $contract->setAttribute('can_add_care_note', $this->canAddCareNote($user, $contract));
        $contract->setAttribute('can_review_finance_request', $this->canApprove($user));
        $contract->setAttribute('can_manage_finance', $this->canApprove($user));
        $contract->setAttribute('can_submit_finance_request', $this->canViewContract($user, $contract));
        $contract->setAttribute('payments_display', $this->buildPaymentDisplayRows($contract));
        $contract->setAttribute('costs_display', $this->buildCostDisplayRows($contract));

        $canCreateProject = in_array((string) $user->role, ['admin', 'administrator'], true)
            || (int) ($contract->collector_user_id ?? 0) === (int) $user->id 
            || (int) ($contract->created_by ?? 0) === (int) $user->id;
        $contract->setAttribute('can_create_project', $canCreateProject);

        return $contract;
    }

    private function canViewContract(User $user, Contract $contract): bool
    {
        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return true;
        }

        if ($this->isManagerOfContractDepartment($user, $contract)) {
            return true;
        }

        if ($user->role !== 'nhan_vien') {
            return false;
        }

        return $this->isStaffLinkedToContract($user, $contract, true, true);
    }

    private function canManageContract(User $user, Contract $contract): bool
    {
        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return true;
        }

        if ($this->isManagerOfContractDepartment($user, $contract)) {
            return true;
        }

        return false;
    }

    private function canManageContractClient(User $user, Client $client, ?Contract $contract = null): bool
    {
        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            if (CrmScope::canManagerAccessClient($user, $client)) {
                return true;
            }

            return $contract ? $this->isManagerOfContractDepartment($user, $contract) : false;
        }

        if ($user->role === 'nhan_vien') {
            return $this->isEmployeeLinkedToClient($user, $client);
        }

        return false;
    }

    private function isManagerOfContractDepartment(User $user, Contract $contract): bool
    {
        return CrmScope::canManagerAccessContract($user, $contract);
    }

    private function canAddCareNote(?User $user, Contract $contract): bool
    {
        if (! $user) {
            return false;
        }

        if ($this->canManageContract($user, $contract)) {
            return true;
        }

        if ($user->role !== 'nhan_vien') {
            return false;
        }

        return $this->isStaffLinkedToContract($user, $contract, true, true);
    }

    private function isStaffLinkedToContract(User $user, Contract $contract, bool $includeClientCareStaff, bool $includeContractCareStaff): bool
    {
        if ((int) $contract->created_by === (int) $user->id) {
            return true;
        }
        if ((int) $contract->collector_user_id === (int) $user->id) {
            return true;
        }
        if ($includeContractCareStaff && $this->isContractCareStaff($user, $contract)) {
            return true;
        }

        $contract->loadMissing('client');
        $client = $contract->client;

        if (! $client) {
            return false;
        }

        if ((int) $client->assigned_staff_id === (int) $user->id) {
            return true;
        }
        if ((int) $client->sales_owner_id === (int) $user->id) {
            return true;
        }

        return $includeClientCareStaff && $this->isCareStaff($user, $client);
    }

    private function isEmployeeLinkedToClient(User $user, Client $client): bool
    {
        if ((int) ($client->assigned_staff_id ?? 0) === (int) $user->id) {
            return true;
        }

        if ((int) ($client->sales_owner_id ?? 0) === (int) $user->id) {
            return true;
        }

        return $this->isCareStaff($user, $client);
    }

    private function isCareStaff(User $user, Client $client): bool
    {
        if ($client->relationLoaded('careStaffUsers')) {
            return $client->careStaffUsers->contains(function ($staff) use ($user) {
                return (int) $staff->id === (int) $user->id;
            });
        }

        return $client->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function isContractCareStaff(User $user, Contract $contract): bool
    {
        if ($contract->relationLoaded('careStaffUsers')) {
            return $contract->careStaffUsers->contains(function ($staff) use ($user) {
                return (int) $staff->id === (int) $user->id;
            });
        }

        return $contract->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function buildPaymentDisplayRows(Contract $contract): array
    {
        if (! $contract->relationLoaded('payments')) {
            return [];
        }

        $rows = [];
        foreach ($contract->payments as $p) {
            $rows[] = [
                'row_type' => 'record',
                'id' => $p->id,
                'paid_at' => optional($p->paid_at)->toIso8601String(),
                'amount' => (float) ($p->amount ?? 0),
                'method' => $p->method,
                'note' => $p->note,
                'created_by' => $p->created_by,
            ];
        }
        $financeRequests = $contract->relationLoaded('financeRequests')
            ? $contract->financeRequests
            : collect();

        foreach ($financeRequests as $fr) {
            if ((string) $fr->status !== 'pending' || (string) $fr->request_type !== 'payment') {
                continue;
            }
            $rows[] = [
                'row_type' => 'pending_request',
                'finance_request_id' => $fr->id,
                'id' => 'fr_'.$fr->id,
                'paid_at' => optional($fr->transaction_date)->toIso8601String(),
                'amount' => (float) ($fr->amount ?? 0),
                'method' => $fr->method,
                'note' => $fr->note,
                'submitter' => $fr->submitter,
            ];
        }
        usort($rows, function ($a, $b) {
            return strcmp((string) ($b['paid_at'] ?? ''), (string) ($a['paid_at'] ?? ''));
        });

        return $rows;
    }

    private function buildCostDisplayRows(Contract $contract): array
    {
        if (! $contract->relationLoaded('costs')) {
            return [];
        }

        $rows = [];
        foreach ($contract->costs as $c) {
            $rows[] = [
                'row_type' => 'record',
                'id' => $c->id,
                'cost_date' => optional($c->cost_date)->toIso8601String(),
                'amount' => (float) ($c->amount ?? 0),
                'cost_type' => $c->cost_type,
                'note' => $c->note,
                'created_by' => $c->created_by,
            ];
        }
        $financeRequests = $contract->relationLoaded('financeRequests')
            ? $contract->financeRequests
            : collect();

        foreach ($financeRequests as $fr) {
            if ((string) $fr->status !== 'pending' || (string) $fr->request_type !== 'cost') {
                continue;
            }
            $rows[] = [
                'row_type' => 'pending_request',
                'finance_request_id' => $fr->id,
                'id' => 'frc_'.$fr->id,
                'cost_date' => optional($fr->transaction_date)->toIso8601String(),
                'amount' => (float) ($fr->amount ?? 0),
                'cost_type' => $fr->cost_type,
                'note' => $fr->note,
                'submitter' => $fr->submitter,
            ];
        }
        usort($rows, function ($a, $b) {
            return strcmp((string) ($b['cost_date'] ?? ''), (string) ($a['cost_date'] ?? ''));
        });

        return $rows;
    }

    /**
     * Phiếu thu/chi gửi kèm khi tạo hợp đồng (bản ghi ContractFinanceRequest trạng thái pending).
     *
     * @param  array<int, array<string, mixed>>  $pendingPayments
     * @param  array<int, array<string, mixed>>  $pendingCosts
     */
    private function createPendingFinanceRequestsForNewContract(
        Contract $contract,
        User $actor,
        array $pendingPayments,
        array $pendingCosts
    ): void {
        $actorId = (int) $actor->id;
        $contract->refreshFinancials();

        $runningPaymentTotal = (float) $contract->payments()->sum('amount');
        $contractValue = (float) ($contract->value ?? 0);

        foreach ($pendingPayments as $row) {
            $amount = (float) ($row['amount'] ?? 0);
            if ($amount <= 0) {
                continue;
            }
            $projected = $runningPaymentTotal + $amount;
            if ($projected > $contractValue + 0.0001) {
                $remaining = max(0, $contractValue - $runningPaymentTotal);

                throw ValidationException::withMessages([
                    'pending_payment_requests' => [
                        'Số tiền thanh toán vượt giá trị hợp đồng. Chỉ còn có thể thu tối đa '
                        .number_format($remaining, 0, ',', '.')
                        .' VNĐ.',
                    ],
                ]);
            }
            $runningPaymentTotal = $projected;

            $financeRequest = ContractFinanceRequest::query()->create([
                'contract_id' => $contract->id,
                'request_type' => 'payment',
                'request_action' => 'create',
                'amount' => $amount,
                'transaction_date' => $row['paid_at'] ?? null,
                'method' => $row['method'] ?? null,
                'note' => $row['note'] ?? null,
                'status' => 'pending',
                'submitted_by' => $actorId,
            ]);

            $this->notifyContractFinanceApproversLine($contract, $actor, $financeRequest);
        }

        foreach ($pendingCosts as $row) {
            $amount = (float) ($row['amount'] ?? 0);
            if ($amount <= 0) {
                continue;
            }

            $financeRequest = ContractFinanceRequest::query()->create([
                'contract_id' => $contract->id,
                'request_type' => 'cost',
                'request_action' => 'create',
                'amount' => $amount,
                'transaction_date' => $row['cost_date'] ?? null,
                'cost_type' => $row['cost_type'] ?? null,
                'note' => $row['note'] ?? null,
                'status' => 'pending',
                'submitted_by' => $actorId,
            ]);

            $this->notifyContractFinanceApproversLine($contract, $actor, $financeRequest);
        }
    }

    private function notifyContractFinanceApproversLine(Contract $contract, User $actor, ContractFinanceRequest $financeRequest): void
    {
        $targetIds = \App\Support\ContractApproverIds::query((int) $actor->id);
        if (empty($targetIds)) {
            return;
        }

        $isPayment = ($financeRequest->request_type ?? '') === 'payment';

        try {
            app(NotificationService::class)->notifyUsersAfterResponse(
                $targetIds,
                $isPayment ? 'Có phiếu duyệt thanh toán hợp đồng mới' : 'Có phiếu duyệt chi phí hợp đồng mới',
                ($actor->name ?? '').' vừa gửi yêu cầu '.($isPayment ? 'thêm thanh toán' : 'thêm chi phí').' cho hợp đồng: '.$contract->title,
                [
                    'type' => $isPayment ? 'contract_finance_request_pending_payment' : 'contract_finance_request_pending_cost',
                    'category' => 'crm_realtime',
                    'force_delivery' => true,
                    'contract_id' => (int) $contract->id,
                    'contract_finance_request_id' => (int) $financeRequest->id,
                    'request_type' => (string) $financeRequest->request_type,
                    'approval_target' => 'finance_request',
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function loadContractDetail(Contract $contract): void
    {
        $contract->load([
            'client',
            'client.careStaffUsers:id,name,email,avatar_url',
            'project',
            'linkedProject',
            'opportunity',
            'creator:id,name,email,avatar_url',
            'approver:id,name,email,avatar_url',
            'collector:id,name,email,avatar_url',
            'handoverReceiver:id,name,email,avatar_url',
            'items',
            'payments',
            'costs',
            'financeRequests.submitter:id,name,email,avatar_url',
            'financeRequests.reviewer:id,name,email,avatar_url',
            'careStaffUsers:id,name,email,avatar_url,department_id',
            'careNotes.user:id,name,email,avatar_url',
        ]);
    }

    private function resolveAccessibleClient(Request $request, int $clientId): ?Client
    {
        $query = Client::query()->where('id', $clientId);
        CrmScope::applyClientScope($query, $request->user());

        return $query->first();
    }
}
