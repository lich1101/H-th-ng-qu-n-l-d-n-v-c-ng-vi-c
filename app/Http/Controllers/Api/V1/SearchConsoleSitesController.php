<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Services\GoogleSearchConsoleService;
use App\Services\ProjectGscSyncService;
use Illuminate\Http\JsonResponse;

class SearchConsoleSitesController extends Controller
{
    public function index(GoogleSearchConsoleService $gsc, ProjectGscSyncService $syncService): JsonResponse
    {
        $setting = AppSetting::query()->first();
        if (! $syncService->canSync($setting)) {
            return response()->json([
                'message' => 'Google Search Console chưa bật hoặc thiếu cấu hình OAuth trong Cài đặt hệ thống.',
                'data' => [],
            ], 422);
        }

        try {
            $sites = $gsc->listSites($setting);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage() ?: 'Không lấy được danh sách site Google Search Console.',
                'data' => [],
            ], 422);
        }

        return response()->json(['data' => $sites]);
    }
}
