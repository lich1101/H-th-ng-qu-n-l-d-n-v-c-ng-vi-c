<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddProfileFieldsToUsersTable extends Migration
{
    public function up()
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 50)->default('nhan_vien')->after('password');
            $table->string('department', 100)->nullable()->after('role');
            $table->string('phone', 30)->nullable()->after('department');
            $table->unsignedSmallInteger('workload_capacity')->default(100)->after('phone');
            $table->boolean('is_active')->default(true)->after('workload_capacity');
        });
    }

    public function down()
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'role',
                'department',
                'phone',
                'workload_capacity',
                'is_active',
            ]);
        });
    }
}
