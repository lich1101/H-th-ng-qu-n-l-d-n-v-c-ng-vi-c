<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     *
     * @param  \Illuminate\Console\Scheduling\Schedule  $schedule
     * @return void
     */
    protected function schedule(Schedule $schedule)
    {
        $schedule->command('reminders:sync-deadline')->hourly();
        $schedule->command('reminders:send-deadline')->everyMinute();
        $schedule->command('notifications:cleanup')
            ->dailyAt('00:30')
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('task-items:remind-progress')
            ->everyMinute()
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('meetings:send-reminders')
            ->everyMinute()
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('meetings:cleanup-old')
            ->dailyAt('01:00')
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('contracts:send-reminders')
            ->everyMinute()
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('gsc:sync-projects')
            ->everyMinute()
            ->timezone('Asia/Ho_Chi_Minh');
    }

    /**
     * Register the commands for the application.
     *
     * @return void
     */
    protected function commands()
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
