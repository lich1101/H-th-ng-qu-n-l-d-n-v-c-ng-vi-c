<?php

namespace Database\Seeders;

use App\Models\Client;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoDataSeeder extends Seeder
{
    public function run()
    {
        $admin = User::updateOrCreate(
            ['email' => 'admin@noibo.local'],
            [
                'name' => 'Admin System',
                'password' => Hash::make('password123'),
                'role' => 'admin',
                'department' => 'quan_tri',
                'is_active' => true,
            ]
        );

        $sales = User::updateOrCreate(
            ['email' => 'sales@noibo.local'],
            [
                'name' => 'Sales Executive',
                'password' => Hash::make('password123'),
                'role' => 'nhan_su_kinh_doanh',
                'department' => 'kinh_doanh',
                'is_active' => true,
            ]
        );

        $leader = User::updateOrCreate(
            ['email' => 'leader@noibo.local'],
            [
                'name' => 'Production Leader',
                'password' => Hash::make('password123'),
                'role' => 'truong_phong_san_xuat',
                'department' => 'san_xuat',
                'is_active' => true,
            ]
        );

        $staff = User::updateOrCreate(
            ['email' => 'staff@noibo.local'],
            [
                'name' => 'Production Staff',
                'password' => Hash::make('password123'),
                'role' => 'nhan_su_san_xuat',
                'department' => 'san_xuat',
                'is_active' => true,
            ]
        );

        $client = Client::updateOrCreate(
            ['email' => 'client@acme.local'],
            [
                'name' => 'Acme Client',
                'company' => 'Acme Co.',
                'phone' => '0900000000',
                'sales_owner_id' => $sales->id,
            ]
        );

        $project = Project::updateOrCreate(
            ['code' => 'PRJ-0001'],
            [
                'name' => 'SEO Tong The Q2',
                'client_id' => $client->id,
                'service_type' => 'cham_soc_website_tong_the',
                'start_date' => now()->toDateString(),
                'deadline' => now()->addDays(30)->toDateString(),
                'status' => 'dang_trien_khai',
                'handover_status' => 'chua_ban_giao',
                'customer_requirement' => 'Tang traffic va toi uu conversion.',
                'created_by' => $sales->id,
                'approved_by' => $leader->id,
                'approved_at' => now(),
            ]
        );

        Task::updateOrCreate(
            ['project_id' => $project->id, 'title' => 'Audit 20 URL uu tien'],
            [
                'description' => 'Audit onpage va ky thuat cho nhom URL uu tien.',
                'priority' => 'high',
                'status' => 'dang_trien_khai',
                'start_at' => now(),
                'deadline' => now()->addDays(5),
                'progress_percent' => 35,
                'created_by' => $leader->id,
                'assigned_by' => $leader->id,
                'assignee_id' => $staff->id,
                'reviewer_id' => $leader->id,
                'require_acknowledgement' => true,
                'acknowledged_at' => now(),
            ]
        );
    }
}
