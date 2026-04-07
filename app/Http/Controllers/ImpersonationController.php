<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ImpersonationController extends Controller
{
    /**
     * Admin đăng nhập nhanh (mạo danh) người dùng khác.
     */
    public function start(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        if (! $actor || $actor->role !== 'admin') {
            return response()->json(['message' => 'Chỉ tài khoản admin mới được đăng nhập nhanh.'], 403);
        }

        if ((int) $user->id === (int) $actor->id) {
            return response()->json(['message' => 'Không thể đăng nhập nhanh chính tài khoản của bạn.'], 422);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'Tài khoản này đang tạm khóa, không thể đăng nhập nhanh.'], 422);
        }

        if ($user->role === 'administrator') {
            return response()->json(['message' => 'Không thể đăng nhập nhanh tài khoản administrator.'], 403);
        }

        $request->session()->put('impersonator', [
            'id' => $actor->id,
            'name' => $actor->name,
            'email' => $actor->email,
        ]);

        Auth::loginUsingId((int) $user->id);
        $request->session()->save();

        return response()->json([
            'message' => 'Đã chuyển phiên đăng nhập.',
            'redirect' => url('/dashboard'),
        ]);
    }

    /**
     * Thoát mạo danh, quay về tài khoản admin gốc.
     */
    public function leave(Request $request): JsonResponse
    {
        $original = $request->session()->get('impersonator');
        if (! is_array($original) || empty($original['id'])) {
            return response()->json(['message' => 'Phiên hiện tại không phải đăng nhập nhanh.'], 422);
        }

        $request->session()->forget('impersonator');
        Auth::loginUsingId((int) $original['id']);
        $request->session()->save();

        return response()->json([
            'message' => 'Đã quay về tài khoản gốc.',
            'redirect' => url('/dashboard'),
        ]);
    }
}
