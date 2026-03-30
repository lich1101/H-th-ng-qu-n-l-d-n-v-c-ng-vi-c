<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FacebookPage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

class FacebookPageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $pages = FacebookPage::query()
            ->with('assignedStaff:id,name,email,department_id')
            ->where('user_id', $request->user()->id)
            ->orderBy('id')
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

        $pageIds = collect($data)
            ->pluck('id')
            ->filter()
            ->map(function ($pageId) {
                return (string) $pageId;
            })
            ->values();

        FacebookPage::query()
            ->where('user_id', $userId)
            ->when(
                $pageIds->isNotEmpty(),
                function ($builder) use ($pageIds) {
                    return $builder->whereNotIn('page_id', $pageIds->all());
                }
            )
            ->delete();

        $pages = collect($data)->map(function ($page) use ($userId, $now) {
            return FacebookPage::updateOrCreate(
                [
                    'user_id' => $userId,
                    'page_id' => (string) ($page['id'] ?? ''),
                ],
                [
                    'name' => (string) ($page['name'] ?? 'Facebook Page'),
                    'category' => $page['category'] ?? null,
                    'access_token' => (string) ($page['access_token'] ?? ''),
                    'is_active' => true,
                    'connected_at' => $now,
                ]
            );
        })->sortBy('id')->values();

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

    public function unsubscribe(Request $request, FacebookPage $page): JsonResponse
    {
        if ((int) $page->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'Không có quyền thao tác Page này.'], 403);
        }

        $version = env('FACEBOOK_GRAPH_VERSION', 'v18.0');
        $response = Http::asForm()->delete("https://graph.facebook.com/{$version}/{$page->page_id}/subscribed_apps", [
            'access_token' => $page->getRawOriginal('access_token'),
        ]);

        if (! $response->ok()) {
            return response()->json([
                'message' => 'Không thể hủy kích hoạt webhook cho Page.',
                'error' => $response->json(),
            ], 422);
        }

        $page->update(['is_subscribed' => false]);

        return response()->json([
            'message' => 'Đã hủy kích hoạt webhook cho Page.',
            'page' => $page,
        ]);
    }

    public function update(Request $request, FacebookPage $page): JsonResponse
    {
        if ((int) $page->user_id !== (int) $request->user()->id && ! in_array($request->user()->role, ['admin', 'administrator'], true)) {
            return response()->json(['message' => 'Không có quyền thao tác Page này.'], 403);
        }

        $validated = $request->validate([
            'assigned_staff_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $assignedStaffId = ! empty($validated['assigned_staff_id'])
            ? (int) $validated['assigned_staff_id']
            : null;
        if ($assignedStaffId && ! $this->canAssignStaff($request->user(), $assignedStaffId)) {
            return response()->json(['message' => 'Không thể giao lead của Page cho nhân viên này.'], 422);
        }

        $page->update([
            'assigned_staff_id' => $assignedStaffId,
        ]);

        return response()->json([
            'message' => 'Đã cập nhật nhân viên phụ trách cho Page.',
            'page' => $page->fresh('assignedStaff:id,name,email,department_id'),
        ]);
    }

    private function canAssignStaff($user, int $staffId): bool
    {
        $allowedRoles = ['quan_ly', 'nhan_vien'];

        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return User::query()
                ->where('id', $staffId)
                ->where('is_active', true)
                ->whereIn('role', $allowedRoles)
                ->exists();
        }

        if ($user->role === 'quan_ly') {
            return User::query()
                ->where('id', $staffId)
                ->where('is_active', true)
                ->whereIn('role', $allowedRoles)
                ->where(function ($builder) use ($user) {
                    $builder->whereIn('department_id', $user->managedDepartments()->pluck('id'))
                        ->orWhere('id', $user->id);
                })
                ->exists();
        }

        return (int) $user->id === $staffId && in_array($user->role, $allowedRoles, true);
    }
}
