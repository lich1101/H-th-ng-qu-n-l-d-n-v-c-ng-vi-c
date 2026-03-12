<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ServiceBacklinkItem;
use App\Models\ServiceAuditItem;
use App\Models\ServiceContentItem;
use App\Models\ServiceWebsiteCareItem;
use App\Models\Task;
use Illuminate\Http\JsonResponse;

class ReportController extends Controller
{
    public function dashboardSummary(): JsonResponse
    {
        $totalProjects = Project::count();
        $inProgressProjects = Project::where('status', 'dang_trien_khai')->count();
        $pendingReviewProjects = Project::where('status', 'cho_duyet')->count();

        $totalTasks = Task::count();
        $completedTasks = Task::whereIn('status', ['done', 'hoan_tat_ban_giao'])->count();
        $overdueTasks = Task::whereNotNull('deadline')
            ->where('deadline', '<', now())
            ->whereNotIn('status', ['done', 'hoan_tat_ban_giao'])
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
}
