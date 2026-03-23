<?php

namespace App\Http\Controllers;

use App\Models\AppSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GscOAuthController extends Controller
{
    private const STATE_TTL_SECONDS = 600;

    public function connect(Request $request): RedirectResponse
    {
        $user = $request->user();
        if (! $user || $user->role !== 'administrator') {
            return $this->redirectWithError('Không có quyền kết nối Google Search Console.');
        }

        $setting = AppSetting::query()->first();
        if (! $setting) {
            return $this->redirectWithError('Chưa có cấu hình hệ thống. Hãy lưu cài đặt trước khi kết nối.');
        }

        $clientId = trim((string) ($setting->gsc_client_id ?? ''));
        $clientSecret = trim((string) ($setting->gsc_client_secret ?? ''));
        if ($clientId === '' || $clientSecret === '') {
            return $this->redirectWithError('Thiếu Client ID hoặc Client Secret. Hãy lưu cài đặt trước khi kết nối.');
        }

        $state = Str::random(64);
        $request->session()->put('gsc_oauth_state', $state);
        $request->session()->put('gsc_oauth_state_user_id', (int) $user->id);
        $request->session()->put('gsc_oauth_state_expires_at', now()->addSeconds(self::STATE_TTL_SECONDS)->timestamp);

        $params = [
            'client_id' => $clientId,
            'redirect_uri' => $this->oauthRedirectUri(),
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/webmasters.readonly',
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
            'state' => $state,
        ];

        $url = 'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query($params, '', '&', PHP_QUERY_RFC3986);

        return redirect()->away($url);
    }

    public function callback(Request $request): RedirectResponse
    {
        $user = $request->user();
        if (! $user || $user->role !== 'administrator') {
            return $this->redirectWithError('Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.');
        }

        $oauthError = trim((string) $request->query('error', ''));
        if ($oauthError !== '') {
            return $this->redirectWithError('Google trả về lỗi OAuth: '.$oauthError);
        }

        $state = trim((string) $request->query('state', ''));
        $code = trim((string) $request->query('code', ''));
        if ($state === '' || $code === '') {
            return $this->redirectWithError('Thiếu state hoặc code từ Google callback.');
        }

        $expectedState = (string) $request->session()->pull('gsc_oauth_state', '');
        $stateUserId = (int) $request->session()->pull('gsc_oauth_state_user_id', 0);
        $stateExpiresAt = (int) $request->session()->pull('gsc_oauth_state_expires_at', 0);

        if ($expectedState === '' || $expectedState !== $state) {
            return $this->redirectWithError('State OAuth không hợp lệ hoặc đã hết hạn. Vui lòng bấm Connect lại.');
        }
        if ($stateUserId !== (int) $user->id) {
            return $this->redirectWithError('State OAuth không đúng người dùng kết nối.');
        }
        if ($stateExpiresAt > 0 && now()->timestamp > $stateExpiresAt) {
            return $this->redirectWithError('State OAuth đã hết hạn. Vui lòng bấm Connect lại.');
        }

        $setting = AppSetting::query()->first();
        if (! $setting) {
            return $this->redirectWithError('Chưa có cấu hình hệ thống để lưu credential.');
        }

        $clientId = trim((string) ($setting->gsc_client_id ?? ''));
        $clientSecret = trim((string) ($setting->gsc_client_secret ?? ''));
        if ($clientId === '' || $clientSecret === '') {
            return $this->redirectWithError('Thiếu Client ID hoặc Client Secret. Hãy lưu cài đặt trước khi kết nối.');
        }

        $tokenRes = Http::asForm()
            ->timeout(20)
            ->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'authorization_code',
                'code' => $code,
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'redirect_uri' => $this->oauthRedirectUri(),
            ]);

        if (! $tokenRes->successful()) {
            $payload = $tokenRes->json();
            $err = data_get($payload, 'error_description')
                ?: data_get($payload, 'error')
                ?: $tokenRes->body();

            return $this->redirectWithError('Không đổi được token từ Google: '.trim((string) $err));
        }

        $tokenPayload = $tokenRes->json();
        $accessToken = trim((string) data_get($tokenPayload, 'access_token', ''));
        $refreshToken = trim((string) data_get($tokenPayload, 'refresh_token', ''));
        $expiresIn = max(60, (int) data_get($tokenPayload, 'expires_in', 3600));

        if ($refreshToken === '' && trim((string) ($setting->gsc_refresh_token ?? '')) === '') {
            return $this->redirectWithError('Google không trả refresh token. Hãy thử Connect lại để cấp quyền offline.');
        }

        $updates = [];
        if ($refreshToken !== '') {
            $updates['gsc_refresh_token'] = $refreshToken;
        }
        if ($accessToken !== '') {
            $updates['gsc_access_token'] = $accessToken;
            $updates['gsc_access_token_expires_at'] = now()->addSeconds($expiresIn);
        }

        if ($updates !== []) {
            $setting->forceFill($updates)->save();
        }

        $message = $refreshToken !== ''
            ? 'Đã kết nối Google Search Console và lưu refresh token thành công.'
            : 'Đã xác thực Google thành công. Hệ thống giữ refresh token hiện có.';

        return $this->redirectWithSuccess($message);
    }

    private function oauthRedirectUri(): string
    {
        return route('settings.gsc.oauth.callback');
    }

    private function settingsUrl(string $status, string $message): string
    {
        $query = http_build_query([
            'tab' => 'gsc',
            'gsc_oauth' => $status,
            'gsc_oauth_message' => $message,
        ], '', '&', PHP_QUERY_RFC3986);

        return route('settings.system').'?'.$query;
    }

    private function redirectWithError(string $message): RedirectResponse
    {
        return redirect()->to($this->settingsUrl('error', $message));
    }

    private function redirectWithSuccess(string $message): RedirectResponse
    {
        return redirect()->to($this->settingsUrl('success', $message));
    }
}
