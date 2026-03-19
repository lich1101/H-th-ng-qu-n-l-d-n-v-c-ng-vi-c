<?php

namespace App\Console\Commands;

use App\Models\ProjectMeeting;
use Illuminate\Console\Command;

class CleanupOldMeetings extends Command
{
    protected $signature = 'meetings:cleanup-old';

    protected $description = 'Xóa các lịch họp đã qua hơn 1 tháng';

    public function handle(): int
    {
        $cutoff = now()->subMonth();

        $deleted = ProjectMeeting::query()
            ->where('scheduled_at', '<', $cutoff)
            ->delete();

        $this->info("Đã xóa {$deleted} lịch họp cũ hơn 1 tháng.");

        return self::SUCCESS;
    }
}
