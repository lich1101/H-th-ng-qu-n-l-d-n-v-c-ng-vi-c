<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddWeightPercentToTasksAndTaskItemsTable extends Migration
{
    public function up()
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (! Schema::hasColumn('tasks', 'weight_percent')) {
                $table->unsignedTinyInteger('weight_percent')
                    ->default(100)
                    ->after('progress_percent');
            }
        });

        Schema::table('task_items', function (Blueprint $table) {
            if (! Schema::hasColumn('task_items', 'weight_percent')) {
                $table->unsignedTinyInteger('weight_percent')
                    ->default(100)
                    ->after('progress_percent');
            }
        });
    }

    public function down()
    {
        Schema::table('task_items', function (Blueprint $table) {
            if (Schema::hasColumn('task_items', 'weight_percent')) {
                $table->dropColumn('weight_percent');
            }
        });

        Schema::table('tasks', function (Blueprint $table) {
            if (Schema::hasColumn('tasks', 'weight_percent')) {
                $table->dropColumn('weight_percent');
            }
        });
    }
}
