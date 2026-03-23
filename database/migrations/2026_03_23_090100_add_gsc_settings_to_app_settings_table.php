<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('app_settings', 'gsc_enabled')) {
                $table->boolean('gsc_enabled')
                    ->default(false)
                    ->after('chatbot_history_pairs');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_client_id')) {
                $table->string('gsc_client_id', 255)
                    ->nullable()
                    ->after('gsc_enabled');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_client_secret')) {
                $table->string('gsc_client_secret', 255)
                    ->nullable()
                    ->after('gsc_client_id');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_refresh_token')) {
                $table->text('gsc_refresh_token')
                    ->nullable()
                    ->after('gsc_client_secret');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_access_token')) {
                $table->text('gsc_access_token')
                    ->nullable()
                    ->after('gsc_refresh_token');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_access_token_expires_at')) {
                $table->timestamp('gsc_access_token_expires_at')
                    ->nullable()
                    ->after('gsc_access_token');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_row_limit')) {
                $table->unsignedSmallInteger('gsc_row_limit')
                    ->default(2500)
                    ->after('gsc_access_token_expires_at');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_data_state')) {
                $table->string('gsc_data_state', 16)
                    ->default('all')
                    ->after('gsc_row_limit');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_alert_threshold_percent')) {
                $table->unsignedTinyInteger('gsc_alert_threshold_percent')
                    ->default(30)
                    ->after('gsc_data_state');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_recipes_path_token')) {
                $table->string('gsc_recipes_path_token', 120)
                    ->default('/recipes')
                    ->after('gsc_alert_threshold_percent');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_brand_terms')) {
                $table->json('gsc_brand_terms')
                    ->nullable()
                    ->after('gsc_recipes_path_token');
            }
            if (! Schema::hasColumn('app_settings', 'gsc_sync_time')) {
                $table->string('gsc_sync_time', 5)
                    ->default('11:17')
                    ->after('gsc_brand_terms');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $drop = [];
            foreach ([
                'gsc_enabled',
                'gsc_client_id',
                'gsc_client_secret',
                'gsc_refresh_token',
                'gsc_access_token',
                'gsc_access_token_expires_at',
                'gsc_row_limit',
                'gsc_data_state',
                'gsc_alert_threshold_percent',
                'gsc_recipes_path_token',
                'gsc_brand_terms',
                'gsc_sync_time',
            ] as $column) {
                if (Schema::hasColumn('app_settings', $column)) {
                    $drop[] = $column;
                }
            }

            if (! empty($drop)) {
                $table->dropColumn($drop);
            }
        });
    }
};

