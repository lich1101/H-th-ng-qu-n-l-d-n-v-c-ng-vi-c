<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateMeetingReminderLogsTable extends Migration
{
    public function up()
    {
        Schema::create('meeting_reminder_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('meeting_id');
            $table->unsignedBigInteger('user_id');
            $table->string('reminder_type', 40);
            $table->dateTime('sent_at');
            $table->timestamps();

            $table->foreign('meeting_id')->references('id')->on('project_meetings')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['meeting_id', 'user_id', 'reminder_type'], 'meeting_reminder_logs_unique');
            $table->index(['reminder_type', 'sent_at'], 'meeting_reminder_logs_type_sent_index');
        });
    }

    public function down()
    {
        Schema::dropIfExists('meeting_reminder_logs');
    }
}
