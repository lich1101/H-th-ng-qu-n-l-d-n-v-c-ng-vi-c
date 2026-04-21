<?php

namespace App\Console\Commands;

use App\Services\ClientAutoRotationService;
use Illuminate\Console\Command;

class ProcessClientAutoRotation extends Command
{
    protected $signature = 'clients:process-auto-rotation';

    protected $description = 'Quét khách hàng không được chăm sóc, gửi cảnh báo và điều chuyển tự động theo cấu hình xoay vòng';

    public function handle(ClientAutoRotationService $service): int
    {
        $summary = $service->process();

        $this->info(sprintf(
            'client_rotation enabled=%s scanned=%d warning_sent=%d rotated=%d skipped_no_recipient=%d skipped_pending_manual_transfer=%d skipped_out_of_scope=%d skipped_not_due=%d',
            ($summary['enabled'] ?? false) ? '1' : '0',
            (int) ($summary['scanned'] ?? 0),
            (int) ($summary['warning_sent'] ?? 0),
            (int) ($summary['rotated'] ?? 0),
            (int) ($summary['skipped_no_recipient'] ?? 0),
            (int) ($summary['skipped_pending_manual_transfer'] ?? 0),
            (int) ($summary['skipped_out_of_scope'] ?? 0),
            (int) ($summary['skipped_not_due'] ?? 0),
        ));

        if (! empty($summary['message'])) {
            $this->line((string) $summary['message']);
        }

        return self::SUCCESS;
    }
};
