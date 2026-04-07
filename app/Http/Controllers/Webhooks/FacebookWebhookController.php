<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\FacebookMessage;
use App\Models\FacebookPage;
use App\Models\LeadType;
use App\Models\User;
use App\Services\ClientPhoneDuplicateService;
use App\Services\LeadNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class FacebookWebhookController extends Controller
{
    public function verify(Request $request)
    {
        $verifyToken = (string) config('services.facebook.verify_token', '');
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

                $page = FacebookPage::query()->with('assignedStaff')->where('page_id', $pageId)->first();
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
                $recipientId = (string) ($event['recipient']['id'] ?? '');

                $text = $message['text'] ?? null;
                $client = Client::query()
                    ->where('facebook_psid', $senderId)
                    ->where('facebook_page_id', $pageId)
                    ->first();

                $phones = $this->extractPhones($text ?? '');
                $primaryPhone = $phones[0] ?? null;
                if ($primaryPhone) {
                    $profile = $this->fetchProfile($senderId, $page->getRawOriginal('access_token'));
                    $existingByPhone = app(ClientPhoneDuplicateService::class)->findExistingByNormalizedPhone($primaryPhone);
                    if (! $existingByPhone) {
                        $assignedStaffId = $page->assigned_staff_id ? (int) $page->assigned_staff_id : null;
                        $assignedDepartmentId = null;
                        if ($assignedStaffId) {
                            $assignedDepartmentId = User::query()
                                ->where('id', $assignedStaffId)
                                ->value('department_id');
                        }

                        $client = Client::create([
                            'name' => $profile['name'] ?? "Facebook User {$senderId}",
                            'phone' => $primaryPhone,
                            'lead_type_id' => $leadTypeId,
                            'lead_source' => 'page_message',
                            'lead_channel' => $page->name,
                            'lead_message' => $text,
                            'facebook_psid' => $senderId,
                            'facebook_page_id' => $pageId,
                            'notes' => $text,
                            'assigned_department_id' => $assignedDepartmentId,
                            'assigned_staff_id' => $assignedStaffId,
                        ]);
                        app(LeadNotificationService::class)->notifyNewLead(
                            $client,
                            'Page Facebook: '.$page->name
                        );
                    } else {
                        $phoneService = app(ClientPhoneDuplicateService::class);
                        $client = $existingByPhone;
                        $incomingName = trim((string) ($profile['name'] ?? ''));
                        if ($incomingName === '') {
                            $incomingName = "Facebook User {$senderId}";
                        }
                        $client->name = $phoneService->mergeDisplayNames($client->name, $incomingName);
                        if (empty($client->facebook_psid)) {
                            $client->facebook_psid = $senderId;
                        }
                        if (empty($client->facebook_page_id)) {
                            $client->facebook_page_id = $pageId;
                        }
                        if ($text !== null && trim((string) $text) !== '') {
                            $t = trim((string) $text);
                            $client->lead_message = trim(
                                ($client->lead_message ? $client->lead_message."\n\n" : '')
                                .'[Page '.$page->name.'] '.$t
                            );
                        }
                        $client->save();
                        try {
                            app(LeadNotificationService::class)->notifyPhoneDuplicateMerged(
                                $client->fresh(),
                                $incomingName,
                                'Page Facebook: '.$page->name,
                                $page->assigned_staff_id ? (int) $page->assigned_staff_id : null
                            );
                        } catch (\Throwable $e) {
                            Log::warning('notifyPhoneDuplicateMerged failed (Facebook webhook)', [
                                'client_id' => (int) $client->id,
                                'error' => $e->getMessage(),
                            ]);
                        }
                    }
                }

                FacebookMessage::create([
                    'facebook_page_id' => $page->id,
                    'client_id' => $client->id ?? null,
                    'sender_id' => $senderId,
                    'recipient_id' => $recipientId,
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
        $secret = (string) config('services.facebook.app_secret', '');
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

        $version = (string) config('services.facebook.graph_version', 'v23.0');
        $response = Http::get("https://graph.facebook.com/{$version}/{$psid}", [
            'fields' => 'first_name,last_name,name,profile_pic',
            'access_token' => $pageToken,
        ]);

        if (! $response->ok()) {
            return [];
        }

        $data = $response->json();
        if (is_array($data) && array_key_exists(0, $data) && is_array($data[0])) {
            $data = $data[0];
        }
        if (is_array($data) && array_key_exists('data', $data) && is_array($data['data']) && isset($data['data'][0])) {
            $data = $data['data'][0];
        }
        if (empty($data['name'])) {
            $first = trim((string) ($data['first_name'] ?? ''));
            $last = trim((string) ($data['last_name'] ?? ''));
            $full = trim($first . ' ' . $last);
            if ($full !== '') {
                $data['name'] = $full;
            }
        }

        return $data;
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

}
