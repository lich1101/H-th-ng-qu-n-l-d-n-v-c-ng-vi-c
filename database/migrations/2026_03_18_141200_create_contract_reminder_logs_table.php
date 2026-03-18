<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateContractReminderLogsTable extends Migration
{
    public function up()
    {
        Schema::create('contract_reminder_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->unsignedBigInteger('user_id');
            $table->string('reminder_type', 40);
            $table->date('reminder_date');
            $table->timestamps();

            $table->foreign('contract_id', 'ctr_rmdr_contract_fk')
                ->references('id')
                ->on('contracts')
                ->cascadeOnDelete();
            $table->foreign('user_id', 'ctr_rmdr_user_fk')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->unique(
                ['contract_id', 'user_id', 'reminder_type', 'reminder_date'],
                'ctr_rmdr_unique'
            );
        });
    }

    public function down()
    {
        Schema::dropIfExists('contract_reminder_logs');
    }
}
