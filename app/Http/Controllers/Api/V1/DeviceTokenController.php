<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\UserDeviceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class DeviceTokenController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string', 'max:512'],
            'platform' => ['nullable', 'string', 'max:32'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'notifications_enabled' => ['nullable', 'boolean'],
        ]);

        $payload = [
            'user_id' => $request->user()->id,
            'platform' => $validated['platform'] ?? null,
            'device_name' => $validated['device_name'] ?? null,
            'last_seen_at' => now(),
        ];
        if (Schema::hasColumn('user_device_tokens', 'notifications_enabled')) {
            $payload['notifications_enabled'] = array_key_exists('notifications_enabled', $validated)
                ? (bool) $validated['notifications_enabled']
                : null;
        }

        UserDeviceToken::updateOrCreate(
            ['token' => $validated['token']],
            $payload
        );

        return response()->json(['message' => 'Đã lưu token thiết bị.']);
    }
}
