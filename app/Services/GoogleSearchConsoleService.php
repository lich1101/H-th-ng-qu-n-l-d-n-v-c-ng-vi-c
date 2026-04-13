<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GoogleSearchConsoleService
{
    public function isConfigured(?AppSetting $setting): bool
    {
        if (! $setting) {
            return false;
        }

        return trim((string) $setting->gsc_client_id) !== ''
            && trim((string) $setting->gsc_client_secret) !== ''
            && trim((string) $setting->gsc_refresh_token) !== '';
    }

    public function getAccessToken(AppSetting $setting, bool $forceRefresh = false): ?string
    {
        if (! $this->isConfigured($setting)) {
            return null;
        }

        $expiresAt = $setting->gsc_access_token_expires_at
            ? Carbon::parse($setting->gsc_access_token_expires_at)
            : null;

        if (
            ! $forceRefresh
            && trim((string) $setting->gsc_access_token) !== ''
            && $expiresAt
            && $expiresAt->gt(now()->addSeconds(90))
        ) {
            return (string) $setting->gsc_access_token;
        }

        return $this->refreshAccessToken($setting);
    }

    public function querySearchAnalytics(
        string $accessToken,
        string $siteUrl,
        string $startDate,
        string $endDate,
        int $rowLimit = 2500,
        string $dataState = 'all'
    ): array {
        $siteEncoded = rawurlencode($siteUrl);
        $url = "https://searchconsole.googleapis.com/webmasters/v3/sites/{$siteEncoded}/searchAnalytics/query";

        $response = Http::timeout(30)
            ->withToken($accessToken)
            ->post($url, [
                'startDate' => $startDate,
                'endDate' => $endDate,
                'dimensions' => ['page', 'query'],
                'rowLimit' => max(1, min($rowLimit, 25000)),
                'dataState' => $dataState ?: 'all',
            ]);

        if (! $response->successful()) {
            $payload = $response->json();
            $message = data_get($payload, 'error.message')
                ?: $response->body()
                ?: 'Search Console query failed.';
            throw new \RuntimeException($message);
        }

        $data = $response->json();
        $rows = data_get($data, 'rows', []);

        return is_array($rows) ? $rows : [];
    }

    /**
     * Danh sách property trong Google Search Console (sites.list).
     *
     * @return array<int, array{site_url: string, permission_level: string|null}>
     */
    public function listSites(AppSetting $setting): array
    {
        $accessToken = $this->getAccessToken($setting);
        if ($accessToken === null || $accessToken === '') {
            throw new \RuntimeException('Không lấy được access token Google Search Console. Kiểm tra client_id/client_secret/refresh_token.');
        }

        $url = 'https://searchconsole.googleapis.com/webmasters/v3/sites';
        $response = Http::timeout(30)
            ->withToken($accessToken)
            ->get($url);

        if (! $response->successful()) {
            $payload = $response->json();
            $message = data_get($payload, 'error.message')
                ?: $response->body()
                ?: 'Không lấy được danh sách site Google Search Console.';

            throw new \RuntimeException($message);
        }

        $data = $response->json();
        $entries = data_get($data, 'siteEntry', []);
        if (! is_array($entries)) {
            return [];
        }

        $out = [];
        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $siteUrl = trim((string) ($entry['siteUrl'] ?? ''));
            if ($siteUrl === '') {
                continue;
            }
            $perm = $entry['permissionLevel'] ?? null;
            $out[] = [
                'site_url' => $siteUrl,
                'permission_level' => is_string($perm) ? $perm : null,
            ];
        }

        return $out;
    }

    private function refreshAccessToken(AppSetting $setting): ?string
    {
        $response = Http::asForm()
            ->timeout(20)
            ->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'refresh_token',
                'client_id' => (string) $setting->gsc_client_id,
                'client_secret' => (string) $setting->gsc_client_secret,
                'refresh_token' => (string) $setting->gsc_refresh_token,
            ]);

        if (! $response->successful()) {
            Log::warning('GSC refresh token failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            return null;
        }

        $payload = $response->json();
        $accessToken = trim((string) data_get($payload, 'access_token', ''));
        if ($accessToken === '') {
            return null;
        }

        $expiresIn = (int) data_get($payload, 'expires_in', 3600);
        $expiresAt = now()->addSeconds(max(60, $expiresIn));

        $setting->forceFill([
            'gsc_access_token' => $accessToken,
            'gsc_access_token_expires_at' => $expiresAt,
        ])->save();

        return $accessToken;
    }
}

