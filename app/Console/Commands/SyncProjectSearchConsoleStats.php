<?php

namespace App\Console\Commands;

use App\Models\AppSetting;
use App\Models\Project;
use App\Services\ProjectGscSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SyncProjectSearchConsoleStats extends Command
{
    protected $signature = 'gsc:sync-projects {--project_id=} {--force}';
    protected $description = 'Đồng bộ dữ liệu Google Search Console theo ngày cho các dự án có website_url.';

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
                $syncService->syncProject($project, true);
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
            ->whereNotNull('website_url')
            ->where('website_url', '!=', '')
            ->orderBy('id')
            ->get();

        if ($projects->isEmpty()) {
            $this->line('Không có dự án nào có website_url để đồng bộ.');
            return self::SUCCESS;
        }

        $ok = 0;
        $failed = 0;
        foreach ($projects as $project) {
            try {
                $syncService->syncProject($project, false);
                $ok++;
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
}

