<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('tasks')->where('status', 'nhan_task')->update(['status' => 'todo']);
        DB::table('tasks')->where('status', 'dang_trien_khai')->update(['status' => 'doing']);
        DB::table('tasks')->where('status', 'hen_meet_ban_giao')->update(['status' => 'blocked']);
        DB::table('tasks')->where('status', 'hoan_tat_ban_giao')->update(['status' => 'done']);

        DB::statement("ALTER TABLE tasks MODIFY status VARCHAR(50) NOT NULL DEFAULT 'todo'");
    }

    public function down(): void
    {
        DB::table('tasks')->where('status', 'todo')->update(['status' => 'nhan_task']);
        DB::table('tasks')->where('status', 'doing')->update(['status' => 'dang_trien_khai']);
        DB::table('tasks')->where('status', 'blocked')->update(['status' => 'hen_meet_ban_giao']);

        DB::statement("ALTER TABLE tasks MODIFY status VARCHAR(50) NOT NULL DEFAULT 'nhan_task'");
    }
};
