<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\UserDeviceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DeviceTokenController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string', 'max:512'],
            'platform' => ['nullable', 'string', 'max:32'],
            'apns_environment' => ['nullable', 'string', 'in:development,production'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'notifications_enabled' => ['nullable', 'boolean'],
        ]);

        $deviceToken = trim((string) $validated['token']);
        $platform = isset($validated['platform'])
            ? strtolower(trim((string) $validated['platform']))
            : null;
        if ($platform === '') {
            $platform = null;
        }
        $apnsEnvironment = isset($validated['apns_environment'])
            ? strtolower(trim((string) $validated['apns_environment']))
            : null;
        if ($apnsEnvironment === '') {
            $apnsEnvironment = null;
        }
        if ($platform !== 'ios') {
            $apnsEnvironment = null;
        }
        $deviceName = isset($validated['device_name'])
            ? trim((string) $validated['device_name'])
            : null;
        if ($deviceName === '') {
            $deviceName = null;
        }

        $payload = [
            'user_id' => $request->user()->id,
            'platform' => $platform,
            'device_name' => $deviceName,
            'last_seen_at' => now(),
        ];
        if (Schema::hasColumn('user_device_tokens', 'apns_environment')) {
            $payload['apns_environment'] = $apnsEnvironment;
        }
        if (Schema::hasColumn('user_device_tokens', 'notifications_enabled')) {
            $payload['notifications_enabled'] = array_key_exists('notifications_enabled', $validated)
                ? (bool) $validated['notifications_enabled']
                : null;
        }

        DB::transaction(function () use ($request, $payload, $deviceToken) {
            $userId = $request->user()->id;

            // If this token was associated with a different account, reclaim it for current account.
            UserDeviceToken::query()
                ->where('token', $deviceToken)
                ->where('user_id', '!=', $userId)
                ->delete();

            // Keep exactly one latest token row per account.
            $current = UserDeviceToken::query()->updateOrCreate(
                ['user_id' => $userId],
                array_merge($payload, ['token' => $deviceToken])
            );

            UserDeviceToken::query()
                ->where('user_id', $userId)
                ->where('id', '!=', $current->id)
                ->delete();
        });

        return response()->json(['message' => 'Đã lưu token thiết bị.']);
    }
}
