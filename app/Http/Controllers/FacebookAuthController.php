<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class FacebookAuthController extends Controller
{
    public function redirect(Request $request): RedirectResponse
    {
        $appId = (string) env('FACEBOOK_APP_ID');
        $secret = (string) env('FACEBOOK_APP_SECRET');
        if ($appId === '' || $secret === '') {
            return redirect()->route('facebook.pages')
                ->with('error', 'Thiếu cấu hình FACEBOOK_APP_ID hoặc FACEBOOK_APP_SECRET.');
        }

        $version = env('FACEBOOK_GRAPH_VERSION', 'v23.0');
        $state = Str::random(32);
        $request->session()->put('facebook_oauth_state', $state);

        $redirectUri = route('facebook.callback');
        $scopes = implode(',', [
            'public_profile',
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_metadata',
            'pages_messaging',
        ]);

        $url = "https://www.facebook.com/{$version}/dialog/oauth?" . http_build_query([
            'client_id' => $appId,
            'redirect_uri' => $redirectUri,
            'state' => $state,
            'scope' => $scopes,
        ]);

        return redirect()->away($url);
    }

    public function callback(Request $request): RedirectResponse
    {
        if ($request->filled('error')) {
            $error = $request->input('error_description') ?? $request->input('error');
            return redirect()->route('facebook.pages')->with('error', (string) $error);
        }

        $state = (string) $request->input('state');
        $expectedState = (string) $request->session()->pull('facebook_oauth_state');
        if ($state === '' || $state !== $expectedState) {
            return redirect()->route('facebook.pages')->with('error', 'Sai state OAuth. Vui lòng thử lại.');
        }

        $code = (string) $request->input('code');
        if ($code === '') {
            return redirect()->route('facebook.pages')->with('error', 'Thiếu OAuth code từ Facebook.');
        }

        $appId = (string) env('FACEBOOK_APP_ID');
        $secret = (string) env('FACEBOOK_APP_SECRET');
        $version = env('FACEBOOK_GRAPH_VERSION', 'v23.0');
        $redirectUri = route('facebook.callback');

        $tokenRes = Http::get("https://graph.facebook.com/{$version}/oauth/access_token", [
            'client_id' => $appId,
            'redirect_uri' => $redirectUri,
            'client_secret' => $secret,
            'code' => $code,
        ]);

        if (! $tokenRes->ok()) {
            return redirect()->route('facebook.pages')
                ->with('error', 'Không thể lấy access token từ Facebook.');
        }

        $token = (string) ($tokenRes->json('access_token') ?? '');
        $expiresIn = (int) ($tokenRes->json('expires_in') ?? 0);
        if ($token === '') {
            return redirect()->route('facebook.pages')->with('error', 'Access token rỗng.');
        }

        $expiresAt = $expiresIn > 0 ? Carbon::now()->addSeconds($expiresIn) : null;
        $request->session()->put('facebook_user_access_token', $token);
        $request->session()->put('facebook_user_token_expires_at', $expiresAt?->toDateTimeString());

        $request->user()->forceFill([
            'facebook_user_access_token' => $token,
            'facebook_user_token_expires_at' => $expiresAt,
        ])->save();

        return redirect()->route('facebook.pages')->with('success', 'Đã kết nối Facebook Login.');
    }

    public function disconnect(Request $request): RedirectResponse
    {
        $request->session()->forget(['facebook_user_access_token', 'facebook_user_token_expires_at']);
        $request->user()->forceFill([
            'facebook_user_access_token' => null,
            'facebook_user_token_expires_at' => null,
        ])->save();

        return redirect()->route('facebook.pages')->with('success', 'Đã ngắt kết nối Facebook.');
    }
}
