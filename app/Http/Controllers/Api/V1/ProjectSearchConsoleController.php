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
use Illuminate\Support\Carbon;

class ProjectSearchConsoleController extends Controller
{
    public function show(Project $project, Request $request, ProjectGscSyncService $syncService): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem dữ liệu dự án.'], 403);
        }

        $payload = $this->buildPayload($project, $request, $syncService);

        return response()->json($payload);
    }

    public function updateNotification(Project $project, Request $request, ProjectGscSyncService $syncService): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền thao tác dữ liệu dự án.'], 403);
        }

        if (! $this->canManageProjectGsc($request, $project)) {
            return response()->json(['message' => 'Không có quyền bật/tắt thông báo Google Search Console của dự án này.'], 403);
        }

        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $enabled = (bool) $validated['enabled'];

        if (! $enabled) {
            $project->forceFill([
                'gsc_notify_enabled' => false,
            ])->save();

            return response()->json([
                'message' => 'Đã tắt thông báo Google Search Console cho dự án.',
                'data' => $this->buildPayload($project->fresh(), $request, $syncService),
            ]);
        }

        $check = $syncService->canEnableNotificationsForProject($project);
        if (! (bool) ($check['ok'] ?? false)) {
            $errorMessage = trim((string) ($check['message'] ?? 'URL website chưa truy cập được trên Google Search Console.'));
            if ($errorMessage === '') {
                $errorMessage = 'URL website chưa truy cập được trên Google Search Console.';
            }

            $project->forceFill([
                'gsc_notify_enabled' => false,
                'gsc_notify_last_error' => $errorMessage,
            ])->save();

            return response()->json([
                'message' => $errorMessage,
                'data' => $this->buildPayload($project->fresh(), $request, $syncService, [
                    'validation_error' => $errorMessage,
                ]),
            ], 422);
        }

        $project->forceFill([
            'gsc_notify_enabled' => true,
            'gsc_notify_last_error' => null,
            'gsc_tracking_started_at' => $project->gsc_tracking_started_at ?: Carbon::now('Asia/Ho_Chi_Minh')->toDateString(),
        ])->save();

        return response()->json([
            'message' => 'Đã bật thông báo Google Search Console cho dự án.',
            'data' => $this->buildPayload($project->fresh(), $request, $syncService, [
                'skip_validation' => true,
            ]),
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

    private function buildPayload(
        Project $project,
        Request $request,
        ProjectGscSyncService $syncService,
        array $overrides = []
    ): array {
        $setting = AppSetting::query()->first();
        $websiteDomain = $syncService->normalizeStoredWebsiteDomain($project->website_url);
        $siteUrl = $syncService->resolveGscApiSiteUrl($project->website_url);

        $hasCredentials = $setting
            ? trim((string) $setting->gsc_client_id) !== ''
                && trim((string) $setting->gsc_client_secret) !== ''
                && trim((string) $setting->gsc_refresh_token) !== ''
            : false;
        $enabledSystem = $setting ? (bool) ($setting->gsc_enabled ?? false) : false;
        $canUseSystem = (bool) ($siteUrl && $enabledSystem && $hasCredentials);

        $validationError = (string) ($overrides['validation_error'] ?? '');
        $skipValidation = (bool) ($overrides['skip_validation'] ?? false);
        if ($validationError === '' && ! $skipValidation && $request->boolean('validate', true) && $canUseSystem) {
            $check = $syncService->canEnableNotificationsForProject($project);
            if (! (bool) ($check['ok'] ?? false)) {
                $validationError = trim((string) ($check['message'] ?? ''));
            }
        }

        $storedError = trim((string) ($project->gsc_notify_last_error ?? ''));
        $syncError = trim($validationError !== '' ? $validationError : $storedError);

        $enableBlockReason = '';
        if (! $websiteDomain || ! $siteUrl) {
            $enableBlockReason = 'Dự án chưa có URL website hợp lệ.';
        } elseif (! $enabledSystem) {
            $enableBlockReason = 'Google Search Console đang tắt trong Cài đặt hệ thống.';
        } elseif (! $hasCredentials) {
            $enableBlockReason = 'Thiếu thông tin xác thực Google Search Console trong Cài đặt hệ thống.';
        } elseif ($validationError !== '') {
            $enableBlockReason = $validationError;
        }

        $latest = $syncService->latest($project);

        $trackingStart = $project->gsc_tracking_started_at
            ? $project->gsc_tracking_started_at->toDateString()
            : null;

        if (! $trackingStart) {
            $firstDate = ProjectGscDailyStat::query()
                ->where('project_id', $project->id)
                ->orderBy('metric_date')
                ->value('metric_date');
            if ($firstDate) {
                $trackingStart = Carbon::parse($firstDate, 'Asia/Ho_Chi_Minh')->toDateString();
            }
        }

        $defaultDays = max(30, (int) $request->input('days', 120));
        if ($trackingStart) {
            $daysFromTracking = Carbon::parse($trackingStart, 'Asia/Ho_Chi_Minh')->diffInDays(Carbon::now('Asia/Ho_Chi_Minh')) + 1;
            $defaultDays = max($defaultDays, $daysFromTracking);
        }

        $trend = $syncService->trend($project, $defaultDays, $trackingStart);
        $summary = $this->buildSummary($trend);

        $projectNotifyEnabled = (bool) ($project->gsc_notify_enabled ?? false);
        $canEnableNotification = $enableBlockReason === '';
        $canManageNotification = $this->canManageProjectGsc($request, $project);

        return [
            'status' => [
                'project_has_website' => (bool) $websiteDomain,
                'gsc_enabled' => $enabledSystem,
                'gsc_credentials_ready' => $hasCredentials,
                'can_sync' => $canUseSystem,
                'sync_time' => $setting ? (string) ($setting->gsc_sync_time ?: '11:17') : '11:17',
                'project_notify_enabled' => $projectNotifyEnabled,
                'can_manage_notification' => $canManageNotification,
                'can_enable_notification' => $canEnableNotification,
                'can_disable_notification' => $projectNotifyEnabled,
                'enable_block_reason' => $enableBlockReason !== '' ? $enableBlockReason : null,
                'sync_error' => $syncError !== '' ? $syncError : null,
                'tracking_started_at' => $trackingStart,
                'last_synced_at' => $project->gsc_last_synced_at
                    ? $project->gsc_last_synced_at->toIso8601String()
                    : optional($latest?->updated_at)->toIso8601String(),
            ],
            'project' => [
                'id' => (int) $project->id,
                'website_url' => $websiteDomain ?: null,
                'gsc_property_url' => $siteUrl ?: null,
            ],
            'latest' => $this->transformLatest($latest),
            'trend' => $trend,
            'summary' => $summary,
        ];
    }

    private function canManageProjectGsc(Request $request, Project $project): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }

        if (in_array((string) $user->role, ['admin', 'quan_ly'], true)) {
            return true;
        }

        if ((int) ($project->owner_id ?? 0) === (int) $user->id) {
            return true;
        }

        $collectorId = ProjectScope::projectCollectorId($project);
        if ($collectorId > 0 && (int) $collectorId === (int) $user->id) {
            return true;
        }

        $contractCreatorId = $project->relationLoaded('contract')
            ? (int) optional($project->contract)->created_by
            : (int) $project->contract()->value('created_by');

        return $contractCreatorId > 0 && $contractCreatorId === (int) $user->id;
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
