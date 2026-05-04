<?php

namespace App\Jobs;

use App\Models\DataTransferJob;
use App\Models\User;
use App\Services\CrmClientExportService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessClientExportJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        public int $dataTransferJobId
    ) {
    }

    public function handle(CrmClientExportService $exportService): void
    {
        $job = DataTransferJob::query()->find($this->dataTransferJobId);
        if (! $job || $job->type !== 'export' || $job->module !== 'clients') {
            return;
        }

        $job->update([
            'status' => 'processing',
            'started_at' => now(),
        ]);

        $user = User::query()->find($job->user_id);
        if (! $user) {
            $job->update([
                'status' => 'failed',
                'finished_at' => now(),
                'error_message' => 'Không tìm thấy người dùng gốc của job xuất.',
            ]);

            return;
        }

        try {
            $exportService->runExportJob($job, $user);
        } catch (\Throwable $e) {
            report($e);

            $job->update([
                'status' => 'failed',
                'finished_at' => now(),
                'error_message' => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
