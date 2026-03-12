<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UsersOnlySeeder extends Seeder
{
    public function run()
    {
        User::updateOrCreate(
            ['email' => 'dangvanbinh11012003@gmail.com'],
            [
                'name' => 'Admin System',
                'password' => Hash::make('khongdoipass'),
                'role' => 'admin',
                'department' => 'quan_tri',
                'is_active' => true,
            ]
        );

        User::updateOrCreate(
            ['email' => 'manager@noibo.local'],
            [
                'name' => 'Quản lý phòng ban',
                'password' => Hash::make('password123'),
                'role' => 'quan_ly',
                'department' => 'quan_ly',
                'is_active' => true,
            ]
        );

        User::updateOrCreate(
            ['email' => 'staff@noibo.local'],
            [
                'name' => 'Nhân sự sản xuất',
                'password' => Hash::make('password123'),
                'role' => 'nhan_vien',
                'department' => 'nhan_vien',
                'is_active' => true,
            ]
        );

        User::updateOrCreate(
            ['email' => 'accountant@noibo.local'],
            [
                'name' => 'Kế toán',
                'password' => Hash::make('password123'),
                'role' => 'ke_toan',
                'department' => 'ke_toan',
                'is_active' => true,
            ]
        );
    }
}
