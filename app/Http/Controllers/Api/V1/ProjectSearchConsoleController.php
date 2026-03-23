<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\ProjectScope;
use App\Models\AppSetting;
use App\Models\Project;
use App\Models\ProjectGscDailyStat;
use App\Services\ProjectGscSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectSearchConsoleController extends Controller
{
    public function show(Project $project, Request $request, ProjectGscSyncService $syncService): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem dữ liệu dự án.'], 403);
        }

        $setting = AppSetting::query()->first();
        $siteUrl = $syncService->normalizeSiteUrl($project->website_url);
        $hasCredentials = $setting
            ? trim((string) $setting->gsc_client_id) !== ''
                && trim((string) $setting->gsc_client_secret) !== ''
                && trim((string) $setting->gsc_refresh_token) !== ''
            : false;
        $enabled = $setting ? (bool) ($setting->gsc_enabled ?? false) : false;
        $canSync = $siteUrl && $enabled && $hasCredentials;

        $syncError = null;
        if ($request->boolean('refresh', true) && $canSync) {
            try {
                $syncService->syncProject($project, $request->boolean('force', false));
            } catch (\Throwable $e) {
                $syncError = $e->getMessage();
            }
        }

        $latest = $syncService->latest($project);
        $trendDays = (int) $request->input('days', 21);
        $trend = $syncService->trend($project, $trendDays);

        $summary = $this->buildSummary($trend);

        return response()->json([
            'status' => [
                'project_has_website' => (bool) $siteUrl,
                'gsc_enabled' => $enabled,
                'gsc_credentials_ready' => $hasCredentials,
                'can_sync' => (bool) $canSync,
                'sync_time' => $setting ? (string) ($setting->gsc_sync_time ?: '11:17') : '11:17',
                'sync_error' => $syncError,
            ],
            'project' => [
                'id' => (int) $project->id,
                'website_url' => $siteUrl ?: null,
            ],
            'latest' => $this->transformLatest($latest),
            'trend' => $trend,
            'summary' => $summary,
        ]);
    }

    public function sync(Project $project, Request $request, ProjectGscSyncService $syncService): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền đồng bộ dữ liệu dự án này.'], 403);
        }

        try {
            $latest = $syncService->syncProject($project, true);
            if (! $latest) {
                return response()->json([
                    'message' => 'Chưa thể đồng bộ. Kiểm tra URL website dự án và cấu hình GSC trong Cài đặt hệ thống.',
                ], 422);
            }
            return response()->json([
                'message' => 'Đã đồng bộ Google Search Console cho dự án.',
                'latest' => $this->transformLatest($latest),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage() ?: 'Đồng bộ Google Search Console thất bại.',
            ], 422);
        }
    }

    private function transformLatest(?ProjectGscDailyStat $row): ?array
    {
        if (! $row) {
            return null;
        }

        return [
            'metric_date' => optional($row->metric_date)->toDateString(),
            'prior_date' => optional($row->prior_date)->toDateString(),
            'site_url' => (string) $row->site_url,
            'last_clicks' => (int) ($row->last_clicks ?? 0),
            'prior_clicks' => (int) ($row->prior_clicks ?? 0),
            'delta_clicks' => (int) ($row->delta_clicks ?? 0),
            'delta_clicks_percent' => $row->delta_clicks_percent !== null ? (float) $row->delta_clicks_percent : null,
            'last_impressions' => (int) ($row->last_impressions ?? 0),
            'prior_impressions' => (int) ($row->prior_impressions ?? 0),
            'delta_impressions' => (int) ($row->delta_impressions ?? 0),
            'last_ctr' => $row->last_ctr !== null ? (float) $row->last_ctr : null,
            'prior_ctr' => $row->prior_ctr !== null ? (float) $row->prior_ctr : null,
            'delta_ctr' => $row->delta_ctr !== null ? (float) $row->delta_ctr : null,
            'last_avg_position' => $row->last_avg_position !== null ? (float) $row->last_avg_position : null,
            'prior_avg_position' => $row->prior_avg_position !== null ? (float) $row->prior_avg_position : null,
            'delta_avg_position' => $row->delta_avg_position !== null ? (float) $row->delta_avg_position : null,
            'alerts_brand' => (int) ($row->alerts_brand ?? 0),
            'alerts_brand_recipes' => (int) ($row->alerts_brand_recipes ?? 0),
            'alerts_recipes' => (int) ($row->alerts_recipes ?? 0),
            'alerts_nonbrand' => (int) ($row->alerts_nonbrand ?? 0),
            'alerts_total' => (int) ($row->alerts_total ?? 0),
            'segment_totals' => is_array($row->segment_totals) ? $row->segment_totals : [],
            'top_movers' => is_array($row->top_movers) ? $row->top_movers : [],
            'updated_at' => optional($row->updated_at)->toIso8601String(),
        ];
    }

    private function buildSummary(array $trend): array
    {
        if (empty($trend)) {
            return [
                'days' => 0,
                'total_clicks' => 0,
                'total_impressions' => 0,
                'total_alerts' => 0,
                'avg_clicks_per_day' => 0,
                'avg_impressions_per_day' => 0,
            ];
        }

        $days = count($trend);
        $totalClicks = 0;
        $totalImpressions = 0;
        $totalAlerts = 0;

        foreach ($trend as $row) {
            $totalClicks += (int) ($row['clicks'] ?? 0);
            $totalImpressions += (int) ($row['impressions'] ?? 0);
            $totalAlerts += (int) ($row['alerts_total'] ?? 0);
        }

        return [
            'days' => $days,
            'total_clicks' => $totalClicks,
            'total_impressions' => $totalImpressions,
            'total_alerts' => $totalAlerts,
            'avg_clicks_per_day' => round($totalClicks / max(1, $days), 2),
            'avg_impressions_per_day' => round($totalImpressions / max(1, $days), 2),
        ];
    }
}
