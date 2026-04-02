<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (! Schema::hasColumn('projects', 'gsc_notify_enabled')) {
                $table->boolean('gsc_notify_enabled')
                    ->default(false)
                    ->after('website_url');
            }

            if (! Schema::hasColumn('projects', 'gsc_notify_last_error')) {
                $table->text('gsc_notify_last_error')
                    ->nullable()
                    ->after('gsc_notify_enabled');
            }

            if (! Schema::hasColumn('projects', 'gsc_tracking_started_at')) {
                $table->date('gsc_tracking_started_at')
                    ->nullable()
                    ->after('gsc_notify_last_error');
            }

            if (! Schema::hasColumn('projects', 'gsc_last_synced_at')) {
                $table->dateTime('gsc_last_synced_at')
                    ->nullable()
                    ->after('gsc_tracking_started_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $drops = [];
            foreach (['gsc_last_synced_at', 'gsc_tracking_started_at', 'gsc_notify_last_error', 'gsc_notify_enabled'] as $column) {
                if (Schema::hasColumn('projects', $column)) {
                    $drops[] = $column;
                }
            }

            if (! empty($drops)) {
                $table->dropColumn($drops);
            }
        });
    }
};
