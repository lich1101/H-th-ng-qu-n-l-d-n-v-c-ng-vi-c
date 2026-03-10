<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateMeetingAttendeesTable extends Migration
{
    public function up()
    {
        Schema::create('meeting_attendees', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('meeting_id');
            $table->unsignedBigInteger('user_id');
            $table->string('attendance_status', 20)->default('invited');
            $table->timestamps();

            $table->foreign('meeting_id')->references('id')->on('project_meetings')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['meeting_id', 'user_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('meeting_attendees');
    }
}
