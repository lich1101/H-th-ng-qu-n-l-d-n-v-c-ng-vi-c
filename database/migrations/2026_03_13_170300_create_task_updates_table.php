<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateTaskUpdatesTable extends Migration
{
    public function up()
    {
        Schema::create('task_updates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->unsignedBigInteger('submitted_by');
            $table->string('status', 50)->nullable();
            $table->unsignedTinyInteger('progress_percent')->nullable();
            $table->text('note')->nullable();
            $table->string('attachment_path', 255)->nullable();
            $table->string('review_status', 20)->default('pending');
            $table->text('review_note')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->foreign('task_id')->references('id')->on('tasks')->cascadeOnDelete();
            $table->foreign('submitted_by')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();

            $table->index(['task_id', 'review_status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('task_updates');
    }
}
