<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\UserDeviceToken;
use App\Services\FirebaseService;
use Illuminate\Http\JsonResponse;

class SystemStatusController extends Controller
{
    public function show(FirebaseService $firebase): JsonResponse
    {
        $totalTokens = (int) UserDeviceToken::query()->count();
        $byPlatform = UserDeviceToken::query()
            ->selectRaw('platform, count(*) as total')
            ->groupBy('platform')
            ->pluck('total', 'platform');
        $lastSeen = UserDeviceToken::query()->max('last_seen_at');
        $lastUpdated = UserDeviceToken::query()->max('updated_at');

        return response()->json([
            'firebase' => [
                'enabled' => $firebase->enabled(),
                'database_enabled' => $firebase->databaseEnabled(),
                'access_token' => $firebase->accessTokenAvailable(),
            ],
            'push_tokens' => [
                'total' => $totalTokens,
                'by_platform' => [
                    'ios' => (int) ($byPlatform['ios'] ?? 0),
                    'android' => (int) ($byPlatform['android'] ?? 0),
                    'web' => (int) ($byPlatform['web'] ?? 0),
                ],
                'last_seen_at' => $lastSeen,
                'last_updated_at' => $lastUpdated,
            ],
        ]);
    }
}
