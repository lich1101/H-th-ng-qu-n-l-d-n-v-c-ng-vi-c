<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\UserNotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class UserNotificationPreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        if (! Schema::hasTable('user_notification_preferences')) {
            return response()->json($this->serializePreference(null));
        }

        $preference = UserNotificationPreference::query()
            ->where('user_id', $request->user()->id)
            ->first();

        return response()->json($this->serializePreference($preference));
    }

    public function update(Request $request): JsonResponse
    {
        if (! Schema::hasTable('user_notification_preferences')) {
            return response()->json([
                'message' => 'Bảng cấu hình thông báo chưa sẵn sàng. Vui lòng chạy migrate.',
            ], 422);
        }

        $validated = $request->validate([
            'notifications_enabled' => ['nullable', 'boolean'],
            'category_system_enabled' => ['nullable', 'boolean'],
            'category_crm_realtime_enabled' => ['nullable', 'boolean'],
        ]);

        $defaults = UserNotificationPreference::defaults();
        $existing = UserNotificationPreference::query()
            ->where('user_id', $request->user()->id)
            ->first();

        $preference = UserNotificationPreference::query()->updateOrCreate(
            ['user_id' => $request->user()->id],
            [
                'notifications_enabled' => array_key_exists('notifications_enabled', $validated)
                    ? (bool) $validated['notifications_enabled']
                    : (bool) ($existing->notifications_enabled ?? $defaults['notifications_enabled']),
                'category_system_enabled' => array_key_exists('category_system_enabled', $validated)
                    ? (bool) $validated['category_system_enabled']
                    : (bool) ($existing->category_system_enabled ?? $defaults['category_system_enabled']),
                'category_crm_realtime_enabled' => array_key_exists('category_crm_realtime_enabled', $validated)
                    ? (bool) $validated['category_crm_realtime_enabled']
                    : (bool) ($existing->category_crm_realtime_enabled ?? $defaults['category_crm_realtime_enabled']),
            ]
        );

        return response()->json($this->serializePreference($preference));
    }

    private function serializePreference(?UserNotificationPreference $preference): array
    {
        $defaults = UserNotificationPreference::defaults();

        return [
            'notifications_enabled' => $preference
                ? (bool) $preference->notifications_enabled
                : (bool) $defaults['notifications_enabled'],
            'category_system_enabled' => $preference
                ? (bool) $preference->category_system_enabled
                : (bool) $defaults['category_system_enabled'],
            'category_crm_realtime_enabled' => $preference
                ? (bool) $preference->category_crm_realtime_enabled
                : (bool) $defaults['category_crm_realtime_enabled'],
        ];
    }
}
