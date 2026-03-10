<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class SystemMetaController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'roles' => [
                'admin',
                'truong_phong_san_xuat',
                'nhan_su_san_xuat',
                'nhan_su_kinh_doanh',
            ],
            'project_statuses' => [
                'moi_tao',
                'dang_trien_khai',
                'cho_duyet',
                'hoan_thanh',
                'tam_dung',
            ],
            'task_statuses' => [
                'nhan_task',
                'dang_trien_khai',
                'done',
                'hen_meet_ban_giao',
                'hoan_tat_ban_giao',
            ],
            'service_types' => [
                'backlinks',
                'cham_soc_website_tong_the',
                'viet_content',
                'audit_content',
            ],
        ]);
    }
}
