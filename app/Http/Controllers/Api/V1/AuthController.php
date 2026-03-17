<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\UserDeviceToken;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:120'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return response()->json([
                'message' => 'Invalid credentials.',
            ], 422);
        }

        if (! $user->is_active) {
            return response()->json([
                'message' => 'Account is disabled.',
            ], 403);
        }

        $deviceName = trim((string) ($validated['device_name'] ?? 'mobile-app'));
        if ($deviceName === '') {
            $deviceName = 'mobile-app';
        }

        $token = DB::transaction(function () use ($user, $deviceName) {
            // Mobile app is limited to one active device session per account.
            $user->tokens()->delete();
            UserDeviceToken::query()
                ->where('user_id', $user->id)
                ->delete();

            return $user->createToken('mobile:'.$deviceName, ['mobile'])->plainTextToken;
        });

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user) {
            UserDeviceToken::query()
                ->where('user_id', $user->id)
                ->delete();
        }

        $currentToken = $request->user()->currentAccessToken();
        if ($currentToken) {
            $currentToken->delete();
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }
}
