<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\FirebaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FirebaseTokenController extends Controller
{
    public function show(Request $request, FirebaseService $firebase): JsonResponse
    {
        if (! $firebase->enabled()) {
            return response()->json(['message' => 'Firebase chưa cấu hình.'], 422);
        }

        $user = $request->user();
        $token = $firebase->createCustomToken((string) $user->id, [
            'role' => $user->role,
            'email' => $user->email,
        ]);

        if (! $token) {
            return response()->json(['message' => 'Không tạo được token.'], 500);
        }

        return response()->json(['token' => $token]);
    }
}
