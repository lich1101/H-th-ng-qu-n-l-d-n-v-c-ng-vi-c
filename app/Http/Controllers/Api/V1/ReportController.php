<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Http\Helpers\ProjectScope;
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
use App\Models\Opportunity;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReportController extends Controller
{
    public function dashboardSummary(Request $request): JsonResponse
    {
        try {
        $viewer = $request->user();
        if (! $viewer) {
            return response()->json([
                'projects' => ['total' => 0, 'in_progress' => 0, 'pending_review' => 0],
                'tasks' => ['total' => 0, 'completed' => 0, 'overdue' => 0, 'on_time_rate' => 0],
                'service_breakdown' => [],
                'product_breakdown' => [],
                'projects_total' => 0,
                'projects_in_progress' => 0,
                'projects_pending_review' => 0,
                'tasks_total' => 0,
                'tasks_overdue' => 0,
                'on_time_rate' => 0,
                'links_total' => 0,
                'links_live' => 0,
                'links_pending' => 0,
                'content_words' => 0,
                'seo_score' => 0,
                'audit_total' => 0,
                'audit_done' => 0,
                'audit_open' => 0,
                'website_total' => 0,
                'website_indexed' => 0,
                'website_traffic_avg' => 0,
                'website_ranking_avg' => 0,
                'da_buckets' => [],
                'recent_links' => [],
                'staff_sales_breakdown' => [],
                'period_revenue_total' => 0,
                'period_cashflow_total' => 0,
                'period_contracts_total' => 0,
                'customer_growth' => [],
                'employee_stats' => [],
                'employee_role_breakdown' => [],
                'employee_summary' => ['total' => 0, 'active' => 0, 'managers' => 0, 'staff' => 0],
                'period' => [
                    'current_label' => 'Toàn thời gian',
                    'current_from' => now()->toDateString(),
                    'current_to' => now()->toDateString(),
                    'available_from' => now()->toDateString(),
                    'available_to' => now()->toDateString(),
                ],
            ]);
        }
        $projectBaseQuery = ProjectScope::applyProjectScope(Project::query(), $viewer);
        $taskBaseQuery = ProjectScope::applyTaskScope(Task::query(), $viewer);
        $clientBaseQuery = CrmScope::applyClientScope(Client::query(), $viewer);
        $opportunityBaseQuery = CrmScope::applyOpportunityScope(Opportunity::query(), $viewer);
        $contractBaseQuery = CrmScope::applyContractScope(Contract::query(), $viewer);

        $hasContractApprovalStatus = Schema::hasColumn('contracts', 'approval_status');
        $hasContractSignedAt = Schema::hasColumn('contracts', 'signed_at');
        $hasContractApprovedAt = Schema::hasColumn('contracts', 'approved_at');
        $hasContractValue = Schema::hasColumn('contracts', 'value');
        $hasContractRevenue = Schema::hasColumn('contracts', 'revenue');
        $hasContractCashFlow = Schema::hasColumn('contracts', 'cash_flow');
        $hasContractPaymentsTable = Schema::hasTable('contract_payments');
        $hasContractPaymentsPaidAt = $hasContractPaymentsTable && Schema::hasColumn('contract_payments', 'paid_at');
        $hasClientAssignedStaffId = Schema::hasColumn('clients', 'assigned_staff_id');
        $hasClientCreatedAt = Schema::hasColumn('clients', 'created_at');
        $hasOpportunityAssignedTo = Schema::hasColumn('opportunities', 'assigned_to');
        $hasOpportunityCreatedBy = Schema::hasColumn('opportunities', 'created_by');
        $hasOpportunityCreatedAt = Schema::hasColumn('opportunities', 'created_at');
        $hasUserDepartmentId = Schema::hasColumn('users', 'department_id');
        $hasUserDepartment = Schema::hasColumn('users', 'department');
        $hasUserAvatar = Schema::hasColumn('users', 'avatar_url');
        $hasUserActive = Schema::hasColumn('users', 'is_active');
        $hasProjectStatus = Schema::hasColumn('projects', 'status');
        $hasProjectServiceType = Schema::hasColumn('projects', 'service_type');
        $hasTaskStatus = Schema::hasColumn('tasks', 'status');
        $hasTaskDeadline = Schema::hasColumn('tasks', 'deadline');
        $hasTaskAssignee = Schema::hasColumn('tasks', 'assignee_id');
        $hasItemsTable = Schema::hasTable('contract_items');
        $hasItemTotalPrice = $hasItemsTable && Schema::hasColumn('contract_items', 'total_price');
        $hasItemProductName = $hasItemsTable && Schema::hasColumn('contract_items', 'product_name');
        $hasProductsTable = Schema::hasTable('products');
        $hasProductName = $hasProductsTable && Schema::hasColumn('products', 'name');

        $contractTimelineColumns = ['client_id', 'created_at'];
        if ($hasContractApprovedAt) {
            $contractTimelineColumns[] = 'approved_at';
        }
        if ($hasContractSignedAt) {
            $contractTimelineColumns[] = 'signed_at';
        }

        $employeeUserColumns = ['id', 'name', 'role'];
        if ($hasUserDepartmentId) {
            $employeeUserColumns[] = 'department_id';
        }
        if ($hasUserDepartment) {
            $employeeUserColumns[] = 'department';
        }
        if ($hasUserAvatar) {
            $employeeUserColumns[] = 'avatar_url';
        }
        if ($hasUserActive) {
            $employeeUserColumns[] = 'is_active';
        }

        $contractWithClientSelect = $hasClientAssignedStaffId ? 'client:id,assigned_staff_id' : 'client:id';
        $contractDateParts = [];
        if ($hasContractApprovedAt) {
            $contractDateParts[] = 'contracts.approved_at';
        }
        if ($hasContractSignedAt) {
            $contractDateParts[] = 'contracts.signed_at';
        }
        $contractDateExpr = ! empty($contractDateParts)
            ? ('DATE(COALESCE(' . implode(', ', $contractDateParts) . '))')
            : 'DATE(contracts.created_at)';

        $approvedContractsBaseQuery = (clone $contractBaseQuery)
            ->when($hasContractApprovalStatus, function ($query) {
                $query->where('approval_status', 'approved');
            });
        $now = now();
        $availableFromRaw = (clone $approvedContractsBaseQuery)
            ->selectRaw("MIN($contractDateExpr) as aggregate_date")
            ->value('aggregate_date');
        $availableToRaw = (clone $approvedContractsBaseQuery)
            ->selectRaw("MAX($contractDateExpr) as aggregate_date")
            ->value('aggregate_date');

        $availableFrom = $availableFromRaw
            ? Carbon::parse((string) $availableFromRaw)->startOfDay()
            : $now->copy()->startOfDay();
        $availableTo = $availableToRaw
            ? Carbon::parse((string) $availableToRaw)->endOfDay()
            : $now->copy()->endOfDay();

        $parseFilterDate = function ($value, bool $endOfDay = false): ?Carbon {
            if (! $value) {
                return null;
            }

            try {
                $date = Carbon::parse((string) $value);
            } catch (\Throwable $e) {
                return null;
            }

            return $endOfDay ? $date->endOfDay() : $date->startOfDay();
        };

        $requestedFrom = $parseFilterDate($request->input('from'));
        $requestedTo = $parseFilterDate($request->input('to'), true);

        $currentPeriodStart = ($requestedFrom ?: $now->copy()->startOfMonth())->copy();
        $currentPeriodEnd = ($requestedTo ?: $now->copy()->endOfMonth())->copy();

        if ($currentPeriodEnd->lt($currentPeriodStart)) {
            [$currentPeriodStart, $currentPeriodEnd] = [
                $currentPeriodEnd->copy()->startOfDay(),
                $currentPeriodStart->copy()->endOfDay(),
            ];
        }

        $periodDays = max(1, $currentPeriodStart->diffInDays($currentPeriodEnd) + 1);
        $previousPeriodEnd = $currentPeriodStart->copy()->subDay()->endOfDay();
        $previousPeriodStart = $previousPeriodEnd->copy()->subDays($periodDays - 1)->startOfDay();
        $samePeriodLastYearStart = $currentPeriodStart->copy()->subYear()->startOfDay();
        $samePeriodLastYearEnd = $currentPeriodEnd->copy()->subYear()->endOfDay();

        $isAllTime = $currentPeriodStart->toDateString() === $availableFrom->toDateString()
            && $currentPeriodEnd->toDateString() === $availableTo->toDateString();
        $currentPeriodLabel = $isAllTime
            ? 'Toàn thời gian'
            : ('Từ ' . $currentPeriodStart->format('d/m/Y') . ' đến ' . $currentPeriodEnd->format('d/m/Y'));

        $totalProjects = (clone $projectBaseQuery)->count();
        $inProgressProjects = $hasProjectStatus
            ? (clone $projectBaseQuery)->where('status', 'dang_trien_khai')->count()
            : 0;
        $pendingReviewProjects = $hasProjectStatus
            ? (clone $projectBaseQuery)->where('status', 'cho_duyet')->count()
            : 0;

        $totalTasks = (clone $taskBaseQuery)->count();
        $completedTasks = $hasTaskStatus
            ? (clone $taskBaseQuery)->whereIn('status', ['done'])->count()
            : 0;
        $overdueTasks = ($hasTaskDeadline && $hasTaskStatus)
            ? (clone $taskBaseQuery)
                ->whereNotNull('deadline')
                ->where('deadline', '<', now())
                ->whereNotIn('status', ['done'])
                ->count()
            : 0;

        $serviceBreakdown = collect();
        if ($hasProjectServiceType) {
            $serviceBreakdown = (clone $projectBaseQuery)
                ->selectRaw('service_type, COUNT(*) as total')
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
        }

        $onTimeRate = $totalTasks > 0
            ? round((($totalTasks - $overdueTasks) / $totalTasks) * 100, 1)
            : 0;

        $backlinkTotal = 0;
        $backlinkLive = 0;
        try {
            $backlinkTotal = ServiceBacklinkItem::count();
            $backlinkLive = ServiceBacklinkItem::whereIn('status', ['live', 'published', 'da_live'])->count();
        } catch (\Throwable $e) {
            // Keep dashboard stable when optional workflow tables are unavailable.
        }
        $backlinkPending = max(0, $backlinkTotal - $backlinkLive);

        $contentWords = 0;
        $seoScore = 0.0;
        try {
            $contentWords = (int) ServiceContentItem::sum('actual_words');
            $seoScore = (float) ServiceContentItem::avg('seo_score');
        } catch (\Throwable $e) {
            // Optional workflow table/column might be absent.
        }
        $seoScore = $seoScore > 0 ? round($seoScore, 1) : 0;

        $auditTotal = 0;
        $auditDone = 0;
        try {
            $auditTotal = ServiceAuditItem::count();
            $auditDone = ServiceAuditItem::where('status', 'done')->count();
        } catch (\Throwable $e) {
            // Optional workflow table/column might be absent.
        }
        $auditOpen = max(0, $auditTotal - $auditDone);

        $websiteTotal = 0;
        $websiteIndexed = 0;
        $websiteTraffic = 0;
        $websiteRanking = 0.0;
        try {
            $websiteTotal = ServiceWebsiteCareItem::count();
            $websiteIndexed = ServiceWebsiteCareItem::whereIn('index_status', ['indexed', 'ok', 'da_index'])
                ->count();
            $websiteTraffic = (int) ServiceWebsiteCareItem::avg('traffic');
            $websiteRanking = (float) ServiceWebsiteCareItem::avg('ranking_delta');
        } catch (\Throwable $e) {
            // Optional workflow table/column might be absent.
        }
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

        $recentLinks = collect();
        try {
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
        } catch (\Throwable $e) {
            $recentLinks = collect();
        }

        $employeeUsersQuery = User::query()
            ->whereIn('role', ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan']);
        if (! CrmScope::hasGlobalScope($viewer)) {
            if ($viewer->role === 'quan_ly') {
                $employeeUsersQuery->whereIn('id', CrmScope::managerVisibleUserIds($viewer)->all());
            } else {
                $employeeUsersQuery->where('id', $viewer->id);
            }
        }

        if ($hasUserDepartmentId) {
            $employeeUsersQuery->with('departmentRelation:id,name');
        }

        $employeeUsers = $employeeUsersQuery
            ->orderBy('name')
            ->get($employeeUserColumns);

        $visibleStaffIds = $employeeUsers
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values();
        $shouldLimitStaffMetrics = ! CrmScope::hasGlobalScope($viewer);
        $scopeMetricsToVisibleStaff = function (array $metrics) use ($visibleStaffIds, $shouldLimitStaffMetrics): array {
            if (! $shouldLimitStaffMetrics) {
                return $metrics;
            }

            $allowed = array_flip($visibleStaffIds->all());
            $filtered = [];
            foreach ($metrics as $staffId => $metric) {
                $staffKey = (int) $staffId;
                if (isset($allowed[$staffKey])) {
                    $filtered[$staffKey] = $metric;
                }
            }

            return $filtered;
        };

        $contractsForCurrentPeriod = (clone $contractBaseQuery)
            ->with($contractWithClientSelect)
            ->when($hasContractApprovalStatus, function ($query) {
                $query->where('approval_status', 'approved');
            })
            ->whereBetween(DB::raw($contractDateExpr), [
                $currentPeriodStart->toDateString(),
                $currentPeriodEnd->toDateString(),
            ])
            ->get();

        // Product breakdown from contract_items (revenue by product)
        $productBreakdown = collect();
        if ($hasItemsTable && $hasItemTotalPrice) {
            $periodContractIds = $contractsForCurrentPeriod->pluck('id')->all();
            if (! empty($periodContractIds)) {
                $productLabelExpr = "'Chưa gắn sản phẩm'";
                if ($hasProductsTable && $hasProductName && $hasItemProductName) {
                    $productLabelExpr = "COALESCE(products.name, contract_items.product_name, 'Chưa gắn sản phẩm')";
                } elseif ($hasItemProductName) {
                    $productLabelExpr = "COALESCE(contract_items.product_name, 'Chưa gắn sản phẩm')";
                }

                $productQuery = ContractItem::query()
                    ->whereIn('contract_items.contract_id', $periodContractIds);
                if ($hasProductsTable && $hasProductName) {
                    $productQuery->leftJoin('products', 'contract_items.product_id', '=', 'products.id');
                }

                $productBreakdown = $productQuery
                    ->selectRaw("$productLabelExpr as product_name")
                    ->selectRaw('SUM(contract_items.total_price) as revenue')
                    ->groupBy(DB::raw($productLabelExpr))
                    ->orderByDesc('revenue')
                    ->get()
                    ->map(function ($item) {
                        return [
                            'label' => (string) $item->product_name,
                            'value' => round((float) $item->revenue, 2),
                        ];
                    })
                    ->filter(function ($item) {
                        return $item['value'] > 0;
                    })
                    ->values();
            }
        }

        $contractsForPreviousPeriod = (clone $contractBaseQuery)
            ->with($contractWithClientSelect)
            ->when($hasContractApprovalStatus, function ($query) {
                $query->where('approval_status', 'approved');
            })
            ->whereBetween(DB::raw($contractDateExpr), [
                $previousPeriodStart->toDateString(),
                $previousPeriodEnd->toDateString(),
            ])
            ->get();

        $contractsForSamePeriodLastYear = (clone $contractBaseQuery)
            ->with($contractWithClientSelect)
            ->when($hasContractApprovalStatus, function ($query) {
                $query->where('approval_status', 'approved');
            })
            ->whereBetween(DB::raw($contractDateExpr), [
                $samePeriodLastYearStart->toDateString(),
                $samePeriodLastYearEnd->toDateString(),
            ])
            ->get();

        $resolveStaffId = function (Contract $contract): int {
            return (int) (
                $contract->collector_user_id
                ?: $contract->created_by
                ?: optional($contract->client)->assigned_staff_id
                ?: 0
            );
        };

        $aggregateRevenueByStaff = function ($contracts) use (
            $resolveStaffId,
            $hasContractValue,
            $hasContractRevenue,
            $hasContractCashFlow,
            $hasContractPaymentsPaidAt
        ): array {
            $totals = [];
            foreach ($contracts as $contract) {
                $staffId = $resolveStaffId($contract);
                if (! isset($totals[$staffId])) {
                    $totals[$staffId] = [
                        'revenue' => 0.0,
                        'cashflow' => 0.0,
                        'contracts_count' => 0,
                    ];
                }

                $contractRevenue = $hasContractValue ? (float) ($contract->getRawOriginal('value') ?? 0) : 0.0;
                $contractCashflow = 0.0;
                if (! $hasContractPaymentsPaidAt) {
                    $contractCashflow = $hasContractRevenue
                        ? (float) ($contract->getRawOriginal('revenue') ?? 0)
                        : ($hasContractCashFlow ? (float) ($contract->getRawOriginal('cash_flow') ?? 0) : 0.0);
                }

                $totals[$staffId]['revenue'] += $contractRevenue;
                $totals[$staffId]['cashflow'] += $contractCashflow;
                $totals[$staffId]['contracts_count'] += 1;
            }

            return $totals;
        };

        $currentStaffMetrics = $aggregateRevenueByStaff($contractsForCurrentPeriod);
        $previousStaffMetrics = $aggregateRevenueByStaff($contractsForPreviousPeriod);
        $samePeriodLastYearMetrics = $aggregateRevenueByStaff($contractsForSamePeriodLastYear);
        $periodCashflowTotal = 0.0;

        if ($hasContractPaymentsPaidAt) {
            $cashflowRows = ContractPayment::query()
                ->whereNotNull('paid_at')
                ->whereBetween(DB::raw('DATE(paid_at)'), [
                    $currentPeriodStart->toDateString(),
                    $currentPeriodEnd->toDateString(),
                ])
                ->whereIn('contract_id', (clone $approvedContractsBaseQuery)->select('contracts.id'))
                ->selectRaw('contract_id, SUM(amount) as total_amount')
                ->groupBy('contract_id')
                ->get();

            $cashflowContractLookup = collect();
            $cashflowContractIds = $cashflowRows
                ->pluck('contract_id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function ($id) {
                    return $id > 0;
                })
                ->unique()
                ->values()
                ->all();

            if (! empty($cashflowContractIds)) {
                $cashflowContractLookup = (clone $approvedContractsBaseQuery)
                    ->with($contractWithClientSelect)
                    ->whereIn('contracts.id', $cashflowContractIds)
                    ->get(['id', 'client_id', 'collector_user_id', 'created_by'])
                    ->keyBy('id');
            }

            foreach ($cashflowRows as $cashflowRow) {
                $contractId = (int) ($cashflowRow->contract_id ?? 0);
                if ($contractId <= 0) {
                    continue;
                }

                $contractModel = $cashflowContractLookup->get($contractId);
                if (! $contractModel instanceof Contract) {
                    continue;
                }

                $staffId = $resolveStaffId($contractModel);
                if (! isset($currentStaffMetrics[$staffId])) {
                    $currentStaffMetrics[$staffId] = [
                        'revenue' => 0.0,
                        'cashflow' => 0.0,
                        'contracts_count' => 0,
                    ];
                }

                $amount = (float) ($cashflowRow->total_amount ?? 0);
                $currentStaffMetrics[$staffId]['cashflow'] += $amount;
            }
        }

        $currentStaffMetrics = $scopeMetricsToVisibleStaff($currentStaffMetrics);
        $previousStaffMetrics = $scopeMetricsToVisibleStaff($previousStaffMetrics);
        $samePeriodLastYearMetrics = $scopeMetricsToVisibleStaff($samePeriodLastYearMetrics);

        $totalCurrentRevenue = collect($currentStaffMetrics)->sum('revenue');
        $periodCashflowTotal = (float) collect($currentStaffMetrics)->sum('cashflow');

        $newClientsByStaff = collect();
        if ($hasClientAssignedStaffId && $hasClientCreatedAt) {
            $newClientsByStaff = (clone $clientBaseQuery)
                ->selectRaw('assigned_staff_id as staff_id, COUNT(*) as total')
                ->whereNotNull('assigned_staff_id')
                ->whereBetween('created_at', [$currentPeriodStart, $currentPeriodEnd])
                ->groupBy('assigned_staff_id')
                ->pluck('total', 'staff_id');
        }

        $newOpportunitiesByStaff = collect();
        if ($hasOpportunityCreatedAt && $hasOpportunityAssignedTo && $hasOpportunityCreatedBy) {
            $newOpportunitiesByStaff = (clone $opportunityBaseQuery)
                ->selectRaw('COALESCE(assigned_to, created_by) as staff_id, COUNT(*) as total')
                ->whereRaw('COALESCE(assigned_to, created_by) IS NOT NULL')
                ->whereBetween('created_at', [$currentPeriodStart, $currentPeriodEnd])
                ->groupBy(DB::raw('COALESCE(assigned_to, created_by)'))
                ->pluck('total', 'staff_id');
        } elseif ($hasOpportunityCreatedAt && $hasOpportunityAssignedTo) {
            $newOpportunitiesByStaff = (clone $opportunityBaseQuery)
                ->selectRaw('assigned_to as staff_id, COUNT(*) as total')
                ->whereNotNull('assigned_to')
                ->whereBetween('created_at', [$currentPeriodStart, $currentPeriodEnd])
                ->groupBy('assigned_to')
                ->pluck('total', 'staff_id');
        } elseif ($hasOpportunityCreatedAt && $hasOpportunityCreatedBy) {
            $newOpportunitiesByStaff = (clone $opportunityBaseQuery)
                ->selectRaw('created_by as staff_id, COUNT(*) as total')
                ->whereNotNull('created_by')
                ->whereBetween('created_at', [$currentPeriodStart, $currentPeriodEnd])
                ->groupBy('created_by')
                ->pluck('total', 'staff_id');
        }

        $activeTasksByStaff = collect();
        if ($hasTaskAssignee && $hasTaskStatus) {
            $activeTasksByStaff = (clone $taskBaseQuery)
                ->selectRaw('assignee_id as staff_id, COUNT(*) as total')
                ->whereNotNull('assignee_id')
                ->whereNotIn('status', ['done'])
                ->groupBy('assignee_id')
                ->pluck('total', 'staff_id');
        }

        $percentageChange = function (float $current, float $previous): float {
            if ($previous <= 0.0) {
                return $current > 0.0 ? 100.0 : 0.0;
            }

            return round((($current - $previous) / $previous) * 100, 1);
        };

        $staffSalesBreakdown = $employeeUsers
            ->map(function (User $user) use ($currentStaffMetrics, $totalCurrentRevenue) {
                $metrics = $currentStaffMetrics[$user->id] ?? [
                    'revenue' => 0.0,
                    'cashflow' => 0.0,
                    'contracts_count' => 0,
                ];

                return [
                    'staff_id' => (int) $user->id,
                    'staff_name' => (string) ($user->name ?: 'Nhân sự'),
                    'avatar_url' => $user->avatar_url,
                    'revenue' => round((float) $metrics['revenue'], 2),
                    'cashflow' => round((float) $metrics['cashflow'], 2),
                    'contracts_count' => (int) $metrics['contracts_count'],
                    'share_percent' => $totalCurrentRevenue > 0
                        ? round((((float) $metrics['revenue']) / $totalCurrentRevenue) * 100, 1)
                        : 0.0,
                ];
            });

        $unassignedMetrics = $currentStaffMetrics[0] ?? null;
        if (
            is_array($unassignedMetrics)
            && (
                (float) ($unassignedMetrics['revenue'] ?? 0) > 0
                || (float) ($unassignedMetrics['cashflow'] ?? 0) > 0
                || (int) ($unassignedMetrics['contracts_count'] ?? 0) > 0
            )
        ) {
            $staffSalesBreakdown->push([
                'staff_id' => null,
                'staff_name' => 'Chưa gán nhân sự',
                'avatar_url' => null,
                'revenue' => round((float) ($unassignedMetrics['revenue'] ?? 0), 2),
                'cashflow' => round((float) ($unassignedMetrics['cashflow'] ?? 0), 2),
                'contracts_count' => (int) ($unassignedMetrics['contracts_count'] ?? 0),
                'share_percent' => $totalCurrentRevenue > 0
                    ? round((((float) ($unassignedMetrics['revenue'] ?? 0)) / $totalCurrentRevenue) * 100, 1)
                    : 0.0,
            ]);
        }

        $staffSalesBreakdown = $staffSalesBreakdown
            ->sortByDesc('revenue')
            ->take(8)
            ->values();

        $employeeStats = $employeeUsers
            ->map(function (User $user) use (
                $currentStaffMetrics,
                $previousStaffMetrics,
                $samePeriodLastYearMetrics,
                $newClientsByStaff,
                $newOpportunitiesByStaff,
                $activeTasksByStaff,
                $totalCurrentRevenue,
                $percentageChange,
                $hasUserDepartment,
                $hasUserDepartmentId,
                $hasUserAvatar,
                $hasUserActive
            ) {
                $currentRevenue = (float) ($currentStaffMetrics[$user->id]['revenue'] ?? 0);
                $previousRevenue = (float) ($previousStaffMetrics[$user->id]['revenue'] ?? 0);
                $samePeriodRevenue = (float) ($samePeriodLastYearMetrics[$user->id]['revenue'] ?? 0);
                $contractsCount = (int) ($currentStaffMetrics[$user->id]['contracts_count'] ?? 0);

                return [
                    'staff_id' => (int) $user->id,
                    'staff_name' => (string) ($user->name ?: 'Nhân sự'),
                    'role' => (string) ($user->role ?: 'user'),
                    'role_label' => $this->roleLabel((string) $user->role),
                    'department' => ($hasUserDepartmentId ? optional($user->departmentRelation)->name : null)
                        ?: ($hasUserDepartment ? ($user->department ?: '—') : '—'),
                    'avatar_url' => $hasUserAvatar ? $user->avatar_url : null,
                    'revenue' => round($currentRevenue, 2),
                    'share_percent' => $totalCurrentRevenue > 0
                        ? round(($currentRevenue / $totalCurrentRevenue) * 100, 1)
                        : 0.0,
                    'growth_percent' => $percentageChange($currentRevenue, $previousRevenue),
                    'same_period_percent' => $percentageChange($currentRevenue, $samePeriodRevenue),
                    'new_clients' => (int) ($newClientsByStaff[$user->id] ?? 0),
                    'new_opportunities' => (int) ($newOpportunitiesByStaff[$user->id] ?? 0),
                    'new_contracts' => $contractsCount,
                    'active_tasks' => (int) ($activeTasksByStaff[$user->id] ?? 0),
                    'is_active' => $hasUserActive ? (bool) $user->is_active : true,
                ];
            })
            ->sortByDesc('revenue')
            ->values();

        $customerGrowthAnchor = $currentPeriodEnd->copy()->startOfMonth();
        $customerGrowthPeriods = collect(range(11, 0))
            ->map(function ($monthsAgo) use ($customerGrowthAnchor) {
                $point = $customerGrowthAnchor->copy()->subMonths($monthsAgo);
                return [
                    'key' => $point->format('Y-m'),
                    'label' => 'T' . $point->format('m'),
                    'start' => $point->copy()->startOfMonth(),
                    'end' => $point->copy()->endOfMonth(),
                ];
            })
            ->values();

        $customerGrowthSeed = $customerGrowthPeriods->mapWithKeys(function ($period) {
            return [
                $period['key'] => [
                    'label' => $period['label'],
                    'first_purchase' => 0,
                    'repeat_purchase' => 0,
                    'created_clients' => 0,
                ],
            ];
        })->all();

        $createdClientsTimeline = collect();
        if ($hasClientCreatedAt) {
            $createdClientsTimeline = (clone $clientBaseQuery)
                ->whereBetween('created_at', [
                    $customerGrowthPeriods->first()['start'],
                    $customerGrowthPeriods->last()['end'],
                ])
                ->get(['created_at']);
        }

        foreach ($createdClientsTimeline as $client) {
            $key = optional($client->created_at)->format('Y-m');
            if ($key && isset($customerGrowthSeed[$key])) {
                $customerGrowthSeed[$key]['created_clients'] += 1;
            }
        }

        $approvedContractsTimeline = (clone $contractBaseQuery)
            ->when($hasContractApprovalStatus, function ($query) {
                $query->where('approval_status', 'approved');
            })
            ->whereBetween(DB::raw($contractDateExpr), [
                $customerGrowthPeriods->first()['start'],
                $customerGrowthPeriods->last()['end'],
            ])
            ->orderBy('client_id')
            ->orderBy(DB::raw($contractDateExpr))
            ->get($contractTimelineColumns);

        $seenClientFirstContract = [];
        foreach ($approvedContractsTimeline as $contract) {
            $contractAt = $contract->approved_at
                ?: $contract->signed_at
                ?: $contract->created_at;
            $key = optional($contractAt)->format('Y-m');
            if (! $key || ! isset($customerGrowthSeed[$key])) {
                continue;
            }

            $clientId = (int) ($contract->client_id ?: 0);
            if ($clientId > 0 && ! isset($seenClientFirstContract[$clientId])) {
                $seenClientFirstContract[$clientId] = true;
                $customerGrowthSeed[$key]['first_purchase'] += 1;
            } else {
                $customerGrowthSeed[$key]['repeat_purchase'] += 1;
            }
        }

        $customerGrowth = $customerGrowthPeriods
            ->map(function ($period) use ($customerGrowthSeed) {
                $row = $customerGrowthSeed[$period['key']];
                return [
                    'label' => $row['label'],
                    'first_purchase' => $row['first_purchase'],
                    'repeat_purchase' => $row['repeat_purchase'],
                    'created_clients' => $row['created_clients'],
                ];
            })
            ->values();

        $employeeRoleBreakdownQuery = User::query()
            ->whereIn('role', ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'])
            ->when(! CrmScope::hasGlobalScope($viewer), function ($query) use ($viewer) {
                if ($viewer->role === 'quan_ly') {
                    $query->whereIn('id', CrmScope::managerVisibleUserIds($viewer)->all());
                } else {
                    $query->where('id', $viewer->id);
                }
            });

        $employeeRoleBreakdown = $employeeRoleBreakdownQuery
            ->selectRaw('role, COUNT(*) as total')
            ->groupBy('role')
            ->orderByDesc('total')
            ->get()
            ->map(function ($item) {
                return [
                    'label' => $this->roleLabel((string) $item->role),
                    'value' => (int) $item->total,
                ];
            })
            ->values();

        $activeEmployeeCount = $hasUserActive
            ? (int) $employeeUsers->where('is_active', true)->count()
            : (int) $employeeUsers->count();

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
            'product_breakdown' => $productBreakdown,
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
            'staff_sales_breakdown' => $staffSalesBreakdown,
            'period_revenue_total' => round((float) $totalCurrentRevenue, 2),
            'period_cashflow_total' => round((float) $periodCashflowTotal, 2),
            'period_contracts_total' => (int) collect($currentStaffMetrics)->sum('contracts_count'),
            'customer_growth' => $customerGrowth,
            'employee_stats' => $employeeStats,
            'employee_role_breakdown' => $employeeRoleBreakdown,
            'employee_summary' => [
                'total' => (int) $employeeUsers->count(),
                'active' => $activeEmployeeCount,
                'managers' => (int) $employeeUsers->where('role', 'quan_ly')->count(),
                'staff' => (int) $employeeUsers->where('role', 'nhan_vien')->count(),
            ],
            'period' => [
                'current_label' => $currentPeriodLabel,
                'current_from' => $currentPeriodStart->toDateString(),
                'current_to' => $currentPeriodEnd->toDateString(),
                'available_from' => $availableFrom->toDateString(),
                'available_to' => $availableTo->toDateString(),
            ],
        ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'projects' => [
                    'total' => 0,
                    'in_progress' => 0,
                    'pending_review' => 0,
                ],
                'tasks' => [
                    'total' => 0,
                    'completed' => 0,
                    'overdue' => 0,
                    'on_time_rate' => 0,
                ],
                'service_breakdown' => [],
                'product_breakdown' => [],
                'projects_total' => 0,
                'projects_in_progress' => 0,
                'projects_pending_review' => 0,
                'tasks_total' => 0,
                'tasks_overdue' => 0,
                'on_time_rate' => 0,
                'links_total' => 0,
                'links_live' => 0,
                'links_pending' => 0,
                'content_words' => 0,
                'seo_score' => 0,
                'audit_total' => 0,
                'audit_done' => 0,
                'audit_open' => 0,
                'website_total' => 0,
                'website_indexed' => 0,
                'website_traffic_avg' => 0,
                'website_ranking_avg' => 0,
                'da_buckets' => [],
                'recent_links' => [],
                'staff_sales_breakdown' => [],
                'period_revenue_total' => 0,
                'period_cashflow_total' => 0,
                'period_contracts_total' => 0,
                'customer_growth' => [],
                'employee_stats' => [],
                'employee_role_breakdown' => [],
                'employee_summary' => [
                    'total' => 0,
                    'active' => 0,
                    'managers' => 0,
                    'staff' => 0,
                ],
                'period' => [
                    'current_label' => 'Toàn thời gian',
                    'current_from' => now()->toDateString(),
                    'current_to' => now()->toDateString(),
                    'available_from' => now()->toDateString(),
                    'available_to' => now()->toDateString(),
                ],
            ]);
        }
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
        try {
            $targetRevenue = (float) $request->query('target_revenue', 0);
            $contractsTable = 'contracts';
            $contractItemsTable = 'contract_items';
            $contractPaymentsTable = 'contract_payments';
            $contractCostsTable = 'contract_costs';
            $productsTable = 'products';
            $usersTable = 'users';

            $hasContractSignedAt = Schema::hasColumn($contractsTable, 'signed_at');
            $hasContractApprovedAt = Schema::hasColumn($contractsTable, 'approved_at');
            $hasContractCollector = Schema::hasColumn($contractsTable, 'collector_user_id');
            $hasContractCreatedBy = Schema::hasColumn($contractsTable, 'created_by');
            $hasContractApprovalStatus = Schema::hasColumn($contractsTable, 'approval_status');
            $hasContractValue = Schema::hasColumn($contractsTable, 'value');
            $hasPaymentsTable = Schema::hasTable($contractPaymentsTable);
            $hasPaymentsPaidAt = $hasPaymentsTable && Schema::hasColumn($contractPaymentsTable, 'paid_at');
            $hasCostsTable = Schema::hasTable($contractCostsTable);
            $hasCostsDate = $hasCostsTable && Schema::hasColumn($contractCostsTable, 'cost_date');
            $hasItemsTable = Schema::hasTable($contractItemsTable);
            $hasItemTotalPrice = $hasItemsTable && Schema::hasColumn($contractItemsTable, 'total_price');
            $hasItemProductName = $hasItemsTable && Schema::hasColumn($contractItemsTable, 'product_name');
            $hasProductsTable = Schema::hasTable($productsTable);
            $hasProductName = $hasProductsTable && Schema::hasColumn($productsTable, 'name');
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
            $latestPaymentDate = ($hasPaymentsTable && $hasPaymentsPaidAt)
                ? ContractPayment::query()
                    ->join('contracts', 'contract_payments.contract_id', '=', 'contracts.id')
                    ->when($hasContractApprovalStatus, function ($query) {
                        $query->where('contracts.approval_status', 'approved');
                    })
                    ->whereNotNull('contract_payments.paid_at')
                    ->max('contract_payments.paid_at')
                : null;
            $latestCostDate = ($hasCostsTable && $hasCostsDate)
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

            $periodCashflowByDate = [];
            $periodPaymentRows = collect();
            if ($hasPaymentsTable && $hasPaymentsPaidAt) {
                $periodPaymentRows = ContractPayment::query()
                    ->join('contracts', 'contract_payments.contract_id', '=', 'contracts.id')
                    ->when($hasContractApprovalStatus, function ($query) {
                        $query->where('contracts.approval_status', 'approved');
                    })
                    ->whereNotNull('contract_payments.paid_at')
                    ->whereBetween(DB::raw('DATE(contract_payments.paid_at)'), [$startDate, $endDate])
                    ->selectRaw('contract_payments.contract_id, DATE(contract_payments.paid_at) as paid_date, SUM(contract_payments.amount) as amount')
                    ->groupBy('contract_payments.contract_id', DB::raw('DATE(contract_payments.paid_at)'))
                    ->get();

                $periodCashflowTotal = 0.0;
                foreach ($periodPaymentRows as $paymentRow) {
                    $paidDate = (string) ($paymentRow->paid_date ?? '');
                    $amount = (float) ($paymentRow->amount ?? 0);
                    if ($paidDate === '') {
                        continue;
                    }
                    $periodCashflowByDate[$paidDate] = (float) ($periodCashflowByDate[$paidDate] ?? 0) + $amount;
                    $periodCashflowTotal += $amount;
                }

                $periodTotals['cashflow'] = $periodCashflowTotal;
            }

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
                $dailyMetrics[$dateKey]['costs'] += $costsTotal;
                $dailyMetrics[$dateKey]['debt'] += max(0, $contractValue - $paymentsTotal);
            }

            foreach ($periodCashflowByDate as $paidDate => $amount) {
                if (! isset($dailyMetrics[$paidDate])) {
                    $dailyMetrics[$paidDate] = [
                        'revenue' => 0.0,
                        'cashflow' => 0.0,
                        'debt' => 0.0,
                        'costs' => 0.0,
                    ];
                }
                $dailyMetrics[$paidDate]['cashflow'] += (float) $amount;
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
                $productLabelExpr = "'Chưa gắn sản phẩm'";
                if ($hasProductsTable && $hasProductName && $hasItemProductName) {
                    $productLabelExpr = "COALESCE(products.name, contract_items.product_name, 'Chưa gắn sản phẩm')";
                } elseif ($hasItemProductName) {
                    $productLabelExpr = "COALESCE(contract_items.product_name, 'Chưa gắn sản phẩm')";
                }

                $productQuery = ContractItem::query()
                    ->whereIn('contract_items.contract_id', $periodContractIds);
                if ($hasProductsTable && $hasProductName) {
                    $productQuery->leftJoin('products', 'contract_items.product_id', '=', 'products.id');
                }

                $productBreakdown = $productQuery
                    ->selectRaw("$productLabelExpr as product_name")
                    ->selectRaw('SUM(contract_items.total_price) as revenue')
                    ->groupBy(DB::raw($productLabelExpr))
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
            $contractStaffMap = [];
            foreach ($lifetimeContracts as $contract) {
                $contractStaffMap[(int) $contract->id] = (int) ($contract->collector_user_id ?: $contract->created_by ?: 0);
            }
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
                $staffMetrics[$staffId]['costs'] += $costsTotal;
                $staffMetrics[$staffId]['debt'] += max(0, $contractValue - $paymentsTotal);
                $staffMetrics[$staffId]['contracts_count'] += 1;
            }

            foreach ($periodPaymentRows as $paymentRow) {
                $contractId = (int) ($paymentRow->contract_id ?? 0);
                $staffId = (int) ($contractStaffMap[$contractId] ?? 0);
                if (! isset($staffMetrics[$staffId])) {
                    $staffMetrics[$staffId] = [
                        'revenue' => 0.0,
                        'cashflow' => 0.0,
                        'debt' => 0.0,
                        'costs' => 0.0,
                        'contracts_count' => 0,
                    ];
                }
                $staffMetrics[$staffId]['cashflow'] += (float) ($paymentRow->amount ?? 0);
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
                    'avatar_url' => $hasUserAvatar ? $staff->avatar_url : null,
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
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'Không thể tải báo cáo doanh thu công ty.',
                'error' => class_basename($e),
                'debug' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
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

    private function roleLabel(string $role): string
    {
        switch ($role) {
            case 'admin':
                return 'Admin';
            case 'administrator':
                return 'Administrator';
            case 'quan_ly':
                return 'Quản lý';
            case 'nhan_vien':
                return 'Nhân viên';
            case 'ke_toan':
                return 'Kế toán';
            default:
                return $role ?: 'Người dùng';
        }
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
