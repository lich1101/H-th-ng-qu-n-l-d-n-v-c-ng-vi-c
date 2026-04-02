<?php

namespace App\Console\Commands;

use App\Http\Helpers\ProjectScope;
use App\Models\AppSetting;
use App\Models\Project;
use App\Models\ProjectGscDailyStat;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\ProjectGscSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SyncProjectSearchConsoleStats extends Command
{
    protected $signature = 'gsc:sync-projects {--project_id=} {--force}';
    protected $description = 'Đồng bộ dữ liệu Google Search Console theo ngày cho các dự án đã bật thông báo GSC.';

    public function handle(ProjectGscSyncService $syncService): int
    {
        $setting = AppSetting::query()->first();
        if (! $syncService->canSync($setting)) {
            $this->line('GSC sync skipped: chưa bật hoặc chưa cấu hình credential.');
            return self::SUCCESS;
        }

        $projectId = (int) $this->option('project_id');
        $force = (bool) $this->option('force');

        if ($projectId > 0) {
            $project = Project::query()->find($projectId);
            if (! $project) {
                $this->error("Không tìm thấy project_id={$projectId}.");
                return self::FAILURE;
            }

            try {
                $latest = $syncService->syncProject($project, true);
                if (! $latest) {
                    $this->warn("Dự án #{$projectId} chưa đủ điều kiện đồng bộ GSC.");
                    return self::FAILURE;
                }
                $this->notifyDailyDelta($project, $latest);
                $this->info("Đã đồng bộ GSC cho dự án #{$projectId}.");
                return self::SUCCESS;
            } catch (\Throwable $e) {
                $this->error('Đồng bộ thất bại: '.$e->getMessage());
                return self::FAILURE;
            }
        }

        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $syncTime = trim((string) ($setting->gsc_sync_time ?? '11:17'));
        if (! $force && ! $this->matchesTime($now, $syncTime)) {
            return self::SUCCESS;
        }

        $projects = Project::query()
            ->with(['contract:id,collector_user_id,created_by'])
            ->where('gsc_notify_enabled', true)
            ->whereNotNull('website_url')
            ->where('website_url', '!=', '')
            ->orderBy('id')
            ->get();

        if ($projects->isEmpty()) {
            $this->line('Không có dự án nào bật thông báo GSC để đồng bộ.');
            return self::SUCCESS;
        }

        $ok = 0;
        $failed = 0;
        foreach ($projects as $project) {
            try {
                $latest = $syncService->syncProject($project, false);
                if ($latest) {
                    $this->notifyDailyDelta($project, $latest);
                    $ok++;
                } else {
                    $failed++;
                    $this->warn(sprintf('Dự án #%d chưa đủ điều kiện đồng bộ GSC.', (int) $project->id));
                }
            } catch (\Throwable $e) {
                $failed++;
                $this->warn(sprintf('Dự án #%d lỗi: %s', (int) $project->id, $e->getMessage()));
            }
        }

        $this->info("GSC sync hoàn tất. Thành công: {$ok}. Lỗi: {$failed}.");
        return self::SUCCESS;
    }

    private function matchesTime(Carbon $now, string $configured): bool
    {
        if (! preg_match('/^\d{2}:\d{2}$/', $configured)) {
            return false;
        }

        return $now->format('H:i') === $configured;
    }

    private function notifyDailyDelta(Project $project, ProjectGscDailyStat $latest): void
    {
        $targetIds = $this->notificationTargetIds($project);
        if (empty($targetIds)) {
            return;
        }

        $metricDate = $latest->metric_date
            ? $latest->metric_date->format('d/m/Y')
            : Carbon::now('Asia/Ho_Chi_Minh')->subDay()->format('d/m/Y');

        $deltaClicks = (int) ($latest->delta_clicks ?? 0);
        $deltaImpressions = (int) ($latest->delta_impressions ?? 0);
        $alertsTotal = (int) ($latest->alerts_total ?? 0);

        $title = 'Biến động Google Search Console dự án';
        $body = sprintf(
            '%s • %s • Clicks %s%d • Impressions %s%d • Alerts %d',
            (string) ($project->name ?: 'Dự án'),
            $metricDate,
            $deltaClicks >= 0 ? '+' : '',
            $deltaClicks,
            $deltaImpressions >= 0 ? '+' : '',
            $deltaImpressions,
            $alertsTotal
        );

        app(NotificationService::class)->notifyUsersAfterResponse(
            $targetIds,
            $title,
            $body,
            [
                'type' => 'project_gsc_daily_report',
                'project_id' => (int) $project->id,
                'metric_date' => optional($latest->metric_date)->toDateString(),
                'delta_clicks' => $deltaClicks,
                'delta_impressions' => $deltaImpressions,
                'alerts_total' => $alertsTotal,
                'dedupe_seconds' => 3600,
            ]
        );
    }

    private function notificationTargetIds(Project $project): array
    {
        $ids = User::query()
            ->whereIn('role', ['admin', 'administrator'])
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();

        if ((int) ($project->owner_id ?? 0) > 0) {
            $ids[] = (int) $project->owner_id;
        }

        $collectorId = ProjectScope::projectCollectorId($project);
        if ($collectorId > 0) {
            $ids[] = $collectorId;
        }

        if ((int) ($project->created_by ?? 0) > 0) {
            $ids[] = (int) $project->created_by;
        }

        return array_values(array_filter(array_unique(array_map('intval', $ids))));
    }
}
