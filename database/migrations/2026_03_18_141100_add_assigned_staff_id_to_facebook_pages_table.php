<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddAssignedStaffIdToFacebookPagesTable extends Migration
{
    public function up()
    {
        Schema::table('facebook_pages', function (Blueprint $table) {
            $table->unsignedBigInteger('assigned_staff_id')
                ->nullable()
                ->after('user_id');
            $table->foreign('assigned_staff_id', 'fb_pages_staff_fk')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
            $table->index('assigned_staff_id', 'fb_pages_staff_idx');
        });
    }

    public function down()
    {
        Schema::table('facebook_pages', function (Blueprint $table) {
            $table->dropForeign('fb_pages_staff_fk');
            $table->dropIndex('fb_pages_staff_idx');
            $table->dropColumn('assigned_staff_id');
        });
    }
}
