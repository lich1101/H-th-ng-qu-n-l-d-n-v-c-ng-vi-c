<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddImportFieldsToContractItemsTable extends Migration
{
    public function up()
    {
        Schema::table('contract_items', function (Blueprint $table) {
            $table->string('product_code', 80)->nullable()->after('product_id');
            $table->decimal('discount_amount', 15, 2)->default(0)->after('quantity');
            $table->decimal('vat_amount', 15, 2)->default(0)->after('discount_amount');
        });
    }

    public function down()
    {
        Schema::table('contract_items', function (Blueprint $table) {
            $table->dropColumn([
                'product_code',
                'discount_amount',
                'vat_amount',
            ]);
        });
    }
}
