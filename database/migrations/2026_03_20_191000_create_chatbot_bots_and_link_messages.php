<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chatbot_bots')) {
            Schema::create('chatbot_bots', function (Blueprint $table) {
                $table->id();
                $table->string('name', 120);
                $table->string('description', 255)->nullable();
                $table->string('provider', 32)->default('gemini');
                $table->string('model', 120)->nullable();
                $table->text('api_key')->nullable();
                $table->longText('system_message_markdown')->nullable();
                $table->unsignedSmallInteger('history_pairs')->default(8);
                $table->string('accent_color', 16)->nullable();
                $table->string('icon', 32)->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->boolean('is_default')->default(false);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();

                $table->index(['is_active', 'sort_order']);
                $table->index(['is_default']);
                $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
                $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
            });
        }

        $defaultBotId = $this->ensureDefaultBot();

        if (Schema::hasTable('chatbot_messages') && ! Schema::hasColumn('chatbot_messages', 'bot_id')) {
            Schema::table('chatbot_messages', function (Blueprint $table) {
                $table->unsignedBigInteger('bot_id')->nullable()->after('user_id');
                $table->index(['user_id', 'bot_id', 'id'], 'chatbot_messages_user_bot_id_index');
                $table->foreign('bot_id')->references('id')->on('chatbot_bots')->cascadeOnDelete();
            });

            if ($defaultBotId) {
                DB::table('chatbot_messages')->whereNull('bot_id')->update([
                    'bot_id' => $defaultBotId,
                ]);
            }
        }

        if (Schema::hasTable('chatbot_user_states') && ! Schema::hasColumn('chatbot_user_states', 'bot_id')) {
            Schema::table('chatbot_user_states', function (Blueprint $table) {
                $table->unsignedBigInteger('bot_id')->nullable()->after('user_id');
                $table->index(['user_id', 'bot_id'], 'chatbot_user_states_user_bot_index');
                $table->foreign('bot_id')->references('id')->on('chatbot_bots')->cascadeOnDelete();
            });

            if ($defaultBotId) {
                DB::table('chatbot_user_states')->whereNull('bot_id')->update([
                    'bot_id' => $defaultBotId,
                ]);
            }
        }

        if (Schema::hasTable('chatbot_user_states')) {
            $this->dropUserOnlyUniqueIndex();
            $this->createUserBotUniqueIndex();
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('chatbot_user_states')) {
            try {
                Schema::table('chatbot_user_states', function (Blueprint $table) {
                    $table->dropUnique('chatbot_user_states_user_bot_unique');
                });
            } catch (\Throwable $e) {
                // ignore
            }

            try {
                Schema::table('chatbot_user_states', function (Blueprint $table) {
                    $table->unique('user_id');
                });
            } catch (\Throwable $e) {
                // ignore
            }

            if (Schema::hasColumn('chatbot_user_states', 'bot_id')) {
                try {
                    Schema::table('chatbot_user_states', function (Blueprint $table) {
                        $table->dropForeign(['bot_id']);
                    });
                } catch (\Throwable $e) {
                    // ignore
                }

                try {
                    Schema::table('chatbot_user_states', function (Blueprint $table) {
                        $table->dropIndex('chatbot_user_states_user_bot_index');
                    });
                } catch (\Throwable $e) {
                    // ignore
                }

                Schema::table('chatbot_user_states', function (Blueprint $table) {
                    $table->dropColumn('bot_id');
                });
            }
        }

        if (Schema::hasTable('chatbot_messages') && Schema::hasColumn('chatbot_messages', 'bot_id')) {
            try {
                Schema::table('chatbot_messages', function (Blueprint $table) {
                    $table->dropForeign(['bot_id']);
                });
            } catch (\Throwable $e) {
                // ignore
            }

            try {
                Schema::table('chatbot_messages', function (Blueprint $table) {
                    $table->dropIndex('chatbot_messages_user_bot_id_index');
                });
            } catch (\Throwable $e) {
                // ignore
            }

            Schema::table('chatbot_messages', function (Blueprint $table) {
                $table->dropColumn('bot_id');
            });
        }

        Schema::dropIfExists('chatbot_bots');
    }

    private function ensureDefaultBot(): ?int
    {
        if (! Schema::hasTable('chatbot_bots')) {
            return null;
        }

        $existingId = DB::table('chatbot_bots')->orderBy('id')->value('id');
        if ($existingId) {
            $defaultId = DB::table('chatbot_bots')
                ->where('is_default', true)
                ->orderBy('id')
                ->value('id');
            if (! $defaultId) {
                DB::table('chatbot_bots')->where('id', $existingId)->update([
                    'is_default' => true,
                ]);
            }
            return (int) ($defaultId ?: $existingId);
        }

        $setting = Schema::hasTable('app_settings')
            ? DB::table('app_settings')->orderBy('id')->first()
            : null;

        $now = now();
        $botId = DB::table('chatbot_bots')->insertGetId([
            'name' => 'Trợ lý mặc định',
            'description' => 'Bot mặc định dùng khi chưa tạo bot khác.',
            'provider' => $setting && ! empty($setting->chatbot_provider) ? $setting->chatbot_provider : 'gemini',
            'model' => $setting && ! empty($setting->chatbot_model) ? $setting->chatbot_model : 'gemini-2.0-flash',
            'api_key' => $setting->chatbot_api_key ?? null,
            'system_message_markdown' => $setting->chatbot_system_message_markdown ?? null,
            'history_pairs' => (int) ($setting->chatbot_history_pairs ?? 8),
            'accent_color' => '#6366F1',
            'icon' => '🤖',
            'sort_order' => 0,
            'is_active' => true,
            'is_default' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return (int) $botId;
    }

    private function dropUserOnlyUniqueIndex(): void
    {
        $connection = DB::getDriverName();
        if ($connection === 'mysql') {
            try {
                DB::statement('ALTER TABLE `chatbot_user_states` DROP INDEX `chatbot_user_states_user_id_unique`');
            } catch (\Throwable $e) {
                // ignore
            }

            return;
        }

        try {
            Schema::table('chatbot_user_states', function (Blueprint $table) {
                $table->dropUnique('chatbot_user_states_user_id_unique');
            });
        } catch (\Throwable $e) {
            // ignore
        }
    }

    private function createUserBotUniqueIndex(): void
    {
        try {
            Schema::table('chatbot_user_states', function (Blueprint $table) {
                $table->unique(['user_id', 'bot_id'], 'chatbot_user_states_user_bot_unique');
            });
        } catch (\Throwable $e) {
            // ignore
        }
    }
};
