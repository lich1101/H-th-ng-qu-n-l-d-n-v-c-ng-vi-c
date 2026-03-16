<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_item_reminder_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_item_id');
            $table->unsignedBigInteger('user_id');
            $table->date('reminder_date');
            $table->timestamps();

            $table->foreign('task_item_id')->references('id')->on('task_items')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(
                ['task_item_id', 'user_id', 'reminder_date'],
                'tirl_item_user_date_uniq'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_item_reminder_logs');
    }
};
