<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function updateAvatar(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'avatar' => ['nullable', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
            'remove' => ['nullable', 'boolean'],
        ]);

        $deleteExisting = function (?string $url): void {
            if (! $url) {
                return;
            }
            $prefix = Storage::url('avatars/');
            if (! str_starts_with($url, $prefix)) {
                return;
            }
            $relative = ltrim(str_replace(Storage::url(''), '', $url), '/');
            if ($relative !== '') {
                Storage::disk('public')->delete($relative);
            }
        };

        if (! empty($validated['remove'])) {
            $deleteExisting($user->avatar_url);
            $user->update(['avatar_url' => null]);
            return response()->json(['message' => 'Avatar removed.', 'avatar_url' => null]);
        }

        if (! $request->hasFile('avatar')) {
            return response()->json(['message' => 'Avatar file is required.'], 422);
        }

        $deleteExisting($user->avatar_url);
        $storedPath = $request->file('avatar')->store('avatars', 'public');
        $url = Storage::url($storedPath);
        $user->update(['avatar_url' => $url]);

        return response()->json([
            'message' => 'Avatar updated.',
            'avatar_url' => $url,
        ]);
    }
}
