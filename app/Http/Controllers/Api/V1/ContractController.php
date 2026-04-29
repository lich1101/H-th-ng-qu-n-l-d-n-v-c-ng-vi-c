<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Opportunity;
use App\Models\ContractCareNote;
use App\Models\ContractFile;
use App\Models\ContractCost;
use App\Models\ContractFinanceRequest;
use App\Models\ContractItem;
use App\Models\ContractPayment;
use App\Models\Product;
use App\Models\Project;
use App\Models\RevenueTier;
use App\Models\User;
use App\Services\ContractActivityLogService;
use App\Services\ContractFinanceRequestService;
use App\Services\ContractFileStorageService;
use App\Services\ContractLifecycleStatusService;
use App\Services\DataTransfers\ClientFinancialSyncService;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ContractController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $baseQuery = $this->contractIndexFilteredQuery($request);
        $aggregates = $this->contractListAggregates($baseQuery);
        $comparison = $this->contractYearComparisonAggregates($request);

        $query = $baseQuery->clone()
            ->select('contracts.*')
            ->selectRaw('('.$this->contractStatusSql().') as status')
            ->with([
                'client',
                'client.careStaffUsers:id',
                'project',
                'linkedProject',
                'opportunity:id,title,client_id',
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

        $sortBy = (string) $request->input('sort_by', 'created_at');
        $sortDir = $this->normalizeSortDirection((string) $request->input('sort_dir', 'desc'));
        $this->applyContractSorting($query, $sortBy, $sortDir);

        $perPage = (int) $request->input('per_page', 20);
        $perPage = $perPage > 0 ? $perPage : 20;
        /** Trần khớp tùy chọn «Hiển thị» trên UI (PaginationControls tối đa 2000). */
        $perPage = max(5, min(2000, $perPage));

        /** @var \Illuminate\Pagination\LengthAwarePaginator $contracts */
        $contracts = $query->paginate($perPage);
        $contracts->setCollection($contracts->getCollection()->transform(function (Contract $contract) use ($request) {
            return $this->appendContractPermissions($contract, $request->user());
        }));

        $payload = $contracts->toArray();
        $payload['aggregates'] = $aggregates;
        $payload['aggregates']['comparison'] = $comparison;

        return response()->json($payload);
    }

    public function exportSelected(Request $request)
    {
        $validated = $request->validate([
            'contract_ids' => ['required', 'array', 'min:1', 'max:5000'],
            'contract_ids.*' => ['integer', 'exists:contracts,id'],
        ], [
            'contract_ids.required' => 'Vui lòng chọn hợp đồng cần xuất.',
            'contract_ids.min' => 'Vui lòng chọn ít nhất một hợp đồng.',
            'contract_ids.max' => 'Mỗi lần xuất tối đa 5000 hợp đồng.',
        ]);

        $ids = collect($validated['contract_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if (empty($ids)) {
            return response()->json(['message' => 'Vui lòng chọn hợp đồng cần xuất.'], 422);
        }

        $query = Contract::query();
        CrmScope::applyContractScope($query, $request->user());

        $relations = [
            'client',
            'client.leadType:id,name',
            'client.assignedStaff:id,name,email',
            'client.salesOwner:id,name,email',
            'client.careStaffUsers:id,name,email',
            'project',
            'linkedProject',
            'opportunity.statusRelation',
            'opportunity.assignee:id,name,email',
            'creator:id,name,email',
            'approver:id,name,email',
            'collector:id,name,email',
            'handoverReceiver:id,name,email',
            'items.product:id,code,name,category_id',
            'payments.creator:id,name,email',
            'costs.creator:id,name,email',
            'financeRequests.submitter:id,name,email',
            'financeRequests.reviewer:id,name,email',
            'careStaffUsers:id,name,email,department_id',
            'careNotes.user:id,name,email',
        ];

        if (Schema::hasTable('contract_files')) {
            $relations[] = 'contractFiles.uploader:id,name,email';
        }

        $order = array_flip($ids);
        $contracts = $query
            ->select('contracts.*')
            ->selectRaw('('.$this->contractStatusSql().') as status')
            ->whereIn('contracts.id', $ids)
            ->with($relations)
            ->withCount('items')
            ->withSum('items as items_total_value', 'total_price')
            ->withCount('payments')
            ->withSum('payments as payments_total', 'amount')
            ->withSum('costs as costs_total', 'amount')
            ->get()
            ->sortBy(fn (Contract $contract) => $order[(int) $contract->id] ?? PHP_INT_MAX)
            ->values();

        if ($contracts->count() !== count($ids)) {
            return response()->json([
                'message' => 'Một số hợp đồng không tồn tại hoặc không thuộc phạm vi được phép xem, nên không thể xuất file.',
            ], 403);
        }

        $spreadsheet = $this->buildSelectedContractsSpreadsheet($contracts);
        $fileName = 'danh-sach-hop-dong-da-chon-'.Carbon::now('Asia/Ho_Chi_Minh')->format('Ymd-His').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * Danh sách hợp đồng sau CRM scope + filter (chưa eager load, sort, paginate).
     */
    private function contractIndexFilteredQuery(Request $request, bool $applyDateFilters = true): Builder
    {
        $query = Contract::query();
        CrmScope::applyContractScope($query, $request->user());

        if ($request->filled('status')) {
            $query->whereRaw('('.$this->contractStatusSql().') = ?', [(string) $request->input('status')]);
        }

        if ($request->boolean('linkable_for_opportunity')) {
            $clientId = (int) $request->input('client_id', 0);
            if ($clientId <= 0) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('contracts.client_id', $clientId);
                $oppId = (int) $request->input('opportunity_id', 0);
                $query->where(function (Builder $q) use ($oppId) {
                    $q->whereNull('contracts.opportunity_id');
                    if ($oppId > 0) {
                        $q->orWhere('contracts.opportunity_id', $oppId);
                    }
                });
            }
        } elseif ($request->filled('client_id')) {
            $query->where('client_id', (int) $request->input('client_id'));
        }
        $staffFilterIds = $this->resolveStaffFilterIds($request);
        if (! empty($staffFilterIds)) {
            // Khớp cột «Nhân viên thu» (collector), không OR theo KH/người tạo để tránh kết quả lệch UI.
            $query->whereIn('contracts.collector_user_id', $staffFilterIds);
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
            $searchIsNumericId = is_string($search) && preg_match('/^\d+$/', trim($search));
            $query->where(function ($builder) use ($search, $searchIsNumericId) {
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
                    })
                    ->orWhereHas('opportunity', function ($oppQuery) use ($search, $searchIsNumericId) {
                        $oppQuery->where('title', 'like', "%{$search}%")
                            ->orWhere('notes', 'like', "%{$search}%");
                        if ($searchIsNumericId) {
                            $oppQuery->orWhere('id', (int) trim($search));
                        }
                    });
            });
        }

        $this->applyContractColumnFilters($query, $request);
        $this->applyContractNumericRangeFilters($query, $request);

        if ($applyDateFilters) {
            foreach ($this->contractDateFieldMap() as $field => $config) {
                $fromKey = $field.'_from';
                $toKey = $field.'_to';

                if ($request->filled($fromKey)) {
                    $query->whereDate($config['column'], '>=', (string) $request->input($fromKey));
                }

                if ($request->filled($toKey)) {
                    $query->whereDate($config['column'], '<=', (string) $request->input($toKey));
                }
            }
        }

        return $query;
    }

    private function contractTextFilter(Request $request, string $key): ?string
    {
        if (! $request->filled($key)) {
            return null;
        }

        $term = trim((string) $request->input($key));

        return $term === '' ? null : $term;
    }

    private function applyContractColumnFilters(Builder $query, Request $request): void
    {
        $term = $this->contractTextFilter($request, 'contract_query');
        if ($term !== null) {
            $query->where(function (Builder $builder) use ($term) {
                $builder->where('contracts.code', 'like', "%{$term}%")
                    ->orWhere('contracts.title', 'like', "%{$term}%");
            });
        }

        $term = $this->contractTextFilter($request, 'client_query');
        if ($term !== null) {
            $query->whereHas('client', function (Builder $clientQuery) use ($term) {
                $clientQuery->where('name', 'like', "%{$term}%")
                    ->orWhere('company', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%");
            });
        }

        $term = $this->contractTextFilter($request, 'client_phone');
        if ($term !== null) {
            $query->whereHas('client', function (Builder $clientQuery) use ($term) {
                $clientQuery->where('phone', 'like', "%{$term}%");
            });
        }

        $term = $this->contractTextFilter($request, 'opportunity_query');
        if ($term !== null) {
            $normalized = preg_replace('/\s+/', '', $term);
            $opportunityId = null;
            if (preg_match('/^(?:CH-?)?(\d+)$/i', $normalized, $matches)) {
                $opportunityId = (int) $matches[1];
            }

            $query->whereHas('opportunity', function (Builder $oppQuery) use ($term, $opportunityId) {
                $oppQuery->where('title', 'like', "%{$term}%")
                    ->orWhere('notes', 'like', "%{$term}%");
                if ($opportunityId) {
                    $oppQuery->orWhere('id', $opportunityId);
                }
            });
        }

        $term = $this->contractTextFilter($request, 'project_query');
        if ($term !== null) {
            $query->where(function (Builder $builder) use ($term) {
                $builder->whereHas('project', function (Builder $projectQuery) use ($term) {
                    $projectQuery->where('name', 'like', "%{$term}%")
                        ->orWhere('code', 'like', "%{$term}%");
                })->orWhereHas('linkedProject', function (Builder $projectQuery) use ($term) {
                    $projectQuery->where('name', 'like', "%{$term}%")
                        ->orWhere('code', 'like', "%{$term}%");
                });
            });
        }

        $term = $this->contractTextFilter($request, 'notes_query');
        if ($term !== null) {
            $query->where(function (Builder $builder) use ($term) {
                $builder->where('contracts.notes', 'like', "%{$term}%")
                    ->orWhere('contracts.approval_note', 'like', "%{$term}%");
            });
        }
    }

    private function applyContractNumericRangeFilters(Builder $query, Request $request): void
    {
        $this->applyNumericRangeFilter($query, $request, 'value', $this->contractValueFilterSql());
        $this->applyNumericRangeFilter($query, $request, 'payments_total', $this->contractPaymentsTotalFilterSql());
        $this->applyNumericRangeFilter($query, $request, 'debt_outstanding', $this->contractDebtOutstandingFilterSql());
        $this->applyNumericRangeFilter($query, $request, 'costs_total', $this->contractCostsTotalFilterSql());
        $this->applyNumericRangeFilter($query, $request, 'payments_count', $this->contractPaymentsCountFilterSql());
        $this->applyNumericRangeFilter($query, $request, 'payment_times', 'COALESCE(contracts.payment_times, 1)');
    }

    private function applyNumericRangeFilter(Builder $query, Request $request, string $key, string $expression): void
    {
        $fromKey = $key.'_min';
        $toKey = $key.'_max';

        if ($request->filled($fromKey)) {
            $query->whereRaw('('.$expression.') >= ?', [$this->parseNumericInput($request->input($fromKey))]);
        }

        if ($request->filled($toKey)) {
            $query->whereRaw('('.$expression.') <= ?', [$this->parseNumericInput($request->input($toKey))]);
        }
    }

    private function contractItemsTotalFilterSql(): string
    {
        return 'COALESCE((SELECT SUM(contract_items.total_price) FROM contract_items WHERE contract_items.contract_id = contracts.id), 0)';
    }

    private function contractSubtotalFilterSql(): string
    {
        return '(CASE WHEN contracts.subtotal_value IS NOT NULL THEN COALESCE(contracts.subtotal_value, 0) WHEN EXISTS (SELECT 1 FROM contract_items WHERE contract_items.contract_id = contracts.id) THEN '.$this->contractItemsTotalFilterSql().' ELSE COALESCE(contracts.value, 0) END)';
    }

    private function contractVatAmountFilterSql(): string
    {
        $subtotalSql = $this->contractSubtotalFilterSql();
        $rateSql = '(CASE WHEN COALESCE(contracts.vat_rate, 0) > 0 THEN COALESCE(contracts.vat_rate, 0) ELSE 0 END)';
        $amountSql = '(CASE WHEN COALESCE(contracts.vat_amount, 0) > 0 THEN COALESCE(contracts.vat_amount, 0) ELSE 0 END)';

        return "(CASE WHEN COALESCE(contracts.vat_enabled, 0) = 1 THEN CASE WHEN contracts.vat_mode = 'percent' THEN ({$subtotalSql} * {$rateSql} / 100) ELSE {$amountSql} END ELSE 0 END)";
    }

    private function contractValueFilterSql(): string
    {
        $subtotalSql = $this->contractSubtotalFilterSql();
        $vatSql = $this->contractVatAmountFilterSql();

        return "(CASE WHEN contracts.value IS NOT NULL THEN COALESCE(contracts.value, 0) ELSE ({$subtotalSql} + {$vatSql}) END)";
    }

    private function contractPaymentsTotalFilterSql(): string
    {
        return 'COALESCE((SELECT SUM(contract_payments.amount) FROM contract_payments WHERE contract_payments.contract_id = contracts.id), 0)';
    }

    private function contractCostsTotalFilterSql(): string
    {
        return 'COALESCE((SELECT SUM(contract_costs.amount) FROM contract_costs WHERE contract_costs.contract_id = contracts.id), 0)';
    }

    private function contractPaymentsCountFilterSql(): string
    {
        return '(SELECT COUNT(*) FROM contract_payments WHERE contract_payments.contract_id = contracts.id)';
    }

    private function contractDebtOutstandingFilterSql(): string
    {
        $debtSql = '('.$this->contractValueFilterSql().' - '.$this->contractPaymentsTotalFilterSql().')';

        return "(CASE WHEN {$debtSql} > 0 THEN {$debtSql} ELSE 0 END)";
    }

    /**
     * Tổng doanh thu (giá trị hiệu lực), dòng tiền (đã thu), công nợ, chi phí — toàn bộ dòng thỏa filter, không paginate.
     * Khớp model Contract: effective_value, payments_total, debt_outstanding, costs_total.
     */
    private function contractListAggregates(Builder $filteredQuery): array
    {
        // Cùng bộ filter với paginate(); distinct tránh trùng id nếu query sau này có join.
        $idsSub = $filteredQuery->clone()->distinct()->select('contracts.id');

        $itemsAgg = ContractItem::query()
            ->selectRaw('contract_id, COALESCE(SUM(total_price), 0) as items_sum, COUNT(*) as items_cnt')
            ->groupBy('contract_id');

        $paymentsAgg = ContractPayment::query()
            ->selectRaw('contract_id, COALESCE(SUM(amount), 0) as pay_sum')
            ->groupBy('contract_id');

        $costsAgg = ContractCost::query()
            ->selectRaw('contract_id, COALESCE(SUM(amount), 0) as cost_sum')
            ->groupBy('contract_id');

        $subtotalSql = '(CASE WHEN contracts.subtotal_value IS NOT NULL THEN COALESCE(contracts.subtotal_value, 0) WHEN COALESCE(items_agg.items_cnt, 0) > 0 THEN COALESCE(items_agg.items_sum, 0) ELSE COALESCE(contracts.value, 0) END)';
        $vatRateSql = '(CASE WHEN COALESCE(contracts.vat_rate, 0) > 0 THEN COALESCE(contracts.vat_rate, 0) ELSE 0 END)';
        $vatAmountSql = '(CASE WHEN COALESCE(contracts.vat_amount, 0) > 0 THEN COALESCE(contracts.vat_amount, 0) ELSE 0 END)';
        $vatSql = "(CASE WHEN COALESCE(contracts.vat_enabled, 0) = 1 THEN CASE WHEN contracts.vat_mode = 'percent' THEN ({$subtotalSql} * {$vatRateSql} / 100) ELSE {$vatAmountSql} END ELSE 0 END)";
        $effSql = "(CASE WHEN contracts.value IS NOT NULL THEN COALESCE(contracts.value, 0) ELSE ({$subtotalSql} + {$vatSql}) END)";

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

    private function contractYearComparisonAggregates(Request $request): array
    {
        $today = Carbon::now('Asia/Ho_Chi_Minh')->startOfDay();
        $currentYear = $today->year;
        $previousYear = $today->copy()->subYear()->year;
        $currentFrom = $today->copy()->startOfYear()->toDateString();
        $currentTo = $today->copy()->endOfYear()->toDateString();
        $previousFrom = $today->copy()->subYear()->startOfYear()->toDateString();
        $previousTo = $today->copy()->subYear()->endOfYear()->toDateString();

        $baseWithoutDateFilters = $this->contractIndexFilteredQuery($request, false);

        $current = $this->contractComparisonMetricsForBusinessDateRange(
            $baseWithoutDateFilters->clone(),
            $currentFrom,
            $currentTo
        );
        $previous = $this->contractComparisonMetricsForBusinessDateRange(
            $baseWithoutDateFilters->clone(),
            $previousFrom,
            $previousTo
        );

        return [
            'mode' => 'year',
            'current_label' => 'Năm '.$currentYear,
            'previous_label' => 'Năm '.$previousYear,
            'current_period' => [
                'from' => $currentFrom,
                'to' => $currentTo,
            ],
            'previous_period' => [
                'from' => $previousFrom,
                'to' => $previousTo,
            ],
            'date_basis' => 'approved_at_or_created_at',
            'ignores_date_filters' => true,
            'current' => $current,
            'previous' => $previous,
            'change_percent' => [
                'contracts_count' => $this->comparisonPercent($current['contracts_count'], $previous['contracts_count']),
                'clients_count' => $this->comparisonPercent($current['clients_count'], $previous['clients_count']),
                'sales_total' => $this->comparisonPercent($current['sales_total'], $previous['sales_total']),
                'revenue_total' => $this->comparisonPercent($current['revenue_total'], $previous['revenue_total']),
            ],
        ];
    }

    private function contractComparisonMetricsForBusinessDateRange(
        Builder $baseQuery,
        string $fromDate,
        string $toDate
    ): array {
        $rangeQuery = $baseQuery
            ->clone()
            ->whereRaw('DATE(COALESCE(contracts.approved_at, contracts.created_at)) >= ?', [$fromDate])
            ->whereRaw('DATE(COALESCE(contracts.approved_at, contracts.created_at)) <= ?', [$toDate]);

        $contractsCount = (int) $rangeQuery->clone()->count();
        $clientsCount = (int) $rangeQuery->clone()
            ->whereNotNull('contracts.client_id')
            ->distinct()
            ->count('contracts.client_id');
        $aggregates = $this->contractListAggregates($rangeQuery->clone());

        return [
            'contracts_count' => $contractsCount,
            'clients_count' => $clientsCount,
            'sales_total' => (float) ($aggregates['revenue_total'] ?? 0),
            'revenue_total' => (float) ($aggregates['cashflow_total'] ?? 0),
        ];
    }

    private function comparisonPercent($current, $previous): float
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

    public function show(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canViewContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem hợp đồng.'], 403);
        }

        if (Schema::hasTable('contract_files')) {
            $contract->loadCount('contractFiles');
        } else {
            $contract->setAttribute('contract_files_count', 0);
        }
        $this->loadContractDetail($contract);

        return response()->json(
            $this->appendContractPermissions($contract, $request->user())
        );
    }

    public function contractFiles(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canViewContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem hợp đồng.'], 403);
        }

        if (! Schema::hasTable('contract_files')) {
            return response()->json(['data' => []]);
        }

        $rows = ContractFile::query()
            ->where('contract_id', $contract->id)
            ->with('uploader:id,name,email')
            ->orderByDesc('created_at')
            ->get()
            ->map(function (ContractFile $f) {
                return [
                    'id' => $f->id,
                    'original_name' => $f->original_name,
                    'mime_type' => $f->mime_type,
                    'size' => $f->size,
                    'created_at' => $f->created_at?->toIso8601String(),
                    'uploader' => $f->uploader ? [
                        'id' => $f->uploader->id,
                        'name' => $f->uploader->name,
                        'email' => $f->uploader->email,
                    ] : null,
                ];
            });

        return response()->json(['data' => $rows]);
    }

    public function storeContractFile(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canEditContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền tải file lên.'], 403);
        }

        if (! Schema::hasTable('contract_files')) {
            return response()->json([
                'message' => 'Chưa có bảng contract_files. Chạy php artisan migrate trên server.',
            ], 503);
        }

        $request->validate([
            'file' => ['required', 'file', 'max:51200'],
        ]);

        try {
            $file = app(ContractFileStorageService::class)->store(
                $contract,
                $request->file('file'),
                (int) $request->user()->id
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $file->load('uploader:id,name,email');

        if (Schema::hasTable('contract_activity_logs')) {
            $contract->refresh();
            app(ContractActivityLogService::class)->logIfApproved(
                $contract,
                $request->user(),
                ($request->user()->name ?? 'Người dùng').' đã tải file đính kèm: '.$file->original_name,
                ['type' => 'file_upload', 'file_id' => $file->id],
            );
        }

        return response()->json([
            'message' => 'Đã tải file lên.',
            'data' => [
                'id' => $file->id,
                'original_name' => $file->original_name,
                'mime_type' => $file->mime_type,
                'size' => $file->size,
                'created_at' => $file->created_at?->toIso8601String(),
                'uploader' => $file->uploader ? [
                    'id' => $file->uploader->id,
                    'name' => $file->uploader->name,
                    'email' => $file->uploader->email,
                ] : null,
            ],
        ], 201);
    }

    /**
     * @return \Symfony\Component\HttpFoundation\StreamedResponse
     */
    public function downloadContractFile(Request $request, Contract $contract, ContractFile $contractFile)
    {
        if ((int) $contractFile->contract_id !== (int) $contract->id) {
            abort(404);
        }

        if (! $this->canViewContract($request->user(), $contract)) {
            abort(403, 'Không có quyền xem hợp đồng.');
        }

        $disk = Storage::disk($contractFile->disk);
        if (! $disk->exists($contractFile->path)) {
            abort(404, 'File không còn trên hệ thống.');
        }

        $downloadName = app(ContractFileStorageService::class)->sanitizeOriginalName($contractFile->original_name);

        return $disk->download($contractFile->path, $downloadName, [
            'Content-Type' => $contractFile->mime_type ?: 'application/octet-stream',
        ]);
    }

    public function destroyContractFile(Request $request, Contract $contract, ContractFile $contractFile): JsonResponse
    {
        if ((int) $contractFile->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Không tìm thấy file.'], 404);
        }

        if (! $this->canEditContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xóa file.'], 403);
        }

        $removedName = $contractFile->original_name;
        app(ContractFileStorageService::class)->delete($contractFile);

        if (Schema::hasTable('contract_activity_logs')) {
            $contract->refresh();
            app(ContractActivityLogService::class)->logIfApproved(
                $contract,
                $request->user(),
                ($request->user()->name ?? 'Người dùng').' đã xóa file đính kèm: '.$removedName,
                ['type' => 'file_delete'],
            );
        }

        return response()->json(['message' => 'Đã xóa file.']);
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
            case 'created_at':
                $query->orderBy('contracts.created_at', $direction);
                break;
            case 'approved_at':
                $query->orderByRaw('CASE WHEN contracts.approved_at IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('contracts.approved_at', $direction);
                break;
            case 'start_date':
                $query->orderByRaw('CASE WHEN contracts.start_date IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('contracts.start_date', $direction);
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
                $query->orderByRaw('('.$this->contractValueFilterSql().') '.$rawDirection);
                break;
            case 'payments_total':
                $query->orderBy('payments_total', $direction);
                break;
            case 'debt_outstanding':
                $query->orderByRaw('('.$this->contractDebtOutstandingFilterSql().') '.$rawDirection);
                break;
            case 'costs_total':
                $query->orderBy('costs_total', $direction);
                break;
            case 'payments_count':
                $query->orderBy('payments_count', $direction);
                break;
            case 'status':
                $query->orderByRaw('('.$this->contractStatusSql().') '.$rawDirection);
                break;
            case 'approval_status':
                $query->orderBy('contracts.approval_status', $direction);
                break;
            case 'handover_receive_status':
                $query->orderBy('contracts.handover_receive_status', $direction);
                break;
            default:
                $query->orderByDesc('contracts.created_at');
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

        $validated = $request->validate($rules, $this->contractValidationMessages());
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
        if (CrmScope::isClientInRotationPool($client)) {
            return response()->json(['message' => 'Khách hàng đang ở kho số nên chưa thể tạo hợp đồng.'], 422);
        }
        if (! $this->canMutateContractForClient($request->user(), $client)) {
            return response()->json(['message' => 'Chỉ nhân viên phụ trách khách hàng (hoặc quản lý/admin) mới được tạo hợp đồng cho khách này.'], 403);
        }
        if ($error = $this->validateAssignableCareStaffIds($request->user(), $careStaffIds)) {
            return response()->json(['message' => $error], 422);
        }
        $validated = $this->normalizeOpportunityIdInput($validated);
        if ($msg = $this->validateOpportunityForContract(
            $validated['opportunity_id'] ?? null,
            (int) $validated['client_id'],
            null
        )) {
            return response()->json(['message' => $msg], 422);
        }
        $validated['code'] = $this->generateContractCode();
        $validated['created_by'] = $request->user()->id;
        unset($validated['project_id'], $validated['create_and_approve'], $validated['status']);

        $rawItems = $request->input('items');
        $items = $this->normalizeItems(is_array($rawItems) ? $rawItems : []);
        if (count($items) < 1) {
            return response()->json([
                'message' => 'Hợp đồng phải có ít nhất một dòng sản phẩm hoặc dịch vụ.',
            ], 422);
        }
        $validated = $this->normalizeContractFinancialInputs($validated, $items);

        $validated['collector_user_id'] = $this->resolveCollectorUserId($request, $validated);
        $validated = array_merge($validated, $this->resolveApproval($request));

        $contract = null;

        try {
            DB::transaction(function () use ($request, &$contract, $validated, $careStaffIds, $items, $pendingPayments, $pendingCosts) {
                $contract = Contract::create($validated);
                $this->syncCareStaff($contract, $careStaffIds, $request->user());

                $this->syncItems($contract, $items);

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
        if (! $this->canEditContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền cập nhật hợp đồng.'], 403);
        }
        $wasApproved = ($contract->approval_status ?? '') === 'approved';
        $validated = $request->validate($this->rules($contract->id, true), $this->contractValidationMessages());
        unset($validated['status']);
        $careStaffIds = $this->extractCareStaffIds($validated);
        $client = Client::query()->find((int) $validated['client_id']);
        if (! $client) {
            return response()->json(['message' => 'Khách hàng không tồn tại.'], 422);
        }
        if (CrmScope::isClientInRotationPool($client)) {
            return response()->json(['message' => 'Khách hàng đang ở kho số nên chưa thể cập nhật hợp đồng.'], 422);
        }
        if (! $this->canMutateContractForClient($request->user(), $client, $contract)) {
            return response()->json(['message' => 'Chỉ nhân viên phụ trách khách hàng (hoặc quản lý/admin) mới được cập nhật hợp đồng cho khách này.'], 403);
        }
        if ($error = $this->validateAssignableCareStaffIds($request->user(), $careStaffIds)) {
            return response()->json(['message' => $error], 422);
        }
        $validated = $this->normalizeOpportunityIdInput($validated);
        if ($msg = $this->validateOpportunityForContract(
            $validated['opportunity_id'] ?? null,
            (int) $validated['client_id'],
            (int) $contract->id
        )) {
            return response()->json(['message' => $msg], 422);
        }
        $rawItems = $request->input('items');
        $itemsPayload = is_array($rawItems) ? $rawItems : [];
        $items = $this->normalizeItems($itemsPayload);
        $itemsKeyPresent = array_key_exists('items', $request->all());
        if ($itemsKeyPresent) {
            if (count($items) < 1) {
                return response()->json([
                    'message' => 'Hợp đồng phải có ít nhất một dòng sản phẩm hoặc dịch vụ.',
                ], 422);
            }
        } elseif (! $contract->items()->exists()) {
            return response()->json([
                'message' => 'Hợp đồng phải có ít nhất một dòng sản phẩm hoặc dịch vụ.',
            ], 422);
        }
        $validated = $this->normalizeContractFinancialInputs($validated, $items, $contract);

        $validated['collector_user_id'] = $this->resolveCollectorUserId($request, $validated, $contract);

        unset($validated['approval_status'], $validated['approved_by'], $validated['approved_at']);

        $beforeState = null;
        $careIdsBefore = [];
        if ($wasApproved) {
            $beforeState = Contract::query()->with(['careStaffUsers'])->findOrFail($contract->id);
            $careIdsBefore = $beforeState->careStaffUsers->pluck('id')->sort()->values()->all();
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

        if ($wasApproved && $beforeState && Schema::hasTable('contract_activity_logs')) {
            $contract->load('careStaffUsers');
            $careIdsAfter = $contract->careStaffUsers->pluck('id')->sort()->values()->all();
            $careChanged = $careIdsBefore !== $careIdsAfter;
            app(ContractActivityLogService::class)->logContractFormChanges(
                $request->user(),
                $beforeState,
                $contract->fresh(),
                ! empty($items),
                $careChanged
            );
        }

        $this->loadContractDetail($contract);

        return response()->json($this->appendContractPermissions($contract, $request->user()));
    }

    /**
     * Đồng bộ ngày cho các hợp đồng đã chọn: chỉ xử lý bản ghi **chưa có ngày bắt đầu hiệu lực** (start_date null).
     *
     * - Có ngày ký: gán start_date = ngày ký.
     * - Không có ngày ký: gán signed_at và start_date = ngày tạo hợp đồng (theo múi Asia/Ho_Chi_Minh).
     * - Nếu ngày kết thúc hiện có ≤ ngày bắt đầu mới: đẩy end_date sang ngày sau ngày bắt đầu (để thỏa end > start).
     */
    public function syncDates(Request $request): JsonResponse
    {
        $dateFieldKeys = array_keys($this->contractDateFieldMap());
        $validated = $request->validate([
            'contract_ids' => ['required', 'array', 'min:1', 'max:5000'],
            'contract_ids.*' => ['integer', 'exists:contracts,id'],
            'target_date_field' => ['required', 'string', 'in:'.implode(',', $dateFieldKeys)],
            'reference_date_field' => ['required', 'string', 'in:'.implode(',', $dateFieldKeys)],
        ], [
            'contract_ids.max' => 'Mỗi lần đồng bộ tối đa 5000 hợp đồng.',
            'target_date_field.required' => 'Vui lòng chọn trường ngày cần cập nhật.',
            'target_date_field.in' => 'Trường ngày cần cập nhật không hợp lệ.',
            'reference_date_field.required' => 'Vui lòng chọn ngày tham chiếu.',
            'reference_date_field.in' => 'Ngày tham chiếu không hợp lệ.',
        ]);

        $ids = array_values(array_unique(array_map('intval', $validated['contract_ids'])));
        $tz = 'Asia/Ho_Chi_Minh';
        $user = $request->user();
        $targetField = (string) $validated['target_date_field'];
        $referenceField = (string) $validated['reference_date_field'];

        if ($targetField === $referenceField) {
            return response()->json([
                'message' => 'Trường ngày cần cập nhật phải khác ngày tham chiếu.',
            ], 422);
        }

        if ($targetField === 'approved_at' && ! $this->canApprove($user)) {
            return response()->json([
                'message' => 'Chỉ admin, administrator hoặc kế toán mới được đồng bộ ngày duyệt.',
            ], 403);
        }

        if ($targetField === 'created_at' && ! in_array((string) $user->role, ['admin', 'administrator'], true)) {
            return response()->json([
                'message' => 'Chỉ admin hoặc administrator mới được chỉnh ngày tạo hệ thống.',
            ], 403);
        }

        $updated = [];
        $skipped = [];
        $failed = [];

        foreach ($ids as $id) {
            $contract = Contract::query()->find($id);
            if (! $contract) {
                $failed[] = ['id' => $id, 'message' => 'Không tìm thấy hợp đồng.'];

                continue;
            }

            if (! $this->canEditContract($user, $contract)) {
                $failed[] = ['id' => $id, 'message' => 'Không có quyền cập nhật hợp đồng.'];

                continue;
            }

            $contract->loadMissing('client');
            if (! $contract->client) {
                $failed[] = ['id' => $id, 'message' => 'Hợp đồng thiếu khách hàng.'];

                continue;
            }

            if (! $this->canMutateContractForClient($user, $contract->client, $contract)) {
                $failed[] = ['id' => $id, 'message' => 'Không có quyền theo phạm vi khách hàng.'];

                continue;
            }

            $sourceValue = $this->resolveContractDateFieldValue($contract, $referenceField, $tz);
            if (! $sourceValue) {
                $skipped[] = [
                    'id' => $id,
                    'code' => $contract->code,
                    'reason' => 'missing_reference_date',
                    'message' => sprintf(
                        'Hợp đồng chưa có %s để làm mốc.',
                        mb_strtolower($this->contractDateFieldLabel($referenceField))
                    ),
                ];

                continue;
            }

            $normalizedTargetValue = $this->normalizeContractDateForField($sourceValue, $targetField, $tz);
            $currentTargetValue = $this->resolveContractDateFieldValue($contract, $targetField, $tz);
            if ($currentTargetValue && $this->contractDateValuesEqual($currentTargetValue, $normalizedTargetValue, $targetField)) {
                $skipped[] = [
                    'id' => $id,
                    'code' => $contract->code,
                    'reason' => 'already_synced',
                    'message' => sprintf(
                        '%s đã trùng với %s.',
                        $this->contractDateFieldLabel($targetField),
                        mb_strtolower($this->contractDateFieldLabel($referenceField))
                    ),
                ];

                continue;
            }

            $consistencyError = $this->validateContractDateSyncConsistency($contract, $targetField, $normalizedTargetValue, $tz);
            if ($consistencyError !== null) {
                $skipped[] = [
                    'id' => $id,
                    'code' => $contract->code,
                    'reason' => 'invalid_date_order',
                    'message' => $consistencyError,
                ];

                continue;
            }

            try {
                DB::transaction(function () use ($contract, $targetField, $normalizedTargetValue, $tz) {
                    $this->persistContractSyncedDate($contract, $targetField, $normalizedTargetValue, $tz);
                    $contract->refreshFinancials();
                });
                $contract->refresh();
                if ($contract->client) {
                    $this->syncClientRevenue($contract->client);
                }
                $updated[] = [
                    'id' => $id,
                    'code' => $contract->code,
                    'target_field' => $targetField,
                    'reference_field' => $referenceField,
                    'value' => $this->serializeContractDateForResponse($normalizedTargetValue, $targetField),
                ];
            } catch (\Throwable $e) {
                report($e);
                $failed[] = ['id' => $id, 'message' => 'Lỗi khi lưu: '.($e->getMessage() ?: 'Không xác định.')];
            }
        }

        $parts = [];
        if (count($updated) > 0) {
            $parts[] = sprintf(
                'Đã đồng bộ %d hợp đồng (%s theo %s).',
                count($updated),
                mb_strtolower($this->contractDateFieldLabel($targetField)),
                mb_strtolower($this->contractDateFieldLabel($referenceField))
            );
        }
        if (count($skipped) > 0) {
            $parts[] = 'Bỏ qua '.count($skipped).' hợp đồng do thiếu mốc ngày hoặc vướng thứ tự ngày.';
        }
        if (count($failed) > 0) {
            $parts[] = count($failed).' hợp đồng không xử lý được.';
        }

        return response()->json([
            'message' => count($parts) > 0 ? implode(' ', $parts) : 'Không có thay đổi.',
            'target_field' => $targetField,
            'reference_field' => $referenceField,
            'updated' => $updated,
            'skipped' => $skipped,
            'failed' => $failed,
        ]);
    }

    private function buildSelectedContractsSpreadsheet($contracts): Spreadsheet
    {
        $spreadsheet = new Spreadsheet();

        $this->writeContractsExportSheet($spreadsheet->getActiveSheet(), $contracts);
        $this->writeContractItemsExportSheet($spreadsheet->createSheet(), $contracts);
        $this->writeContractPaymentsExportSheet($spreadsheet->createSheet(), $contracts);
        $this->writeContractCostsExportSheet($spreadsheet->createSheet(), $contracts);
        $this->writeContractFinanceRequestsExportSheet($spreadsheet->createSheet(), $contracts);
        $this->writeContractCareStaffExportSheet($spreadsheet->createSheet(), $contracts);
        $this->writeContractCareNotesExportSheet($spreadsheet->createSheet(), $contracts);
        $this->writeContractFilesExportSheet($spreadsheet->createSheet(), $contracts);

        $spreadsheet->setActiveSheetIndex(0);

        return $spreadsheet;
    }

    private function writeContractsExportSheet(Worksheet $sheet, $contracts): void
    {
        $sheet->setTitle('Hop dong');
        $headers = [
            'STT',
            'ID hợp đồng',
            'Mã hợp đồng',
            'Tên hợp đồng',
            'Loại hợp đồng',
            'Lịch chăm sóc',
            'Thời hạn (tháng)',
            'Chu kỳ thanh toán',
            'Số kỳ đã thu khi import',
            'ID khách hàng',
            'Mã khách hàng',
            'Tên khách hàng',
            'Công ty',
            'Email khách hàng',
            'SĐT khách hàng',
            'Nguồn khách',
            'Kênh khách',
            'Trạng thái khách',
            'Cấp độ khách',
            'Loại khách',
            'Nhân viên phụ trách khách',
            'Sales owner khách',
            'Nhóm chăm sóc khách',
            'ID cơ hội',
            'Tên cơ hội',
            'Trạng thái cơ hội',
            'Giá trị cơ hội',
            'Phụ trách cơ hội',
            'ID dự án',
            'Mã dự án',
            'Tên dự án',
            'Website dự án',
            'Trạng thái dự án',
            'Giá trị hợp đồng',
            'Giá trị trước VAT',
            'Có VAT',
            'Kiểu VAT',
            'Tỷ lệ VAT (%)',
            'Tiền VAT',
            'Tổng dòng sản phẩm',
            'Số lần thanh toán',
            'Số lần đã thu',
            'Đã thu',
            'Công nợ',
            'Chi phí',
            'Doanh thu ròng',
            'Doanh thu lưu trong hợp đồng',
            'Công nợ lưu trong hợp đồng',
            'Dòng tiền lưu trong hợp đồng',
            'Trạng thái vòng đời',
            'Trạng thái vòng đời (mã)',
            'Trạng thái duyệt',
            'Trạng thái duyệt (mã)',
            'Người duyệt',
            'Email người duyệt',
            'Ngày duyệt',
            'Ghi chú duyệt',
            'Trạng thái nhận bàn giao',
            'Trạng thái nhận bàn giao (mã)',
            'Người nhận bàn giao',
            'Ngày nhận bàn giao',
            'Ngày ký',
            'Ngày bắt đầu hiệu lực',
            'Ngày kết thúc',
            'Ghi chú hợp đồng',
            'Người tạo',
            'Email người tạo',
            'Nhân viên thu',
            'Email nhân viên thu',
            'Nhân viên chăm sóc hợp đồng',
            'Số dòng sản phẩm',
            'Số file đính kèm',
            'Ngày tạo',
            'Ngày cập nhật',
        ];
        $this->writeExportHeader($sheet, $headers);

        $row = 2;
        $stt = 1;
        foreach ($contracts as $contract) {
            $client = $contract->client;
            $opportunity = $contract->opportunity;
            $project = $this->exportLinkedProject($contract);
            $status = (string) ($contract->status ?? '');
            $filesCount = $contract->relationLoaded('contractFiles') ? $contract->contractFiles->count() : 0;

            $this->writeExportRow($sheet, $row++, [
                $stt++,
                (int) $contract->id,
                (string) ($contract->code ?? ''),
                (string) ($contract->title ?? ''),
                (string) ($contract->contract_type ?? ''),
                (string) ($contract->care_schedule ?? ''),
                $contract->duration_months !== null ? (int) $contract->duration_months : '',
                (string) ($contract->payment_cycle ?? ''),
                $contract->imported_paid_periods !== null ? (int) $contract->imported_paid_periods : '',
                $client ? (int) $client->id : '',
                (string) ($client->external_code ?? ''),
                (string) ($client->name ?? ''),
                (string) ($client->company ?? ''),
                (string) ($client->email ?? ''),
                (string) ($client->phone ?? ''),
                (string) ($client->lead_source ?? ''),
                (string) ($client->lead_channel ?? ''),
                (string) ($client->customer_status_label ?? ''),
                (string) ($client->customer_level ?? ''),
                (string) optional($client?->leadType)->name,
                $this->exportUserLabel($client?->assignedStaff),
                $this->exportUserLabel($client?->salesOwner),
                $this->exportUsersList($client?->careStaffUsers ?? collect()),
                $opportunity ? (int) $opportunity->id : '',
                (string) ($opportunity->title ?? ''),
                $this->exportOpportunityStatusLabel($opportunity),
                $opportunity ? (float) ($opportunity->amount ?? 0) : '',
                $this->exportUserLabel($opportunity?->assignee),
                $project ? (int) $project->id : '',
                (string) ($project->code ?? ''),
                (string) ($project->name ?? ''),
                (string) ($project->website_url ?? ''),
                (string) ($project->status ?? ''),
                (float) ($contract->effective_value ?? 0),
                (float) ($contract->subtotal_value ?? 0),
                $this->exportYesNo((bool) ($contract->vat_enabled ?? false)),
                (string) ($contract->vat_mode ?? ''),
                $contract->vat_rate !== null ? (float) $contract->vat_rate : '',
                (float) ($contract->resolved_vat_amount ?? $contract->vat_amount ?? 0),
                (float) ($contract->items_total_value ?? 0),
                (int) ($contract->payment_times ?? 1),
                (int) ($contract->payments_count ?? 0),
                (float) ($contract->payments_total ?? 0),
                (float) ($contract->debt_outstanding ?? 0),
                (float) ($contract->costs_total ?? 0),
                (float) ($contract->net_revenue ?? 0),
                (float) ($contract->revenue ?? 0),
                (float) ($contract->debt ?? 0),
                (float) ($contract->cash_flow ?? 0),
                $this->exportContractStatusLabel($status),
                $status,
                $this->exportApprovalStatusLabel((string) ($contract->approval_status ?? 'pending')),
                (string) ($contract->approval_status ?? ''),
                $this->exportUserLabel($contract->approver),
                (string) optional($contract->approver)->email,
                $this->exportDateTime($contract->approved_at),
                (string) ($contract->approval_note ?? ''),
                $this->exportHandoverReceiveLabel((string) ($contract->handover_receive_status ?? '')),
                (string) ($contract->handover_receive_status ?? ''),
                $this->exportUserLabel($contract->handoverReceiver),
                $this->exportDateTime($contract->handover_received_at),
                $this->exportDate($contract->signed_at),
                $this->exportDate($contract->start_date),
                $this->exportDate($contract->end_date),
                (string) ($contract->notes ?? ''),
                $this->exportUserLabel($contract->creator),
                (string) optional($contract->creator)->email,
                $this->exportUserLabel($contract->collector),
                (string) optional($contract->collector)->email,
                $this->exportUsersList($contract->careStaffUsers ?? collect()),
                (int) ($contract->items_count ?? ($contract->relationLoaded('items') ? $contract->items->count() : 0)),
                $filesCount,
                $this->exportDateTime($contract->created_at),
                $this->exportDateTime($contract->updated_at),
            ]);
        }

        $this->finishExportSheet($sheet, count($headers), $row - 1);
    }

    private function writeContractItemsExportSheet(Worksheet $sheet, $contracts): void
    {
        $sheet->setTitle('Dong san pham');
        $headers = [
            'STT',
            'ID hợp đồng',
            'Mã hợp đồng',
            'Tên hợp đồng',
            'ID dòng',
            'ID sản phẩm',
            'Mã sản phẩm',
            'Tên sản phẩm',
            'Đơn vị',
            'Đơn giá',
            'Số lượng',
            'Chiết khấu',
            'VAT dòng',
            'Thành tiền',
            'Ghi chú',
            'Ngày tạo',
            'Ngày cập nhật',
        ];
        $this->writeExportHeader($sheet, $headers);

        $row = 2;
        $stt = 1;
        foreach ($contracts as $contract) {
            foreach ($contract->items ?? [] as $item) {
                $this->writeExportRow($sheet, $row++, [
                    $stt++,
                    (int) $contract->id,
                    (string) ($contract->code ?? ''),
                    (string) ($contract->title ?? ''),
                    (int) $item->id,
                    $item->product_id ? (int) $item->product_id : '',
                    (string) ($item->product_code ?: optional($item->product)->code),
                    (string) ($item->product_name ?? optional($item->product)->name ?? ''),
                    (string) ($item->unit ?? ''),
                    (float) ($item->unit_price ?? 0),
                    (int) ($item->quantity ?? 0),
                    (float) ($item->discount_amount ?? 0),
                    (float) ($item->vat_amount ?? 0),
                    (float) ($item->total_price ?? 0),
                    (string) ($item->note ?? ''),
                    $this->exportDateTime($item->created_at),
                    $this->exportDateTime($item->updated_at),
                ]);
            }
        }

        $this->finishExportSheet($sheet, count($headers), $row - 1);
    }

    private function writeContractPaymentsExportSheet(Worksheet $sheet, $contracts): void
    {
        $sheet->setTitle('Thanh toan');
        $headers = [
            'STT',
            'ID hợp đồng',
            'Mã hợp đồng',
            'Tên hợp đồng',
            'ID thanh toán',
            'Số tiền',
            'Ngày thanh toán',
            'Phương thức',
            'Ghi chú',
            'Người tạo',
            'Email người tạo',
            'Ngày tạo',
            'Ngày cập nhật',
        ];
        $this->writeExportHeader($sheet, $headers);

        $row = 2;
        $stt = 1;
        foreach ($contracts as $contract) {
            foreach ($contract->payments ?? [] as $payment) {
                $this->writeExportRow($sheet, $row++, [
                    $stt++,
                    (int) $contract->id,
                    (string) ($contract->code ?? ''),
                    (string) ($contract->title ?? ''),
                    (int) $payment->id,
                    (float) ($payment->amount ?? 0),
                    $this->exportDate($payment->paid_at),
                    (string) ($payment->method ?? ''),
                    (string) ($payment->note ?? ''),
                    $this->exportUserLabel($payment->creator),
                    (string) optional($payment->creator)->email,
                    $this->exportDateTime($payment->created_at),
                    $this->exportDateTime($payment->updated_at),
                ]);
            }
        }

        $this->finishExportSheet($sheet, count($headers), $row - 1);
    }

    private function writeContractCostsExportSheet(Worksheet $sheet, $contracts): void
    {
        $sheet->setTitle('Chi phi');
        $headers = [
            'STT',
            'ID hợp đồng',
            'Mã hợp đồng',
            'Tên hợp đồng',
            'ID chi phí',
            'Loại chi phí',
            'Số tiền',
            'Ngày chi phí',
            'Ghi chú',
            'Người tạo',
            'Email người tạo',
            'Ngày tạo',
            'Ngày cập nhật',
        ];
        $this->writeExportHeader($sheet, $headers);

        $row = 2;
        $stt = 1;
        foreach ($contracts as $contract) {
            foreach ($contract->costs ?? [] as $cost) {
                $this->writeExportRow($sheet, $row++, [
                    $stt++,
                    (int) $contract->id,
                    (string) ($contract->code ?? ''),
                    (string) ($contract->title ?? ''),
                    (int) $cost->id,
                    (string) ($cost->cost_type ?? ''),
                    (float) ($cost->amount ?? 0),
                    $this->exportDate($cost->cost_date),
                    (string) ($cost->note ?? ''),
                    $this->exportUserLabel($cost->creator),
                    (string) optional($cost->creator)->email,
                    $this->exportDateTime($cost->created_at),
                    $this->exportDateTime($cost->updated_at),
                ]);
            }
        }

        $this->finishExportSheet($sheet, count($headers), $row - 1);
    }

    private function writeContractFinanceRequestsExportSheet(Worksheet $sheet, $contracts): void
    {
        $sheet->setTitle('Phieu tai chinh');
        $headers = [
            'STT',
            'ID hợp đồng',
            'Mã hợp đồng',
            'Tên hợp đồng',
            'ID phiếu',
            'Loại phiếu',
            'Hành động',
            'Số tiền',
            'Ngày giao dịch',
            'Phương thức',
            'Loại chi phí',
            'Ghi chú',
            'Trạng thái',
            'Người gửi',
            'Người duyệt',
            'Ngày duyệt',
            'Ghi chú duyệt',
            'ID thanh toán liên quan',
            'ID chi phí liên quan',
            'Ngày tạo',
            'Ngày cập nhật',
        ];
        $this->writeExportHeader($sheet, $headers);

        $row = 2;
        $stt = 1;
        foreach ($contracts as $contract) {
            foreach ($contract->financeRequests ?? [] as $financeRequest) {
                $this->writeExportRow($sheet, $row++, [
                    $stt++,
                    (int) $contract->id,
                    (string) ($contract->code ?? ''),
                    (string) ($contract->title ?? ''),
                    (int) $financeRequest->id,
                    (string) ($financeRequest->request_type ?? ''),
                    (string) ($financeRequest->request_action ?? ''),
                    (float) ($financeRequest->amount ?? 0),
                    $this->exportDate($financeRequest->transaction_date),
                    (string) ($financeRequest->method ?? ''),
                    (string) ($financeRequest->cost_type ?? ''),
                    (string) ($financeRequest->note ?? ''),
                    (string) ($financeRequest->status ?? ''),
                    $this->exportUserLabel($financeRequest->submitter),
                    $this->exportUserLabel($financeRequest->reviewer),
                    $this->exportDateTime($financeRequest->reviewed_at),
                    (string) ($financeRequest->review_note ?? ''),
                    $financeRequest->contract_payment_id ? (int) $financeRequest->contract_payment_id : '',
                    $financeRequest->contract_cost_id ? (int) $financeRequest->contract_cost_id : '',
                    $this->exportDateTime($financeRequest->created_at),
                    $this->exportDateTime($financeRequest->updated_at),
                ]);
            }
        }

        $this->finishExportSheet($sheet, count($headers), $row - 1);
    }

    private function writeContractCareStaffExportSheet(Worksheet $sheet, $contracts): void
    {
        $sheet->setTitle('Nhan su cham soc');
        $headers = [
            'STT',
            'ID hợp đồng',
            'Mã hợp đồng',
            'Tên hợp đồng',
            'ID nhân sự',
            'Tên nhân sự',
            'Email nhân sự',
            'ID phòng ban',
            'ID người gán',
            'Ngày gán',
            'Ngày cập nhật',
        ];
        $this->writeExportHeader($sheet, $headers);

        $row = 2;
        $stt = 1;
        foreach ($contracts as $contract) {
            foreach ($contract->careStaffUsers ?? [] as $staff) {
                $this->writeExportRow($sheet, $row++, [
                    $stt++,
                    (int) $contract->id,
                    (string) ($contract->code ?? ''),
                    (string) ($contract->title ?? ''),
                    (int) $staff->id,
                    (string) ($staff->name ?? ''),
                    (string) ($staff->email ?? ''),
                    $staff->department_id ? (int) $staff->department_id : '',
                    $staff->pivot?->assigned_by ? (int) $staff->pivot->assigned_by : '',
                    $this->exportDateTime($staff->pivot?->created_at),
                    $this->exportDateTime($staff->pivot?->updated_at),
                ]);
            }
        }

        $this->finishExportSheet($sheet, count($headers), $row - 1);
    }

    private function writeContractCareNotesExportSheet(Worksheet $sheet, $contracts): void
    {
        $sheet->setTitle('Ghi chu cham soc');
        $headers = [
            'STT',
            'ID hợp đồng',
            'Mã hợp đồng',
            'Tên hợp đồng',
            'ID ghi chú',
            'Tiêu đề',
            'Nội dung',
            'Người ghi chú',
            'Email người ghi chú',
            'Ngày tạo',
            'Ngày cập nhật',
        ];
        $this->writeExportHeader($sheet, $headers);

        $row = 2;
        $stt = 1;
        foreach ($contracts as $contract) {
            foreach ($contract->careNotes ?? [] as $note) {
                $this->writeExportRow($sheet, $row++, [
                    $stt++,
                    (int) $contract->id,
                    (string) ($contract->code ?? ''),
                    (string) ($contract->title ?? ''),
                    (int) $note->id,
                    (string) ($note->title ?? ''),
                    (string) ($note->detail ?? ''),
                    $this->exportUserLabel($note->user),
                    (string) optional($note->user)->email,
                    $this->exportDateTime($note->created_at),
                    $this->exportDateTime($note->updated_at),
                ]);
            }
        }

        $this->finishExportSheet($sheet, count($headers), $row - 1);
    }

    private function writeContractFilesExportSheet(Worksheet $sheet, $contracts): void
    {
        $sheet->setTitle('File dinh kem');
        $headers = [
            'STT',
            'ID hợp đồng',
            'Mã hợp đồng',
            'Tên hợp đồng',
            'ID file',
            'Tên file gốc',
            'Tên file lưu',
            'Loại file',
            'Dung lượng byte',
            'Người tải lên',
            'Email người tải lên',
            'Ngày tải lên',
        ];
        $this->writeExportHeader($sheet, $headers);

        $row = 2;
        $stt = 1;
        foreach ($contracts as $contract) {
            if (! $contract->relationLoaded('contractFiles')) {
                continue;
            }
            foreach ($contract->contractFiles ?? [] as $file) {
                $this->writeExportRow($sheet, $row++, [
                    $stt++,
                    (int) $contract->id,
                    (string) ($contract->code ?? ''),
                    (string) ($contract->title ?? ''),
                    (int) $file->id,
                    (string) ($file->original_name ?? ''),
                    (string) ($file->stored_name ?? ''),
                    (string) ($file->mime_type ?? ''),
                    (int) ($file->size ?? 0),
                    $this->exportUserLabel($file->uploader),
                    (string) optional($file->uploader)->email,
                    $this->exportDateTime($file->created_at),
                ]);
            }
        }

        $this->finishExportSheet($sheet, count($headers), $row - 1);
    }

    private function writeExportHeader(Worksheet $sheet, array $headers): void
    {
        foreach ($headers as $index => $header) {
            $sheet->setCellValueByColumnAndRow($index + 1, 1, $header);
        }
    }

    private function writeExportRow(Worksheet $sheet, int $row, array $values): void
    {
        foreach ($values as $index => $value) {
            $this->setExportCellValue($sheet, $index + 1, $row, $value);
        }
    }

    private function setExportCellValue(Worksheet $sheet, int $column, int $row, $value): void
    {
        $cell = Coordinate::stringFromColumnIndex($column).$row;

        if (is_int($value) || is_float($value)) {
            $sheet->setCellValue($cell, $value);

            return;
        }

        $sheet->setCellValueExplicit($cell, $value === null ? '' : (string) $value, DataType::TYPE_STRING);
    }

    private function finishExportSheet(Worksheet $sheet, int $columnCount, int $lastRow): void
    {
        $lastRow = max(1, $lastRow);
        $lastCol = Coordinate::stringFromColumnIndex($columnCount);
        $range = 'A1:'.$lastCol.$lastRow;

        $sheet->getStyle('A1:'.$lastCol.'1')->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle('A1:'.$lastCol.'1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('0F766E');
        $sheet->getStyle('A1:'.$lastCol.'1')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $sheet->getStyle('A1:'.$lastCol.'1')->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->getStyle($range)->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);
        $sheet->getStyle($range)->getAlignment()->setVertical(Alignment::VERTICAL_TOP);
        $sheet->getStyle($range)->getAlignment()->setWrapText(true);
        $sheet->setAutoFilter('A1:'.$lastCol.'1');
        $sheet->freezePane('A2');

        for ($column = 1; $column <= $columnCount; $column++) {
            $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($column))->setAutoSize(true);
        }
    }

    private function exportLinkedProject(Contract $contract): ?Project
    {
        if ($contract->project) {
            return $contract->project;
        }

        return $contract->linkedProject;
    }

    private function exportUserLabel($user): string
    {
        if (! $user) {
            return '';
        }

        $name = trim((string) ($user->name ?? ''));
        $email = trim((string) ($user->email ?? ''));

        if ($name !== '' && $email !== '') {
            return $name.' <'.$email.'>';
        }

        return $name !== '' ? $name : $email;
    }

    private function exportUsersList($users): string
    {
        return collect($users ?? [])
            ->map(fn ($user) => $this->exportUserLabel($user))
            ->filter(fn ($value) => $value !== '')
            ->values()
            ->implode('; ');
    }

    private function exportDate($value): string
    {
        if (! $value) {
            return '';
        }

        return Carbon::parse($value)->timezone('Asia/Ho_Chi_Minh')->format('Y-m-d');
    }

    private function exportDateTime($value): string
    {
        if (! $value) {
            return '';
        }

        return Carbon::parse($value)->timezone('Asia/Ho_Chi_Minh')->format('Y-m-d H:i:s');
    }

    private function exportYesNo(bool $value): string
    {
        return $value ? 'Có' : 'Không';
    }

    private function exportContractStatusLabel(string $status): string
    {
        return [
            'draft' => 'Nháp',
            'signed' => 'Đã ký',
            'success' => 'Thành công',
            'active' => 'Đang hiệu lực',
            'expired' => 'Hết hạn',
            'cancelled' => 'Hủy',
        ][$status] ?? $status;
    }

    private function exportApprovalStatusLabel(string $status): string
    {
        return [
            'pending' => 'Chờ duyệt',
            'approved' => 'Đã duyệt',
            'rejected' => 'Từ chối',
        ][$status] ?? $status;
    }

    private function exportHandoverReceiveLabel(string $status): string
    {
        return [
            'chua_nhan_ban_giao' => 'Chưa nhận bàn giao',
            'da_nhan_ban_giao' => 'Đã nhận bàn giao',
        ][$status] ?? $status;
    }

    private function exportOpportunityStatusLabel(?Opportunity $opportunity): string
    {
        if (! $opportunity) {
            return '';
        }

        $payload = $opportunity->computedStatusPayload();

        return (string) ($payload['label'] ?? $opportunity->status ?? '');
    }

    private function contractDateFieldMap(): array
    {
        return [
            'created_at' => ['column' => 'contracts.created_at', 'type' => 'datetime', 'label' => 'Ngày tạo'],
            'signed_at' => ['column' => 'contracts.signed_at', 'type' => 'date', 'label' => 'Ngày ký'],
            'approved_at' => ['column' => 'contracts.approved_at', 'type' => 'datetime', 'label' => 'Ngày duyệt'],
            'start_date' => ['column' => 'contracts.start_date', 'type' => 'date', 'label' => 'Ngày bắt đầu hiệu lực'],
            'end_date' => ['column' => 'contracts.end_date', 'type' => 'date', 'label' => 'Ngày kết thúc'],
        ];
    }

    private function contractDateFieldLabel(string $field): string
    {
        return $this->contractDateFieldMap()[$field]['label'] ?? $field;
    }

    private function resolveContractDateFieldValue(Contract $contract, string $field, string $tz): ?Carbon
    {
        $value = match ($field) {
            'created_at' => $contract->created_at,
            'signed_at' => $contract->signed_at,
            'approved_at' => $contract->approved_at,
            'start_date' => $contract->start_date,
            'end_date' => $contract->end_date,
            default => null,
        };

        if (! $value) {
            return null;
        }

        $date = $value instanceof Carbon ? $value->copy() : Carbon::parse((string) $value, $tz);

        return $this->normalizeContractDateForField($date, $field, $tz);
    }

    private function normalizeContractDateForField(Carbon $value, string $field, string $tz): Carbon
    {
        $config = $this->contractDateFieldMap()[$field] ?? ['type' => 'date'];
        $normalized = $value->copy()->timezone($tz);

        return $config['type'] === 'date'
            ? $normalized->startOfDay()
            : $normalized;
    }

    private function contractDateValuesEqual(Carbon $left, Carbon $right, string $field): bool
    {
        $config = $this->contractDateFieldMap()[$field] ?? ['type' => 'date'];
        $format = $config['type'] === 'date' ? 'Y-m-d' : 'Y-m-d H:i:s';

        return $left->format($format) === $right->format($format);
    }

    private function validateContractDateSyncConsistency(
        Contract $contract,
        string $targetField,
        Carbon $targetValue,
        string $tz
    ): ?string {
        if ($targetField === 'approved_at' && (string) ($contract->approval_status ?? '') !== 'approved') {
            return 'Chỉ đồng bộ ngày duyệt cho hợp đồng đã duyệt.';
        }

        $signedAt = $this->resolveContractDateFieldValue($contract, 'signed_at', $tz);
        $startDate = $this->resolveContractDateFieldValue($contract, 'start_date', $tz);
        $endDate = $this->resolveContractDateFieldValue($contract, 'end_date', $tz);

        if ($targetField === 'signed_at') {
            $signedAt = $targetValue->copy();
        } elseif ($targetField === 'start_date') {
            $startDate = $targetValue->copy();
        } elseif ($targetField === 'end_date') {
            $endDate = $targetValue->copy();
        }

        if ($signedAt && $startDate && $startDate->lt($signedAt)) {
            return 'Ngày bắt đầu hiệu lực phải cùng ngày hoặc sau ngày ký.';
        }

        if ($startDate && $endDate && ! $endDate->gt($startDate)) {
            return 'Ngày kết thúc phải sau ngày bắt đầu hiệu lực.';
        }

        return null;
    }

    private function persistContractSyncedDate(
        Contract $contract,
        string $targetField,
        Carbon $targetValue,
        string $tz
    ): void {
        $normalized = $this->normalizeContractDateForField($targetValue, $targetField, $tz);
        $serialized = $this->serializeContractDateForDatabase($normalized, $targetField);

        if ($targetField === 'created_at') {
            $contract->timestamps = false;
            $contract->forceFill(['created_at' => $serialized])->save();
            $contract->timestamps = true;

            return;
        }

        $contract->update([
            $targetField => $serialized,
        ]);
    }

    private function serializeContractDateForDatabase(Carbon $value, string $field): string
    {
        $config = $this->contractDateFieldMap()[$field] ?? ['type' => 'date'];

        return $config['type'] === 'date'
            ? $value->format('Y-m-d')
            : $value->format('Y-m-d H:i:s');
    }

    private function serializeContractDateForResponse(Carbon $value, string $field): string
    {
        return $this->serializeContractDateForDatabase($value, $field);
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
        if (! $this->canApprove($request->user())) {
            return response()->json(['message' => 'Không có quyền từ chối duyệt hợp đồng.'], 403);
        }

        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $reason = trim((string) ($validated['note'] ?? ''));
        $prev = trim((string) ($contract->notes ?? ''));
        $stamp = '[Từ chối duyệt hợp đồng]';
        $line = $reason !== '' ? "{$stamp}: {$reason}" : $stamp;
        $contract->update([
            'approval_status' => 'rejected',
            'approved_by' => null,
            'approved_at' => null,
            'approval_note' => $reason !== '' ? $reason : ($contract->approval_note ?? null),
            'notes' => $prev !== '' ? "{$prev}\n\n{$line}" : $line,
        ]);

        $contract->refresh();
        $contract->refreshFinancials();
        if ($contract->client) {
            $this->syncClientRevenue($contract->client);
        }

        $this->loadContractDetail($contract);

        return response()->json($this->appendContractPermissions($contract, $request->user()));
    }

    public function destroy(Request $request, Contract $contract): JsonResponse
    {
        $user = $request->user();
        if (! $this->canDeleteContract($user, $contract)) {
            return response()->json(['message' => 'Không có quyền xóa hợp đồng.'], 403);
        }

        $contract->loadMissing('client');
        $client = $contract->client;

        $contract->delete();

        if ($client) {
            $this->syncClientRevenue($client);
        }

        return response()->json(['message' => 'Đã xóa hợp đồng.']);
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

        if (Schema::hasTable('contract_activity_logs')) {
            $contract->refresh();
            app(ContractActivityLogService::class)->logIfApproved(
                $contract,
                $user,
                ($user->name ?? 'Người dùng').' đã thêm ghi chú chăm sóc: '.Str::limit($note->title, 120),
                ['type' => 'care_note', 'note_id' => $note->id],
            );
        }

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
            'subtotal_value' => ['nullable', 'numeric', 'min:0'],
            'value' => ['nullable', 'numeric', 'min:0'],
            'vat_enabled' => ['nullable', 'boolean'],
            'vat_mode' => ['nullable', 'string', 'in:percent,amount'],
            'vat_rate' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'vat_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_times' => ['nullable', 'integer', 'min:1', 'max:120'],
            'revenue' => ['nullable', 'numeric', 'min:0'],
            'debt' => ['nullable', 'numeric', 'min:0'],
            'cash_flow' => ['nullable', 'numeric'],
            'signed_at' => ['required', 'date'],
            'start_date' => ['required', 'date', 'after_or_equal:signed_at'],
            'end_date' => ['required', 'date', 'after:start_date'],
            'notes' => ['nullable', 'string'],
            'approval_note' => ['nullable', 'string'],
            'collector_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'care_staff_ids' => ['nullable', 'array'],
            'care_staff_ids.*' => ['integer', 'exists:users,id'],
            'create_and_approve' => ['nullable', 'boolean'],
        ];
        return $rules;
    }

    /**
     * @return array<string, string>
     */
    private function contractValidationMessages(): array
    {
        return [
            'signed_at.required' => 'Vui lòng nhập ngày ký.',
            'signed_at.date' => 'Ngày ký không hợp lệ.',
            'start_date.required' => 'Vui lòng nhập ngày bắt đầu hiệu lực.',
            'start_date.date' => 'Ngày bắt đầu hiệu lực không hợp lệ.',
            'start_date.after_or_equal' => 'Ngày bắt đầu hiệu lực phải từ ngày ký trở đi.',
            'end_date.required' => 'Vui lòng nhập ngày kết thúc.',
            'end_date.date' => 'Ngày kết thúc không hợp lệ.',
            'end_date.after' => 'Ngày kết thúc phải sau ngày bắt đầu hiệu lực.',
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function normalizeOpportunityIdInput(array $validated): array
    {
        if (! array_key_exists('opportunity_id', $validated)) {
            return $validated;
        }
        $id = (int) $validated['opportunity_id'];
        $validated['opportunity_id'] = $id > 0 ? $id : null;

        return $validated;
    }

    private function validateOpportunityForContract(?int $opportunityId, int $clientId, ?int $currentContractId): ?string
    {
        if ($opportunityId === null || $opportunityId <= 0) {
            return null;
        }
        $opp = Opportunity::query()->find($opportunityId);
        if (! $opp) {
            return 'Cơ hội không tồn tại.';
        }
        if ((int) $opp->client_id !== $clientId) {
            return 'Cơ hội không thuộc khách hàng đã chọn.';
        }
        $q = Contract::query()->where('opportunity_id', $opportunityId);
        if ($currentContractId) {
            $q->where('id', '!=', $currentContractId);
        }
        if ($q->exists()) {
            return 'Cơ hội đã được gắn với hợp đồng khác.';
        }

        return null;
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
            if (! is_array($item)) {
                return false;
            }
            $pid = isset($item['product_id']) ? (int) $item['product_id'] : 0;
            $name = isset($item['product_name']) ? trim((string) $item['product_name']) : '';

            return $pid > 0 || $name !== '';
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

    private function normalizeContractFinancialInputs(array $validated, array $items, ?Contract $contract = null): array
    {
        $hasItems = ! empty($items);
        $vatEnabled = ! $hasItems && filter_var($validated['vat_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $vatMode = (string) ($validated['vat_mode'] ?? ($contract->vat_mode ?? 'percent'));
        if (! in_array($vatMode, ['percent', 'amount'], true)) {
            $vatMode = 'percent';
        }

        $fallbackSubtotal = $contract
            ? (float) ($contract->subtotal_value ?: $contract->getRawOriginal('value') ?: 0)
            : 0.0;
        $subtotal = $hasItems
            ? $this->sumItems($items)
            : $this->parseNumericInput($validated['subtotal_value'] ?? ($validated['value'] ?? $fallbackSubtotal));

        $vatRate = $this->parseNumericInput($validated['vat_rate'] ?? ($contract->vat_rate ?? 0));
        $vatAmountInput = $this->parseNumericInput($validated['vat_amount'] ?? ($contract->vat_amount ?? 0));

        if ($vatEnabled && $vatMode === 'percent' && $vatRate <= 0) {
            throw ValidationException::withMessages([
                'vat_rate' => ['Vui lòng nhập % VAT lớn hơn 0.'],
            ]);
        }

        if ($vatEnabled && $vatMode === 'amount' && $vatAmountInput <= 0) {
            throw ValidationException::withMessages([
                'vat_amount' => ['Vui lòng nhập số tiền VAT lớn hơn 0.'],
            ]);
        }

        $resolvedVatAmount = 0.0;
        if ($vatEnabled) {
            $resolvedVatAmount = $vatMode === 'percent'
                ? round($subtotal * $vatRate / 100, 2)
                : round($vatAmountInput, 2);
        }

        $validated['subtotal_value'] = round($subtotal, 2);
        $validated['vat_enabled'] = $vatEnabled;
        $validated['vat_mode'] = $vatEnabled ? $vatMode : null;
        $validated['vat_rate'] = $vatEnabled && $vatMode === 'percent' ? round($vatRate, 2) : null;
        $validated['vat_amount'] = $vatEnabled ? $resolvedVatAmount : 0;
        $validated['value'] = round($subtotal + $resolvedVatAmount, 2);

        return $validated;
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
        $contract->setAttribute('can_manage', $this->canEditContract($user, $contract));
        $contract->setAttribute('can_delete', $this->canDeleteContract($user, $contract));
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
        $contract->loadMissing('client');
        if (! $contract->client || CrmScope::isClientInRotationPool($contract->client)) {
            return false;
        }

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
        $contract->loadMissing('client');
        if (! $contract->client || CrmScope::isClientInRotationPool($contract->client)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return true;
        }

        if ($this->isManagerOfContractDepartment($user, $contract)) {
            return true;
        }

        return false;
    }

    private function canDeleteContract(User $user, Contract $contract): bool
    {
        if (! $this->canViewContract($user, $contract)) {
            return false;
        }

        return in_array((string) $user->role, ['admin', 'administrator'], true);
    }

    /**
     * Tạo / sửa / xóa hợp đồng: nhân viên chỉ khi là người phụ trách khách (assigned_staff_id), không gồm sales_owner / chăm sóc.
     */
    private function canMutateContractForClient(User $user, Client $client, ?Contract $contract = null): bool
    {
        if (CrmScope::isClientInRotationPool($client)) {
            return false;
        }

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
            return (int) ($client->assigned_staff_id ?? 0) === (int) $user->id;
        }

        return false;
    }

    /** Admin / kế toán / QL phòng ban hoặc nhân viên phụ trách khách (assigned_staff). */
    private function canEditContract(User $user, Contract $contract): bool
    {
        if ($this->canManageContract($user, $contract)) {
            return true;
        }

        $contract->loadMissing('client');
        if (! $contract->client) {
            return false;
        }

        return $this->canMutateContractForClient($user, $contract->client, $contract);
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
        if ((int) ($client->assigned_staff_id ?? 0) <= 0
            && (int) ($client->sales_owner_id ?? 0) === (int) $user->id) {
            return true;
        }

        return $includeClientCareStaff && $this->isCareStaff($user, $client);
    }

    private function isEmployeeLinkedToClient(User $user, Client $client): bool
    {
        if ((int) ($client->assigned_staff_id ?? 0) === (int) $user->id) {
            return true;
        }

        if ((int) ($client->assigned_staff_id ?? 0) <= 0
            && (int) ($client->sales_owner_id ?? 0) === (int) $user->id) {
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
            'opportunity:id,title,client_id',
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

        if (Schema::hasTable('contract_activity_logs')) {
            $contract->load(['activityLogs' => function ($q) {
                $q->orderByDesc('created_at')->limit(300);
            }, 'activityLogs.user:id,name,email']);
        }
    }

    private function contractStatusSql(): string
    {
        return app(ContractLifecycleStatusService::class)->sqlExpression('contracts');
    }

    private function resolveAccessibleClient(Request $request, int $clientId): ?Client
    {
        $query = Client::query()->where('id', $clientId);
        CrmScope::applyClientScope($query, $request->user());

        return $query->first();
    }
}
