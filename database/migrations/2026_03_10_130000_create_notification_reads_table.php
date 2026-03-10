<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateNotificationReadsTable extends Migration
{
    public function up()
    {
        Schema::create('notification_reads', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('source_type', 50);
            $table->unsignedBigInteger('source_id');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['user_id', 'source_type', 'source_id'], 'notification_reads_unique');
            $table->index(['source_type', 'source_id'], 'notification_reads_source_index');
        });
    }

    public function down()
    {
        Schema::dropIfExists('notification_reads');
    }
}
