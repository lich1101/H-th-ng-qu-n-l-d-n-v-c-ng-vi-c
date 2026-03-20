<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('app_settings', 'chatbot_enabled')) {
                $table->boolean('chatbot_enabled')
                    ->default(false)
                    ->after('smtp_from_name');
            }
            if (! Schema::hasColumn('app_settings', 'chatbot_provider')) {
                $table->string('chatbot_provider', 32)
                    ->default('gemini')
                    ->after('chatbot_enabled');
            }
            if (! Schema::hasColumn('app_settings', 'chatbot_model')) {
                $table->string('chatbot_model', 120)
                    ->nullable()
                    ->after('chatbot_provider');
            }
            if (! Schema::hasColumn('app_settings', 'chatbot_api_key')) {
                $table->text('chatbot_api_key')
                    ->nullable()
                    ->after('chatbot_model');
            }
            if (! Schema::hasColumn('app_settings', 'chatbot_system_message_markdown')) {
                $table->longText('chatbot_system_message_markdown')
                    ->nullable()
                    ->after('chatbot_api_key');
            }
            if (! Schema::hasColumn('app_settings', 'chatbot_history_pairs')) {
                $table->unsignedSmallInteger('chatbot_history_pairs')
                    ->default(8)
                    ->after('chatbot_system_message_markdown');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $drop = [];

            foreach ([
                'chatbot_enabled',
                'chatbot_provider',
                'chatbot_model',
                'chatbot_api_key',
                'chatbot_system_message_markdown',
                'chatbot_history_pairs',
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

