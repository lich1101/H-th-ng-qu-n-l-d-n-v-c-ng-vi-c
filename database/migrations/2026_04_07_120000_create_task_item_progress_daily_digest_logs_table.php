<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('task_item_progress_daily_digest_logs')) {
            return;
        }

        Schema::create('task_item_progress_daily_digest_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->date('reminder_date');
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['user_id', 'reminder_date'], 'tipddl_user_date_uniq');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_item_progress_daily_digest_logs');
    }
};
