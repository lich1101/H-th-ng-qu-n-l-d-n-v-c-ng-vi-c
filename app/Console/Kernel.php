<?php

namespace App\Console;

use App\Models\AppSetting;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Facades\Schema;

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
        $schedule->command('opportunities:send-reminders')
            ->everyMinute()
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('attendance:send-reminders')
            ->everyMinute()
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('attendance:sync-holidays')
            ->dailyAt('00:05')
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('gsc:sync-projects')
            ->everyMinute()
            ->timezone('Asia/Ho_Chi_Minh');
        $schedule->command('clients:process-auto-rotation')
            ->dailyAt($this->resolveClientRotationRunTime())
            ->timezone('Asia/Ho_Chi_Minh')
            ->withoutOverlapping();
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

    private function resolveClientRotationRunTime(): string
    {
        $fallback = '12:00';

        try {
            if (! Schema::hasTable('app_settings') || ! Schema::hasColumn('app_settings', 'client_rotation_run_time')) {
                return $fallback;
            }

            $value = trim((string) AppSetting::query()->value('client_rotation_run_time'));

            return preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $value) === 1
                ? $value
                : $fallback;
        } catch (\Throwable $e) {
            return $fallback;
        }
    }
}
