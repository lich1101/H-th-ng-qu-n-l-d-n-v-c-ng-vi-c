<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddCollectorUserIdToContractsTable extends Migration
{
    public function up()
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->unsignedBigInteger('collector_user_id')
                ->nullable()
                ->after('created_by');
            $table->foreign('collector_user_id')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
            $table->index('collector_user_id');
        });
    }

    public function down()
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropForeign(['collector_user_id']);
            $table->dropIndex(['collector_user_id']);
            $table->dropColumn('collector_user_id');
        });
    }
}
