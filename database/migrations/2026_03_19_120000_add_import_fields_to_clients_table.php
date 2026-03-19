<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddImportFieldsToClientsTable extends Migration
{
    public function up()
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->string('external_code', 80)->nullable()->after('name');
            $table->string('customer_status_label', 120)->nullable()->after('lead_message');
            $table->string('customer_level', 120)->nullable()->after('customer_status_label');
            $table->decimal('legacy_debt_amount', 15, 2)->default(0)->after('customer_level');
            $table->string('company_size', 120)->nullable()->after('legacy_debt_amount');
            $table->text('product_categories')->nullable()->after('company_size');

            $table->index('external_code');
        });
    }

    public function down()
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropIndex(['external_code']);
            $table->dropColumn([
                'external_code',
                'customer_status_label',
                'customer_level',
                'legacy_debt_amount',
                'company_size',
                'product_categories',
            ]);
        });
    }
}
