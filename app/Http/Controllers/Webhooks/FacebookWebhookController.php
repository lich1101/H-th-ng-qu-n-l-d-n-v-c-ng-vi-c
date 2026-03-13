<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\FacebookMessage;
use App\Models\FacebookPage;
use App\Models\LeadType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class FacebookWebhookController extends Controller
{
    public function verify(Request $request)
    {
        $verifyToken = (string) env('FACEBOOK_VERIFY_TOKEN');
        $mode = $request->query('hub_mode');
        $token = $request->query('hub_verify_token');
        $challenge = $request->query('hub_challenge');

        if ($mode === 'subscribe' && $verifyToken !== '' && $token === $verifyToken) {
            return response((string) $challenge, 200);
        }

        return response('Invalid verify token', 403);
    }

    public function handle(Request $request): JsonResponse
    {
        if (! $this->verifySignature($request)) {
            return response()->json(['message' => 'Invalid signature.'], 403);
        }

        $payload = $request->all();
        if (($payload['object'] ?? '') !== 'page') {
            return response()->json(['status' => 'ignored']);
        }

        $leadTypeId = $this->resolveLeadTypeId();
        foreach (($payload['entry'] ?? []) as $entry) {
            $pageId = (string) ($entry['id'] ?? '');
            if ($pageId === '') {
                continue;
            }

            $page = FacebookPage::query()->where('page_id', $pageId)->first();
            if (! $page) {
                continue;
            }

            foreach (($entry['messaging'] ?? []) as $event) {
                $message = $event['message'] ?? null;
                if (! $message || ! empty($message['is_echo'])) {
                    continue;
                }

                $senderId = (string) ($event['sender']['id'] ?? '');
                if ($senderId === '') {
                    continue;
                }

                $text = $message['text'] ?? null;
                $client = Client::query()
                    ->where('facebook_psid', $senderId)
                    ->where('facebook_page_id', $pageId)
                    ->first();

                $phones = $this->extractPhones($text ?? '');
                $primaryPhone = $phones[0] ?? null;
                if ($primaryPhone) {
                    $existingByPhone = $this->findClientByPhone($primaryPhone);
                    if (! $existingByPhone) {
                        $profile = $this->fetchProfile($senderId, $page->getRawOriginal('access_token'));
                        $client = Client::create([
                            'name' => $profile['name'] ?? "Facebook User {$senderId}",
                            'phone' => $primaryPhone,
                            'lead_type_id' => $leadTypeId,
                            'lead_source' => 'page_message',
                            'lead_channel' => 'facebook',
                            'lead_message' => $text,
                            'facebook_psid' => $senderId,
                            'facebook_page_id' => $pageId,
                            'notes' => $text,
                        ]);
                    } else {
                        $client = $existingByPhone;
                    }
                }

                FacebookMessage::create([
                    'facebook_page_id' => $page->id,
                    'client_id' => $client->id ?? null,
                    'sender_id' => $senderId,
                    'message_text' => $text,
                    'payload' => $event,
                    'received_at' => now(),
                ]);
            }
        }

        return response()->json(['status' => 'ok']);
    }

    private function verifySignature(Request $request): bool
    {
        $secret = (string) env('FACEBOOK_APP_SECRET');
        if ($secret === '') {
            return true;
        }

        $signature = (string) $request->header('X-Hub-Signature-256');
        if ($signature === '') {
            return false;
        }

        $expected = 'sha256=' . hash_hmac('sha256', $request->getContent(), $secret);
        return hash_equals($expected, $signature);
    }

    private function resolveLeadTypeId(): ?int
    {
        $leadTypeId = LeadType::query()
            ->where('name', 'Khách hàng tiềm năng')
            ->value('id');
        if (! $leadTypeId) {
            $leadTypeId = LeadType::query()
                ->orderBy('sort_order')
                ->orderBy('id')
                ->value('id');
        }

        return $leadTypeId;
    }

    private function fetchProfile(string $psid, string $pageToken): array
    {
        if ($pageToken === '') {
            return [];
        }

        $version = env('FACEBOOK_GRAPH_VERSION', 'v18.0');
        $response = Http::get("https://graph.facebook.com/{$version}/{$psid}", [
            'fields' => 'name,profile_pic',
            'access_token' => $pageToken,
        ]);

        if (! $response->ok()) {
            return [];
        }

        return $response->json();
    }

    private function extractPhones(string $text): array
    {
        if (trim($text) === '') {
            return [];
        }

        preg_match_all('/(?:\+?84|0)[\d\.\-\s]{8,14}/', $text, $matches);
        $rawPhones = $matches[0] ?? [];
        $phones = [];

        foreach ($rawPhones as $raw) {
            $normalized = $this->normalizePhone($raw);
            if ($normalized !== '') {
                $phones[] = $normalized;
            }
        }

        return array_values(array_unique($phones));
    }

    private function normalizePhone(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', $raw ?? '');
        if ($digits === '') {
            return '';
        }

        if (str_starts_with($digits, '84') && strlen($digits) >= 11) {
            $digits = '0' . substr($digits, 2);
        }

        $length = strlen($digits);
        if ($length < 9 || $length > 11) {
            return '';
        }

        return $digits;
    }

    private function findClientByPhone(string $normalized): ?Client
    {
        if ($normalized === '') {
            return null;
        }

        try {
            $client = Client::query()
                ->whereRaw("REGEXP_REPLACE(phone, '[^0-9]', '') = ?", [$normalized])
                ->first();
            if ($client) {
                return $client;
            }
        } catch (\Throwable $e) {
            // ignore and fallback
        }

        return Client::query()->where('phone', $normalized)->first();
    }
}
