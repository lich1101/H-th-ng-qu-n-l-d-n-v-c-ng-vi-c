<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddImportFieldsToContractsTable extends Migration
{
    public function up()
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->string('contract_type', 120)->nullable()->after('title');
            $table->string('care_schedule', 120)->nullable()->after('contract_type');
            $table->unsignedInteger('duration_months')->nullable()->after('care_schedule');
            $table->string('payment_cycle', 120)->nullable()->after('duration_months');
            $table->unsignedInteger('imported_paid_periods')->nullable()->after('payment_cycle');
        });
    }

    public function down()
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn([
                'contract_type',
                'care_schedule',
                'duration_months',
                'payment_cycle',
                'imported_paid_periods',
            ]);
        });
    }
}
