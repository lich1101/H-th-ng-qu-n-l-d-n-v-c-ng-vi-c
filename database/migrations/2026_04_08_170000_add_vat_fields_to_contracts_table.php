<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddVatFieldsToContractsTable extends Migration
{
    public function up()
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->decimal('subtotal_value', 15, 2)->nullable()->after('value');
            $table->boolean('vat_enabled')->default(false)->after('subtotal_value');
            $table->string('vat_mode', 20)->nullable()->after('vat_enabled');
            $table->decimal('vat_rate', 8, 2)->nullable()->after('vat_mode');
            $table->decimal('vat_amount', 15, 2)->nullable()->after('vat_rate');
        });

        DB::table('contracts')->update([
            'subtotal_value' => DB::raw('COALESCE(value, 0)'),
            'vat_enabled' => 0,
            'vat_mode' => null,
            'vat_rate' => null,
            'vat_amount' => 0,
        ]);
    }

    public function down()
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn([
                'subtotal_value',
                'vat_enabled',
                'vat_mode',
                'vat_rate',
                'vat_amount',
            ]);
        });
    }
}
