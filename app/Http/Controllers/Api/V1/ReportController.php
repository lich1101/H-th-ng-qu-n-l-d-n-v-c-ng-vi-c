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
        $approved = Contract::query()->where('approval_status', 'approved');

        $lifetimeRevenue = (float) (clone $approved)->sum('value');
        $lifetimeContractsTotal = (int) (clone $approved)->count();
        $lifetimePaid = (float) ContractPayment::query()
            ->join('contracts', 'contract_payments.contract_id', '=', 'contracts.id')
            ->where('contracts.approval_status', 'approved')
            ->sum('contract_payments.amount');
        $lifetimeCosts = (float) ContractCost::query()
            ->join('contracts', 'contract_costs.contract_id', '=', 'contracts.id')
            ->where('contracts.approval_status', 'approved')
            ->sum('contract_costs.amount');
        $lifetimeDebt = max(0, $lifetimeRevenue - $lifetimePaid);
        $lifetimeNetRevenue = $lifetimeRevenue - $lifetimeCosts;

        $monthlyRows = Contract::query()
            ->where('approval_status', 'approved')
            ->selectRaw("DATE_FORMAT(COALESCE(signed_at, approved_at, created_at), '%Y-%m') as month, SUM(value) as revenue, COUNT(*) as contracts")
            ->groupBy('month')
            ->orderByDesc('month')
            ->limit(6)
            ->get()
            ->sortBy('month')
            ->values()
            ->map(function ($item) {
                return [
                    'month' => $item->month,
                    'revenue' => round((float) $item->revenue, 2),
                    'contracts' => (int) $item->contracts,
                ];
            });

        $topCustomers = Contract::query()
            ->join('clients', 'contracts.client_id', '=', 'clients.id')
            ->where('contracts.approval_status', 'approved')
            ->selectRaw('clients.id as client_id, clients.name, clients.company, SUM(contracts.value) as revenue, COUNT(*) as contracts')
            ->groupBy('clients.id', 'clients.name', 'clients.company')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get()
            ->map(function ($item) {
                return [
                    'client_id' => (int) $item->client_id,
                    'name' => $item->name,
                    'company' => $item->company,
                    'revenue' => round((float) $item->revenue, 2),
                    'contracts' => (int) $item->contracts,
                ];
            })
            ->values();

        $fromInput = $request->query('from');
        $toInput = $request->query('to');
        $targetRevenue = (float) $request->query('target_revenue', 0);

        $contractDateExpr = "DATE(COALESCE(contracts.signed_at, contracts.approved_at, contracts.created_at))";
        $earliestContractDate = Contract::query()
            ->where('approval_status', 'approved')
            ->selectRaw("MIN($contractDateExpr) as aggregate_date")
            ->value('aggregate_date');
        $latestContractDate = Contract::query()
            ->where('approval_status', 'approved')
            ->selectRaw("MAX($contractDateExpr) as aggregate_date")
            ->value('aggregate_date');
        $latestPaymentDate = ContractPayment::query()
            ->join('contracts', 'contract_payments.contract_id', '=', 'contracts.id')
            ->where('contracts.approval_status', 'approved')
            ->whereNotNull('contract_payments.paid_at')
            ->max('contract_payments.paid_at');

        $availableStart = $earliestContractDate
            ? Carbon::parse($earliestContractDate)
            : now()->startOfMonth();
        $availableEndCandidate = collect([$latestContractDate, $latestPaymentDate])
            ->filter()
            ->map(function ($value) {
                return Carbon::parse($value);
            })
            ->sortBy(function (Carbon $value) {
                return $value->timestamp;
            })
            ->last();
        $availableEnd = $availableEndCandidate ?: now();

        try {
            $start = $fromInput ? Carbon::parse($fromInput) : $availableStart->copy();
        } catch (\Throwable $e) {
            $start = $availableStart->copy();
        }
        try {
            $end = $toInput ? Carbon::parse($toInput) : $availableEnd->copy();
        } catch (\Throwable $e) {
            $end = $availableEnd->copy();
        }

        $start = $start->startOfDay();
        $end = $end->endOfDay();
        if ($end->lt($start)) {
            [$start, $end] = [$end, $start];
        }

        $startDate = $start->toDateString();
        $endDate = $end->toDateString();

        $periodApproved = Contract::query()
            ->where('approval_status', 'approved')
            ->whereBetween(DB::raw($contractDateExpr), [$startDate, $endDate]);
        $periodContractIds = (clone $periodApproved)->pluck('contracts.id');
        $periodRevenueTotal = (float) (clone $periodApproved)->sum('contracts.value');
        $periodContractsTotal = (int) (clone $periodApproved)->count();

        $dailyRevenueRows = Contract::query()
            ->where('approval_status', 'approved')
            ->whereBetween(DB::raw($contractDateExpr), [$startDate, $endDate])
            ->selectRaw("$contractDateExpr as date, SUM(contracts.value) as revenue")
            ->groupBy('date')
            ->get();
        $dailyRevenueMap = $dailyRevenueRows->mapWithKeys(function ($row) {
            return [$row->date => (float) $row->revenue];
        });

        $paymentsBase = ContractPayment::query()
            ->join('contracts', 'contract_payments.contract_id', '=', 'contracts.id')
            ->where('contracts.approval_status', 'approved')
            ->whereNotNull('contract_payments.paid_at');

        $paymentsAll = (clone $paymentsBase)
            ->whereBetween('contract_payments.paid_at', [$startDate, $endDate])
            ->selectRaw('contract_payments.paid_at as date, SUM(contract_payments.amount) as amount')
            ->groupBy('date')
            ->get();
        $paymentsAllMap = $paymentsAll->mapWithKeys(function ($row) {
            return [$row->date => (float) $row->amount];
        });

        $paymentsPeriod = (clone $paymentsBase)
            ->whereBetween(DB::raw($contractDateExpr), [$startDate, $endDate])
            ->whereBetween('contract_payments.paid_at', [$startDate, $endDate])
            ->selectRaw('contract_payments.paid_at as date, SUM(contract_payments.amount) as amount')
            ->groupBy('date')
            ->get();
        $paymentsPeriodMap = $paymentsPeriod->mapWithKeys(function ($row) {
            return [$row->date => (float) $row->amount];
        });

        $paymentsPrePeriod = (clone $paymentsBase)
            ->where(DB::raw($contractDateExpr), '<', $startDate)
            ->whereBetween('contract_payments.paid_at', [$startDate, $endDate])
            ->selectRaw('contract_payments.paid_at as date, SUM(contract_payments.amount) as amount')
            ->groupBy('date')
            ->get();
        $paymentsPrePeriodMap = $paymentsPrePeriod->mapWithKeys(function ($row) {
            return [$row->date => (float) $row->amount];
        });

        $prePeriodRevenue = Contract::query()
            ->where('approval_status', 'approved')
            ->where(DB::raw($contractDateExpr), '<', $startDate)
            ->sum('value');

        $prePeriodPaid = (clone $paymentsBase)
            ->where(DB::raw($contractDateExpr), '<', $startDate)
            ->where('contract_payments.paid_at', '<', $startDate)
            ->sum('contract_payments.amount');

        $openingPrevDebt = max(0, (float) $prePeriodRevenue - (float) $prePeriodPaid);

        $clientsBeforeStart = Client::query()
            ->whereDate('created_at', '<', $startDate)
            ->count();
        $clientsDailyRows = Client::query()
            ->whereBetween(DB::raw('DATE(created_at)'), [$startDate, $endDate])
            ->selectRaw('DATE(created_at) as date, COUNT(*) as total')
            ->groupBy('date')
            ->get();
        $clientsDailyMap = $clientsDailyRows->mapWithKeys(function ($row) {
            return [$row->date => (int) $row->total];
        });

        $rows = [];
        $cumRevenue = 0;
        $cumCollected = 0;
        $cumPaymentsAll = 0;
        $cumPrePeriodPayments = 0;
        $cumAgents = $clientsBeforeStart;
        $monthKey = null;
        $monthAgents = 0;

        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            $dateKey = $cursor->toDateString();
            $revDaily = (float) ($dailyRevenueMap[$dateKey] ?? 0);
            $cumRevenue += $revDaily;

            $collectedDaily = (float) ($paymentsPeriodMap[$dateKey] ?? 0);
            $cumCollected += $collectedDaily;

            $debtDaily = max(0, $revDaily - $collectedDaily);
            $debtCumulative = max(0, $cumRevenue - $cumCollected);

            $preCollectedDaily = (float) ($paymentsPrePeriodMap[$dateKey] ?? 0);
            $prevDebtOpen = max(0, $openingPrevDebt - $cumPrePeriodPayments);
            $cumPrePeriodPayments += $preCollectedDaily;
            $prevDebtRemaining = max(0, $prevDebtOpen - $preCollectedDaily);

            $paymentsAllDaily = (float) ($paymentsAllMap[$dateKey] ?? 0);
            $cumPaymentsAll += $paymentsAllDaily;

            $agentsDaily = (int) ($clientsDailyMap[$dateKey] ?? 0);
            $cumAgents += $agentsDaily;

            $currentMonthKey = $cursor->format('Y-m');
            if ($monthKey !== $currentMonthKey) {
                $monthKey = $currentMonthKey;
                $monthAgents = 0;
            }
            $monthAgents += $agentsDaily;

            $targetRate = $targetRevenue > 0
                ? round(($revDaily / $targetRevenue) * 100, 2)
                : 0;
            $cashRate = $revDaily > 0 ? round(($collectedDaily / $revDaily) * 100, 2) : 0;
            $debtRate = $revDaily > 0 ? round(($debtDaily / $revDaily) * 100, 2) : 0;

            $rows[] = [
                'date' => $dateKey,
                'revenue_cumulative' => round($cumRevenue, 2),
                'revenue_daily' => round($revDaily, 2),
                'collected_cumulative' => round($cumCollected, 2),
                'collected_daily' => round($collectedDaily, 2),
                'debt_cumulative' => round($debtCumulative, 2),
                'debt_daily' => round($debtDaily, 2),
                'debt_collected' => round($collectedDaily, 2),
                'prev_month_debt_open' => round($prevDebtOpen, 2),
                'prev_month_debt_collected' => round($preCollectedDaily, 2),
                'cash_cumulative_period' => round($cumPaymentsAll, 2),
                'cash_daily_total' => round($paymentsAllDaily, 2),
                'agents_total' => $cumAgents,
                'agents_month_cumulative' => $monthAgents,
                'agents_daily_new' => $agentsDaily,
                'agents_dropped' => 0,
                'target_revenue' => round($targetRevenue, 2),
                'target_rate' => $targetRate,
                'cash_rate' => $cashRate,
                'debt_rate' => $debtRate,
                'prev_month_debt_remaining' => round($prevDebtRemaining, 2),
            ];

            $cursor->addDay();
        }

        $periodCostsTotal = 0.0;
        if ($periodContractIds->isNotEmpty()) {
            $periodCostsTotal = (float) ContractCost::query()
                ->whereIn('contract_id', $periodContractIds)
                ->sum('amount');
        }
        $periodPaidTotal = (float) collect($paymentsAllMap)->sum();
        $periodDebtTotal = max(0, $periodRevenueTotal - $cumCollected);

        $productRows = ContractItem::query()
            ->join('contracts', 'contract_items.contract_id', '=', 'contracts.id')
            ->leftJoin('products', 'contract_items.product_id', '=', 'products.id')
            ->where('contracts.approval_status', 'approved')
            ->whereBetween(DB::raw($contractDateExpr), [$startDate, $endDate])
            ->selectRaw('COALESCE(products.name, contract_items.product_name, ?) as product_name, SUM(contract_items.total_price) as revenue', ['Chưa gắn sản phẩm'])
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

        $productCoveredRevenue = (float) $productRows->sum('value');
        $unmappedProductRevenue = round(max(0, $periodRevenueTotal - $productCoveredRevenue), 2);
        if ($unmappedProductRevenue > 0) {
            $productRows->push([
                'label' => 'Chưa gắn sản phẩm',
                'value' => $unmappedProductRevenue,
            ]);
        }

        $paymentSubquery = ContractPayment::query()
            ->selectRaw('contract_id, SUM(amount) as payments_total')
            ->groupBy('contract_id');
        $costSubquery = ContractCost::query()
            ->selectRaw('contract_id, SUM(amount) as costs_total')
            ->groupBy('contract_id');

        $staffRevenueRows = Contract::query()
            ->join('clients', 'contracts.client_id', '=', 'clients.id')
            ->leftJoinSub($paymentSubquery, 'payment_totals', function ($join) {
                $join->on('payment_totals.contract_id', '=', 'contracts.id');
            })
            ->leftJoinSub($costSubquery, 'cost_totals', function ($join) {
                $join->on('cost_totals.contract_id', '=', 'contracts.id');
            })
            ->where('contracts.approval_status', 'approved')
            ->whereBetween(DB::raw($contractDateExpr), [$startDate, $endDate])
            ->selectRaw('COALESCE(contracts.collector_user_id, contracts.created_by, clients.assigned_staff_id) as staff_id')
            ->selectRaw('SUM(contracts.value) as signed_revenue')
            ->selectRaw('SUM(GREATEST(contracts.value - COALESCE(cost_totals.costs_total, 0), 0)) as settled_revenue')
            ->selectRaw('SUM(COALESCE(payment_totals.payments_total, 0)) as collected_revenue')
            ->selectRaw('COUNT(contracts.id) as contracts_count')
            ->groupBy('staff_id')
            ->orderByDesc('signed_revenue')
            ->get();
        $staffMap = User::query()
            ->whereIn('id', $staffRevenueRows->pluck('staff_id')->filter()->all())
            ->get()
            ->keyBy('id');
        $staffBreakdown = $staffRevenueRows
            ->map(function ($item) use ($staffMap) {
                $staff = $item->staff_id ? $staffMap->get((int) $item->staff_id) : null;
                return [
                    'staff_id' => $item->staff_id ? (int) $item->staff_id : null,
                    'staff_name' => $staff ? ($staff->name ?: 'Chưa gán nhân viên') : 'Chưa gán nhân viên',
                    'avatar_url' => $staff ? $staff->avatar_url : null,
                    'signed_revenue' => round((float) $item->signed_revenue, 2),
                    'settled_revenue' => round((float) $item->settled_revenue, 2),
                    'collected_revenue' => round((float) $item->collected_revenue, 2),
                    'contracts_count' => (int) $item->contracts_count,
                ];
            })
            ->values();

        return response()->json([
            'total_revenue' => round($lifetimeRevenue, 2),
            'total_paid' => round($lifetimePaid, 2),
            'total_debt' => round($lifetimeDebt, 2),
            'total_costs' => round($lifetimeCosts, 2),
            'net_revenue' => round($lifetimeNetRevenue, 2),
            'contracts_total' => $lifetimeContractsTotal,
            'period_totals' => [
                'revenue' => round($periodRevenueTotal, 2),
                'paid' => round($periodPaidTotal, 2),
                'debt' => round($periodDebtTotal, 2),
                'costs' => round($periodCostsTotal, 2),
                'net_revenue' => round($periodRevenueTotal - $periodCostsTotal, 2),
                'contracts_total' => $periodContractsTotal,
            ],
            'monthly' => $monthlyRows,
            'top_customers' => $topCustomers,
            'product_breakdown' => $productRows,
            'staff_breakdown' => $staffBreakdown,
            'daily_rows' => $rows,
            'period' => [
                'from' => $startDate,
                'to' => $endDate,
                'available_from' => $availableStart->toDateString(),
                'available_to' => $availableEnd->toDateString(),
            ],
        ]);
    }
}
