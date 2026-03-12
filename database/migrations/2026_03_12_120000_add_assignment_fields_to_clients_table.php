<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->foreignId('assigned_department_id')
                ->nullable()
                ->constrained('departments')
                ->nullOnDelete()
                ->after('sales_owner_id');
            $table->foreignId('assigned_staff_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete()
                ->after('assigned_department_id');
        });

        DB::table('clients')
            ->whereNull('assigned_staff_id')
            ->whereNotNull('sales_owner_id')
            ->update(['assigned_staff_id' => DB::raw('sales_owner_id')]);

        DB::statement(
            'UPDATE clients c JOIN users u ON c.assigned_staff_id = u.id '.
            'SET c.assigned_department_id = u.department_id '.
            'WHERE c.assigned_department_id IS NULL AND u.department_id IS NOT NULL'
        );
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropForeign(['assigned_department_id']);
            $table->dropForeign(['assigned_staff_id']);
            $table->dropColumn(['assigned_department_id', 'assigned_staff_id']);
        });
    }
};
