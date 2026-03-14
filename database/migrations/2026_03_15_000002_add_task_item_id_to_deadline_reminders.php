<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deadline_reminders', function (Blueprint $table) {
            $table->unsignedBigInteger('task_item_id')->nullable()->after('task_id');
            $table->index('task_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('deadline_reminders', function (Blueprint $table) {
            $table->dropIndex(['task_item_id']);
            $table->dropColumn('task_item_id');
        });
    }
};
