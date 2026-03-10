<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDeadlineRemindersTable extends Migration
{
    public function up()
    {
        Schema::create('deadline_reminders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->string('channel', 20)->default('in_app');
            $table->string('trigger_type', 30);
            $table->timestamp('scheduled_at');
            $table->timestamp('sent_at')->nullable();
            $table->string('status', 20)->default('pending');
            $table->text('payload')->nullable();
            $table->timestamps();

            $table->foreign('task_id')->references('id')->on('tasks')->cascadeOnDelete();
            $table->index(['scheduled_at', 'status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('deadline_reminders');
    }
}
