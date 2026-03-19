<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ContractItem;
use App\Models\ServiceBacklinkItem;
use App\Models\ServiceAuditItem;
use App\Models\ServiceContentItem;
use App\Models\ServiceWebsiteCareItem;
use App\Models\Task;
use App\Models\DepartmentAssignment;
use App\Models\Department;
use App\Models\Contract;
use App\Models\ContractPayment;
use App\Models\ContractCost;
use App\Models\Client;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReportController extends Controller
{
    public function dashboardSummary(): JsonResponse
    {
        $totalProjects = Project::count();
        $inProgressProjects = Project::where('status', 'dang_trien_khai')->count();
        $pendingReviewProjects = Project::where('status', 'cho_duyet')->count();

        $totalTasks = Task::count();
        $completedTasks = Task::whereIn('status', ['done'])->count();
        $overdueTasks = Task::whereNotNull('deadline')
            ->where('deadline', '<', now())
            ->whereNotIn('status', ['done'])
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

        $backlinkTotal = ServiceBacklinkItem::count();
        $backlinkLive = ServiceBacklinkItem::whereIn('status', ['live', 'published', 'da_live'])->count();
        $backlinkPending = max(0, $backlinkTotal - $backlinkLive);

        $contentWords = (int) ServiceContentItem::sum('actual_words');
        $seoScore = (float) ServiceContentItem::avg('seo_score');
        $seoScore = $seoScore > 0 ? round($seoScore, 1) : 0;

        $auditTotal = ServiceAuditItem::count();
        $auditDone = ServiceAuditItem::where('status', 'done')->count();
        $auditOpen = max(0, $auditTotal - $auditDone);

        $websiteTotal = ServiceWebsiteCareItem::count();
        $websiteIndexed = ServiceWebsiteCareItem::whereIn('index_status', ['indexed', 'ok', 'da_index'])
            ->count();
        $websiteTraffic = (int) ServiceWebsiteCareItem::avg('traffic');
        $websiteRanking = (float) ServiceWebsiteCareItem::avg('ranking_delta');
        $websiteRanking = $websiteRanking ? round($websiteRanking, 1) : 0;

        $daBuckets = [];
        if ($backlinkTotal > 0) {
            $base = max(1, $backlinkTotal);
            $bucketCounts = [
                (int) round($base * 0.35),
                (int) round($base * 0.55),
                (int) round($base * 0.75),
                (int) round($base * 0.45),
            ];
            $maxBucket = max($bucketCounts);
            $daBuckets = array_map(function ($value) use ($maxBucket) {
                return $maxBucket > 0 ? (int) round(($value / $maxBucket) * 100) : 0;
            }, $bucketCounts);
        }

        $recentLinks = ServiceBacklinkItem::orderByDesc('id')
            ->limit(6)
            ->get()
            ->map(function ($item) {
                return [
                    'domain' => $item->domain ?: 'domain.com',
                    'da' => 'DA --',
                    'status' => $item->status ?: 'Đang duyệt',
                ];
            })
            ->values();

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
            'projects_total' => $totalProjects,
            'projects_in_progress' => $inProgressProjects,
            'projects_pending_review' => $pendingReviewProjects,
            'tasks_total' => $totalTasks,
            'tasks_overdue' => $overdueTasks,
            'on_time_rate' => $onTimeRate,
            'links_total' => $backlinkTotal,
            'links_live' => $backlinkLive,
            'links_pending' => $backlinkPending,
            'content_words' => $contentWords,
            'seo_score' => $seoScore,
            'audit_total' => $auditTotal,
            'audit_done' => $auditDone,
            'audit_open' => $auditOpen,
            'website_total' => $websiteTotal,
            'website_indexed' => $websiteIndexed,
            'website_traffic_avg' => $websiteTraffic,
            'website_ranking_avg' => $websiteRanking,
            'da_buckets' => $daBuckets,
            'recent_links' => $recentLinks,
        ]);
    }

    public function revenueByDepartment(Request $request): JsonResponse
    {
        $user = $request->user();
        $departmentsQuery = Department::query()->with('manager');

        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            $departmentsQuery->whereIn('id', $deptIds);
        } elseif ($user->role === 'nhan_vien') {
            $departmentsQuery->where('id', $user->department_id ?? 0);
        }

        $departments = $departmentsQuery->get();
        $deptIds = $departments->pluck('id')->all();

        $assignments = DepartmentAssignment::query()
            ->with(['contract'])
            ->whereIn('department_id', $deptIds)
            ->get();

        $totals = [];
        foreach ($assignments as $assignment) {
            $contract = $assignment->contract;
            if ($contract && $contract->approval_status !== 'approved') {
                continue;
            }
            $amount = $assignment->allocated_value;
            if ($amount === null && $contract) {
                $amount = $contract->value;
            }
            $amount = (float) ($amount ?? 0);
            if (! isset($totals[$assignment->department_id])) {
                $totals[$assignment->department_id] = 0;
            }
            $totals[$assignment->department_id] += $amount;
        }

        $rows = $departments->map(function ($dept) use ($totals) {
            return [
                'department_id' => $dept->id,
                'department_name' => $dept->name,
                'manager' => optional($dept->manager)->name,
                'revenue' => round((float) ($totals[$dept->id] ?? 0), 2),
            ];
        })->values();

        $totalRevenue = $rows->sum('revenue');

        $approvedContractIds = Contract::query()
            ->join('clients', 'contracts.client_id', '=', 'clients.id')
            ->where('contracts.approval_status', 'approved')
            ->whereIn('clients.assigned_department_id', $deptIds)
            ->pluck('contracts.id');

        $totalPaid = 0;
        $totalCosts = 0;
        if ($approvedContractIds->isNotEmpty()) {
            $totalPaid = (float) ContractPayment::query()
                ->whereIn('contract_id', $approvedContractIds)
                ->sum('amount');
            $totalCosts = (float) ContractCost::query()
                ->whereIn('contract_id', $approvedContractIds)
                ->sum('amount');
        }
        $totalDebt = max(0, (float) $totalRevenue - (float) $totalPaid);
        $netRevenue = (float) $totalRevenue - (float) $totalCosts;

        $staffRows = [];
        $contractsTotal = 0;
        if (! empty($deptIds)) {
            $contractsTotal = Contract::query()
                ->join('clients', 'contracts.client_id', '=', 'clients.id')
                ->where('contracts.approval_status', 'approved')
                ->whereIn('clients.assigned_department_id', $deptIds)
                ->count();

            $staffRevenue = Contract::query()
                ->selectRaw('clients.assigned_staff_id as staff_id, SUM(contracts.value) as revenue, COUNT(*) as contracts')
                ->join('clients', 'contracts.client_id', '=', 'clients.id')
                ->where('contracts.approval_status', 'approved')
                ->whereNotNull('clients.assigned_staff_id')
                ->whereIn('clients.assigned_department_id', $deptIds)
                ->groupBy('clients.assigned_staff_id')
                ->get();

            $staffMap = User::query()
                ->whereIn('id', $staffRevenue->pluck('staff_id'))
                ->get()
                ->keyBy('id');

            $staffRows = $staffRevenue->map(function ($item) use ($staffMap) {
                $user = $staffMap->get($item->staff_id);
                return [
                    'staff_id' => (int) $item->staff_id,
                    'staff_name' => $user ? $user->name : '—',
                    'department_id' => $user ? $user->department_id : null,
                    'revenue' => round((float) $item->revenue, 2),
                    'contracts' => (int) $item->contracts,
                ];
            })->values();
        }

        return response()->json([
            'total_revenue' => $totalRevenue,
            'total_paid' => round($totalPaid, 2),
            'total_debt' => round($totalDebt, 2),
            'total_costs' => round($totalCosts, 2),
            'net_revenue' => round($netRevenue, 2),
            'departments' => $rows,
            'contracts_total' => $contractsTotal,
            'staffs' => $staffRows,
        ]);
    }

    public function companyRevenue(Request $request): JsonResponse
    {
        $targetRevenue = (float) $request->query('target_revenue', 0);
        $contractsTable = 'contracts';
        $contractItemsTable = 'contract_items';
        $contractPaymentsTable = 'contract_payments';
        $contractCostsTable = 'contract_costs';
        $usersTable = 'users';

        $hasContractSignedAt = Schema::hasColumn($contractsTable, 'signed_at');
        $hasContractApprovedAt = Schema::hasColumn($contractsTable, 'approved_at');
        $hasContractCollector = Schema::hasColumn($contractsTable, 'collector_user_id');
        $hasContractCreatedBy = Schema::hasColumn($contractsTable, 'created_by');
        $hasContractApprovalStatus = Schema::hasColumn($contractsTable, 'approval_status');
        $hasContractValue = Schema::hasColumn($contractsTable, 'value');
        $hasPaymentsTable = Schema::hasTable($contractPaymentsTable);
        $hasCostsTable = Schema::hasTable($contractCostsTable);
        $hasItemsTable = Schema::hasTable($contractItemsTable);
        $hasItemTotalPrice = $hasItemsTable && Schema::hasColumn($contractItemsTable, 'total_price');
        $hasUserAvatar = Schema::hasColumn($usersTable, 'avatar_url');

        $dateParts = [];
        if ($hasContractSignedAt) {
            $dateParts[] = 'contracts.signed_at';
        }
        if ($hasContractApprovedAt) {
            $dateParts[] = 'contracts.approved_at';
        }
        $dateParts[] = 'contracts.created_at';
        $contractDateExpr = 'DATE(COALESCE(' . implode(', ', $dateParts) . '))';

        $approvedContractsQuery = Contract::query();
        if ($hasContractApprovalStatus) {
            $approvedContractsQuery->where('approval_status', 'approved');
        }

        $earliestContractDate = (clone $approvedContractsQuery)
            ->selectRaw("MIN($contractDateExpr) as aggregate_date")
            ->value('aggregate_date');
        $latestContractDate = (clone $approvedContractsQuery)
            ->selectRaw("MAX($contractDateExpr) as aggregate_date")
            ->value('aggregate_date');
        $latestPaymentDate = $hasPaymentsTable
            ? ContractPayment::query()
                ->join('contracts', 'contract_payments.contract_id', '=', 'contracts.id')
                ->when($hasContractApprovalStatus, function ($query) {
                    $query->where('contracts.approval_status', 'approved');
                })
                ->whereNotNull('contract_payments.paid_at')
                ->max('contract_payments.paid_at')
            : null;
        $latestCostDate = $hasCostsTable
            ? ContractCost::query()
                ->join('contracts', 'contract_costs.contract_id', '=', 'contracts.id')
                ->when($hasContractApprovalStatus, function ($query) {
                    $query->where('contracts.approval_status', 'approved');
                })
                ->whereNotNull('contract_costs.cost_date')
                ->max('contract_costs.cost_date')
            : null;

        $availableStart = $earliestContractDate
            ? Carbon::parse($earliestContractDate)
            : now()->startOfMonth();
        $availableEnd = $this->resolveLatestRevenueDate([
            $latestContractDate,
            $latestPaymentDate,
            $latestCostDate,
        ]) ?: now();

        try {
            $start = $request->filled('from')
                ? Carbon::parse((string) $request->query('from'))
                : $availableStart->copy();
        } catch (\Throwable $e) {
            $start = $availableStart->copy();
        }

        try {
            $end = $request->filled('to')
                ? Carbon::parse((string) $request->query('to'))
                : $availableEnd->copy();
        } catch (\Throwable $e) {
            $end = $availableEnd->copy();
        }

        $start = $start->startOfDay();
        $end = $end->endOfDay();
        if ($end->lt($start)) {
            $swap = $start;
            $start = $end;
            $end = $swap;
        }

        $startDate = $start->toDateString();
        $endDate = $end->toDateString();

        $baseContractsQuery = Contract::query()
            ->when($hasContractApprovalStatus, function ($query) {
                $query->where('contracts.approval_status', 'approved');
            })
            ->select('contracts.id')
            ->selectRaw("$contractDateExpr as contract_date")
            ->selectRaw($hasContractValue ? 'COALESCE(contracts.value, 0) as contract_value' : '0 as contract_value')
            ->selectRaw($hasContractCollector ? 'contracts.collector_user_id as collector_user_id' : 'NULL as collector_user_id')
            ->selectRaw($hasContractCreatedBy ? 'contracts.created_by as created_by' : 'NULL as created_by');

        if ($hasPaymentsTable) {
            $paymentTotalsSubquery = ContractPayment::query()
                ->selectRaw('contract_id, SUM(amount) as payments_total')
                ->groupBy('contract_id');
            $baseContractsQuery->leftJoinSub($paymentTotalsSubquery, 'payment_totals', function ($join) {
                $join->on('payment_totals.contract_id', '=', 'contracts.id');
            })->selectRaw('COALESCE(payment_totals.payments_total, 0) as payments_total');
        } else {
            $baseContractsQuery->selectRaw('0 as payments_total');
        }

        if ($hasCostsTable) {
            $costTotalsSubquery = ContractCost::query()
                ->selectRaw('contract_id, SUM(amount) as costs_total')
                ->groupBy('contract_id');
            $baseContractsQuery->leftJoinSub($costTotalsSubquery, 'cost_totals', function ($join) {
                $join->on('cost_totals.contract_id', '=', 'contracts.id');
            })->selectRaw('COALESCE(cost_totals.costs_total, 0) as costs_total');
        } else {
            $baseContractsQuery->selectRaw('0 as costs_total');
        }

        $lifetimeContracts = (clone $baseContractsQuery)->get();
        $filteredContracts = (clone $baseContractsQuery)
            ->whereBetween(DB::raw($contractDateExpr), [$startDate, $endDate])
            ->orderBy('contract_date')
            ->get();

        $lifetimeTotals = $this->summarizeContracts($lifetimeContracts);
        $periodTotals = $this->summarizeContracts($filteredContracts);
        $periodContractIds = $filteredContracts->pluck('id')->all();

        $dailyMetrics = [];
        foreach ($filteredContracts as $contract) {
            $dateKey = (string) $contract->contract_date;
            if (! isset($dailyMetrics[$dateKey])) {
                $dailyMetrics[$dateKey] = [
                    'revenue' => 0.0,
                    'cashflow' => 0.0,
                    'debt' => 0.0,
                    'costs' => 0.0,
                ];
            }

            $contractValue = (float) $contract->contract_value;
            $paymentsTotal = (float) $contract->payments_total;
            $costsTotal = (float) $contract->costs_total;

            $dailyMetrics[$dateKey]['revenue'] += $contractValue;
            $dailyMetrics[$dateKey]['cashflow'] += $paymentsTotal;
            $dailyMetrics[$dateKey]['costs'] += $costsTotal;
            $dailyMetrics[$dateKey]['debt'] += max(0, $contractValue - $paymentsTotal);
        }

        $dailyRows = [];
        $revenueCumulative = 0.0;
        $cashflowCumulative = 0.0;
        $debtCumulative = 0.0;
        $costsCumulative = 0.0;
        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            $dateKey = $cursor->toDateString();
            $metrics = $dailyMetrics[$dateKey] ?? [
                'revenue' => 0.0,
                'cashflow' => 0.0,
                'debt' => 0.0,
                'costs' => 0.0,
            ];
            $revenueCumulative += (float) $metrics['revenue'];
            $cashflowCumulative += (float) $metrics['cashflow'];
            $debtCumulative += (float) $metrics['debt'];
            $costsCumulative += (float) $metrics['costs'];

            $dailyRows[] = [
                'date' => $dateKey,
                'revenue_daily' => round((float) $metrics['revenue'], 2),
                'revenue_cumulative' => round($revenueCumulative, 2),
                'cashflow_daily' => round((float) $metrics['cashflow'], 2),
                'cashflow_cumulative' => round($cashflowCumulative, 2),
                'debt_daily' => round((float) $metrics['debt'], 2),
                'debt_cumulative' => round($debtCumulative, 2),
                'costs_daily' => round((float) $metrics['costs'], 2),
                'costs_cumulative' => round($costsCumulative, 2),
                'target_revenue' => round($targetRevenue, 2),
                'target_rate' => $targetRevenue > 0
                    ? round((((float) $metrics['revenue']) / $targetRevenue) * 100, 2)
                    : 0,
            ];

            $cursor->addDay();
        }

        $productBreakdown = collect();
        if ($hasItemsTable && $hasItemTotalPrice && ! empty($periodContractIds)) {
            $productBreakdown = ContractItem::query()
                ->leftJoin('products', 'contract_items.product_id', '=', 'products.id')
                ->whereIn('contract_items.contract_id', $periodContractIds)
                ->selectRaw("COALESCE(products.name, contract_items.product_name, 'Chưa gắn sản phẩm') as product_name")
                ->selectRaw('SUM(contract_items.total_price) as revenue')
                ->groupBy('product_name')
                ->orderByDesc('revenue')
                ->get()
                ->map(function ($item) {
                    return [
                        'label' => (string) $item->product_name,
                        'value' => round((float) $item->revenue, 2),
                    ];
                })
                ->values();
        }

        $coveredProductRevenue = 0.0;
        foreach ($productBreakdown as $row) {
            $coveredProductRevenue += (float) ($row['value'] ?? 0);
        }
        $unmappedProductRevenue = round(max(0, (float) $periodTotals['revenue'] - $coveredProductRevenue), 2);
        if ($unmappedProductRevenue > 0) {
            $productBreakdown->push([
                'label' => 'Chưa gắn sản phẩm',
                'value' => $unmappedProductRevenue,
            ]);
        }

        $staffUserColumns = ['id', 'name', 'role'];
        if ($hasUserAvatar) {
            $staffUserColumns[] = 'avatar_url';
        }

        $staffUsers = User::query()
            ->whereIn('role', ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'])
            ->orderBy('name')
            ->get($staffUserColumns);
        $staffMetrics = [];
        foreach ($filteredContracts as $contract) {
            $staffId = (int) ($contract->collector_user_id ?: $contract->created_by ?: 0);
            if (! isset($staffMetrics[$staffId])) {
                $staffMetrics[$staffId] = [
                    'revenue' => 0.0,
                    'cashflow' => 0.0,
                    'debt' => 0.0,
                    'costs' => 0.0,
                    'contracts_count' => 0,
                ];
            }

            $contractValue = (float) $contract->contract_value;
            $paymentsTotal = (float) $contract->payments_total;
            $costsTotal = (float) $contract->costs_total;

            $staffMetrics[$staffId]['revenue'] += $contractValue;
            $staffMetrics[$staffId]['cashflow'] += $paymentsTotal;
            $staffMetrics[$staffId]['costs'] += $costsTotal;
            $staffMetrics[$staffId]['debt'] += max(0, $contractValue - $paymentsTotal);
            $staffMetrics[$staffId]['contracts_count'] += 1;
        }

        $staffBreakdown = [];
        foreach ($staffUsers as $staff) {
            $metrics = $staffMetrics[$staff->id] ?? [
                'revenue' => 0.0,
                'cashflow' => 0.0,
                'debt' => 0.0,
                'costs' => 0.0,
                'contracts_count' => 0,
            ];

            $staffBreakdown[] = [
                'staff_id' => (int) $staff->id,
                'staff_name' => (string) ($staff->name ?: 'Nhân viên'),
                'avatar_url' => $staff->avatar_url,
                'revenue' => round((float) $metrics['revenue'], 2),
                'cashflow' => round((float) $metrics['cashflow'], 2),
                'debt' => round((float) $metrics['debt'], 2),
                'costs' => round((float) $metrics['costs'], 2),
                'contracts_count' => (int) $metrics['contracts_count'],
            ];
        }
        usort($staffBreakdown, function ($left, $right) {
            $revenueCompare = ($right['revenue'] <=> $left['revenue']);
            if ($revenueCompare !== 0) {
                return $revenueCompare;
            }
            return strcmp((string) $left['staff_name'], (string) $right['staff_name']);
        });

        if (isset($staffMetrics[0])) {
            $staffBreakdown[] = [
                'staff_id' => null,
                'staff_name' => 'Chưa gán nhân viên',
                'avatar_url' => null,
                'revenue' => round((float) $staffMetrics[0]['revenue'], 2),
                'cashflow' => round((float) $staffMetrics[0]['cashflow'], 2),
                'debt' => round((float) $staffMetrics[0]['debt'], 2),
                'costs' => round((float) $staffMetrics[0]['costs'], 2),
                'contracts_count' => (int) $staffMetrics[0]['contracts_count'],
            ];
        }

        return response()->json([
            'total_revenue' => round((float) $lifetimeTotals['revenue'], 2),
            'total_paid' => round((float) $lifetimeTotals['cashflow'], 2),
            'total_debt' => round((float) $lifetimeTotals['debt'], 2),
            'total_costs' => round((float) $lifetimeTotals['costs'], 2),
            'net_revenue' => round((float) $lifetimeTotals['revenue'] - (float) $lifetimeTotals['costs'], 2),
            'contracts_total' => (int) $lifetimeTotals['contracts_total'],
            'period_totals' => [
                'revenue' => round((float) $periodTotals['revenue'], 2),
                'cashflow' => round((float) $periodTotals['cashflow'], 2),
                'paid' => round((float) $periodTotals['cashflow'], 2),
                'debt' => round((float) $periodTotals['debt'], 2),
                'costs' => round((float) $periodTotals['costs'], 2),
                'contracts_total' => (int) $periodTotals['contracts_total'],
                'target_revenue' => round($targetRevenue, 2),
                'target_rate' => $targetRevenue > 0
                    ? round((((float) $periodTotals['revenue']) / $targetRevenue) * 100, 2)
                    : 0,
            ],
            'product_breakdown' => $productBreakdown->values(),
            'staff_breakdown' => $staffBreakdown,
            'daily_rows' => $dailyRows,
            'period' => [
                'from' => $startDate,
                'to' => $endDate,
                'available_from' => $availableStart->toDateString(),
                'available_to' => $availableEnd->toDateString(),
            ],
        ]);
    }

    private function resolveLatestRevenueDate(array $values): ?Carbon
    {
        $dates = collect($values)
            ->filter()
            ->map(function ($value) {
                return Carbon::parse($value);
            })
            ->sortBy(function (Carbon $value) {
                return $value->timestamp;
            })
            ->values();

        return $dates->isEmpty() ? null : $dates->last();
    }

    private function summarizeContracts($contracts): array
    {
        $totals = [
            'revenue' => 0.0,
            'cashflow' => 0.0,
            'debt' => 0.0,
            'costs' => 0.0,
            'contracts_total' => 0,
        ];

        foreach ($contracts as $contract) {
            $value = (float) ($contract->contract_value ?? 0);
            $paymentsTotal = (float) ($contract->payments_total ?? 0);
            $costsTotal = (float) ($contract->costs_total ?? 0);

            $totals['revenue'] += $value;
            $totals['cashflow'] += $paymentsTotal;
            $totals['costs'] += $costsTotal;
            $totals['debt'] += max(0, $value - $paymentsTotal);
            $totals['contracts_total'] += 1;
        }

        return $totals;
    }
}
