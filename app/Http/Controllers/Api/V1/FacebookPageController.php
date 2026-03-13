<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FacebookPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

class FacebookPageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $pages = FacebookPage::query()
            ->where('user_id', $request->user()->id)
            ->orderBy('name')
            ->get();

        return response()->json($pages);
    }

    public function sync(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_access_token' => ['nullable', 'string'],
        ]);

        $token = $validated['user_access_token']
            ?? $request->user()->facebook_user_access_token
            ?? $request->session()->get('facebook_user_access_token');

        if (! $token) {
            return response()->json([
                'message' => 'Bạn cần đăng nhập Facebook trước khi đồng bộ Page.',
            ], 422);
        }

        $version = env('FACEBOOK_GRAPH_VERSION', 'v18.0');
        $response = Http::get("https://graph.facebook.com/{$version}/me/accounts", [
            'fields' => 'id,name,access_token,category',
            'access_token' => $token,
        ]);

        if (! $response->ok()) {
            return response()->json([
                'message' => 'Không thể lấy danh sách Page từ Facebook.',
                'error' => $response->json(),
            ], 422);
        }

        $data = $response->json('data') ?? [];
        $userId = $request->user()->id;
        $now = Carbon::now();

        $pages = collect($data)->map(function ($page) use ($userId, $now) {
            return FacebookPage::updateOrCreate(
                ['page_id' => (string) ($page['id'] ?? '')],
                [
                    'name' => (string) ($page['name'] ?? 'Facebook Page'),
                    'category' => $page['category'] ?? null,
                    'access_token' => (string) ($page['access_token'] ?? ''),
                    'user_id' => $userId,
                    'is_active' => true,
                    'connected_at' => $now,
                ]
            );
        })->values();

        return response()->json([
            'message' => 'Đã đồng bộ danh sách Page.',
            'pages' => $pages,
        ]);
    }

    public function subscribe(Request $request, FacebookPage $page): JsonResponse
    {
        if ((int) $page->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'Không có quyền thao tác Page này.'], 403);
        }

        $version = env('FACEBOOK_GRAPH_VERSION', 'v18.0');
        $response = Http::asForm()->post("https://graph.facebook.com/{$version}/{$page->page_id}/subscribed_apps", [
            'subscribed_fields' => 'messages,messaging_postbacks,messaging_optins',
            'access_token' => $page->getRawOriginal('access_token'),
        ]);

        if (! $response->ok()) {
            return response()->json([
                'message' => 'Không thể subscribe Page.',
                'error' => $response->json(),
            ], 422);
        }

        $page->update(['is_subscribed' => true]);

        return response()->json([
            'message' => 'Đã kích hoạt webhook cho Page.',
            'page' => $page,
        ]);
    }
}
