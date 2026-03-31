<?php

namespace App\Jobs;

use App\Models\DataTransferJob;
use App\Services\DataTransfers\ImportExecutionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessImportJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        public int $dataTransferJobId
    ) {
    }

    public function handle(ImportExecutionService $service): void
    {
        $job = DataTransferJob::query()->find($this->dataTransferJobId);
        if (! $job) {
            return;
        }

        $job->update([
            'status' => 'processing',
            'started_at' => now(),
        ]);

        try {
            $report = $service->runImportJob($job);
            $job->update([
                'status' => 'completed',
                'processed_rows' => (int) ($report['total'] ?? $job->processed_rows),
                'successful_rows' => (int) ($report['created'] ?? 0) + (int) ($report['updated'] ?? 0),
                'failed_rows' => (int) ($report['skipped'] ?? 0),
                'report' => $report,
                'finished_at' => now(),
                'error_message' => null,
            ]);
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
