<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->decimal('total_debt_amount', 15, 2)->default(0)->after('total_revenue');
            $table->decimal('total_cash_flow', 15, 2)->default(0)->after('total_debt_amount');
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn([
                'total_debt_amount',
                'total_cash_flow',
            ]);
        });
    }
};
