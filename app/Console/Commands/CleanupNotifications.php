<?php

namespace App\Console\Commands;

use App\Models\InAppNotification;
use App\Models\NotificationRead;
use Illuminate\Console\Command;

class CleanupNotifications extends Command
{
    protected $signature = 'notifications:cleanup';
    protected $description = 'Xóa thông báo đã đọc của những ngày cũ để tránh tràn dữ liệu.';

    public function handle(): int
    {
        $today = now()->startOfDay();

        $deletedInApp = InAppNotification::query()
            ->whereNotNull('read_at')
            ->where('read_at', '<', $today)
            ->delete();

        $deletedReads = NotificationRead::query()
            ->whereNotNull('read_at')
            ->where('read_at', '<', $today)
            ->delete();

        $this->info("Deleted in_app: {$deletedInApp}, reads: {$deletedReads}");

        return self::SUCCESS;
    }
}
