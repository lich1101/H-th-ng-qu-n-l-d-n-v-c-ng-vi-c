<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ServiceBacklinkItem;
use App\Models\ServiceAuditItem;
use App\Models\ServiceContentItem;
use App\Models\ServiceWebsiteCareItem;
use App\Models\Task;
use App\Models\DepartmentAssignment;
use App\Models\Department;
use App\Models\Contract;
use App\Models\User;
use Illuminate\Http\JsonResponse;

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
            'departments' => $rows,
            'contracts_total' => $contractsTotal,
            'staffs' => $staffRows,
        ]);
    }

    public function companyRevenue(): JsonResponse
    {
        $approved = Contract::query()->where('approval_status', 'approved');

        $totalRevenue = (float) $approved->sum('value');
        $contractsTotal = (int) $approved->count();

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

        return response()->json([
            'total_revenue' => round($totalRevenue, 2),
            'contracts_total' => $contractsTotal,
            'monthly' => $monthlyRows,
            'top_customers' => $topCustomers,
        ]);
    }
}
