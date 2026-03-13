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
                'quan_ly',
                'nhan_vien',
                'ke_toan',
            ],
            'project_statuses' => [
                'moi_tao',
                'dang_trien_khai',
                'cho_duyet',
                'hoan_thanh',
                'tam_dung',
            ],
            'task_statuses' => [
                'todo',
                'doing',
                'done',
                'blocked',
            ],
            'service_types' => [
                'backlinks',
                'cham_soc_website_tong_the',
                'viet_content',
                'audit_content',
                'khac',
            ],
        ]);
    }
}
