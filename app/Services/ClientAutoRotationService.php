<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Client;
use App\Models\ClientCareNote;
use App\Models\ClientRotationHistory;
use App\Models\ClientRotationWarningLog;
use App\Models\ClientStaffTransferRequest;
use App\Models\Contract;
use App\Models\Opportunity;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ClientAutoRotationService
{
    public const ACTION_AUTO_ROTATION = 'auto_rotation';

    public const ACTION_MANUAL_TRANSFER_REQUEST = 'manual_transfer_request';

    public const ACTION_MANUAL_DIRECT_ASSIGNMENT = 'manual_direct_assignment';

    private const ALLOWED_PARTICIPANT_ROLES = ['quan_ly', 'nhan_vien'];

    public function settings(): array
    {
        $setting = AppSetting::query()->first();
        $defaults = AppSetting::defaults();

        return [
            'enabled' => $setting ? (bool) ($setting->client_rotation_enabled ?? false) : false,
            'comment_stale_days' => max(1, (int) ($setting->client_rotation_comment_stale_days ?? ($defaults['client_rotation_comment_stale_days'] ?? 3))),
            'opportunity_stale_days' => max(1, (int) ($setting->client_rotation_opportunity_stale_days ?? ($defaults['client_rotation_opportunity_stale_days'] ?? 30))),
            'contract_stale_days' => max(1, (int) ($setting->client_rotation_contract_stale_days ?? ($defaults['client_rotation_contract_stale_days'] ?? 90))),
            'warning_days' => max(0, (int) ($setting->client_rotation_warning_days ?? ($defaults['client_rotation_warning_days'] ?? 3))),
            'daily_receive_limit' => max(1, (int) ($setting->client_rotation_daily_receive_limit ?? ($defaults['client_rotation_daily_receive_limit'] ?? 5))),
            'lead_type_ids' => $this->normalizeIdList($setting?->client_rotation_lead_type_ids ?? ($defaults['client_rotation_lead_type_ids'] ?? [])),
            'participant_user_ids' => $this->normalizeIdList($setting?->client_rotation_participant_user_ids ?? ($defaults['client_rotation_participant_user_ids'] ?? [])),
        ];
    }

    public function buildClientRotationInsight(
        Client $client,
        ?array $settings = null,
        ?CarbonInterface $now = null
    ): array {
        $settings = $settings ?? $this->settings();
        $now = $now ? Carbon::instance($now) : now('Asia/Ho_Chi_Minh');
        $stats = $this->loadActivityStatsForClients(new EloquentCollection([$client]));

        return $this->buildInsightFromStats($client, $settings, $now, $stats);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function buildClientRotationInsights(
        EloquentCollection $clients,
        ?array $settings = null,
        ?CarbonInterface $now = null
    ): array {
        $settings = $settings ?? $this->settings();
        $now = $now ? Carbon::instance($now) : now('Asia/Ho_Chi_Minh');
        $stats = $this->loadActivityStatsForClients($clients);

        return $clients->mapWithKeys(function (Client $client) use ($settings, $now, $stats) {
            return [
                (int) $client->id => $this->buildInsightFromStats($client, $settings, $now, $stats),
            ];
        })->all();
    }

    /**
     * @return array<int, mixed>
     */
    public function historyPayloadForClient(Client $client, int $limit = 50): array
    {
        $rows = ClientRotationHistory::query()
            ->with([
                'fromStaff:id,name,email',
                'toStaff:id,name,email',
                'triggeredBy:id,name,email',
                'leadType:id,name,color_hex',
            ])
            ->where('client_id', (int) $client->id)
            ->orderByDesc('transferred_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        return $rows->map(function (ClientRotationHistory $row) {
            return [
                'id' => (int) $row->id,
                'action_type' => (string) $row->action_type,
                'action_label' => $this->actionLabel((string) $row->action_type),
                'reason_code' => $row->reason_code,
                'note' => $row->note,
                'transferred_at' => optional($row->transferred_at)->toIso8601String(),
                'from_staff' => $row->fromStaff ? [
                    'id' => (int) $row->fromStaff->id,
                    'name' => (string) $row->fromStaff->name,
                    'email' => (string) $row->fromStaff->email,
                ] : null,
                'to_staff' => $row->toStaff ? [
                    'id' => (int) $row->toStaff->id,
                    'name' => (string) $row->toStaff->name,
                    'email' => (string) $row->toStaff->email,
                ] : null,
                'triggered_by' => $row->triggeredBy ? [
                    'id' => (int) $row->triggeredBy->id,
                    'name' => (string) $row->triggeredBy->name,
                    'email' => (string) $row->triggeredBy->email,
                ] : null,
                'lead_type' => $row->leadType ? [
                    'id' => (int) $row->leadType->id,
                    'name' => (string) $row->leadType->name,
                ] : null,
                'metrics_snapshot' => is_array($row->metrics_snapshot) ? $row->metrics_snapshot : null,
            ];
        })->values()->all();
    }

    public function resetClientRotationAnchor(Client $client, ?CarbonInterface $at = null): void
    {
        $client->care_rotation_reset_at = ($at ? Carbon::instance($at) : now('Asia/Ho_Chi_Minh'))->toDateTimeString();
        $client->save();
    }

    public function recordAssignmentHistory(
        Client $client,
        ?int $fromStaffId,
        ?int $toStaffId,
        string $actionType,
        ?int $actorId = null,
        ?array $metricsSnapshot = null,
        ?int $sourceTransferRequestId = null,
        ?string $reasonCode = null,
        ?string $note = null,
        ?CarbonInterface $at = null
    ): ClientRotationHistory {
        $client->loadMissing(['assignedStaff:id,department_id', 'salesOwner:id,department_id']);

        return ClientRotationHistory::query()->create([
            'client_id' => (int) $client->id,
            'from_staff_id' => $fromStaffId > 0 ? $fromStaffId : null,
            'to_staff_id' => $toStaffId > 0 ? $toStaffId : null,
            'department_id' => $this->currentDepartmentId($client) ?: null,
            'lead_type_id' => $client->lead_type_id ? (int) $client->lead_type_id : null,
            'triggered_by_user_id' => $actorId > 0 ? $actorId : null,
            'source_transfer_request_id' => $sourceTransferRequestId > 0 ? $sourceTransferRequestId : null,
            'action_type' => $actionType,
            'reason_code' => $reasonCode,
            'note' => $note,
            'metrics_snapshot' => $metricsSnapshot,
            'transferred_at' => ($at ? Carbon::instance($at) : now('Asia/Ho_Chi_Minh'))->toDateTimeString(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function process(?CarbonInterface $now = null): array
    {
        $settings = $this->settings();
        $now = $now ? Carbon::instance($now) : now('Asia/Ho_Chi_Minh');
        $summary = [
            'enabled' => $settings['enabled'],
            'scanned' => 0,
            'warning_sent' => 0,
            'rotated' => 0,
            'skipped_no_recipient' => 0,
            'skipped_pending_manual_transfer' => 0,
            'skipped_out_of_scope' => 0,
            'skipped_not_due' => 0,
        ];

        if (! $settings['enabled']) {
            return $summary + ['message' => 'Tự động xoay khách hàng đang tắt.'];
        }

        if (empty($settings['lead_type_ids']) || empty($settings['participant_user_ids'])) {
            return $summary + ['message' => 'Chưa cấu hình loại khách hoặc danh sách nhân sự tham gia xoay vòng.'];
        }

        $participants = $this->participantUsers($settings);
        if ($participants->isEmpty()) {
            return $summary + ['message' => 'Không có nhân sự hợp lệ trong danh sách xoay vòng.'];
        }

        $participantIds = $participants->pluck('id')->map(fn ($id) => (int) $id)->values()->all();
        $clients = Client::query()
            ->with([
                'leadType:id,name',
                'assignedStaff:id,name,email,department_id,is_active',
                'salesOwner:id,name,email,department_id,is_active',
            ])
            ->whereIn('lead_type_id', $settings['lead_type_ids'])
            ->where(function ($query) use ($participantIds) {
                $query->whereIn('assigned_staff_id', $participantIds)
                    ->orWhere(function ($fallback) use ($participantIds) {
                        $fallback->whereNull('assigned_staff_id')
                            ->whereIn('sales_owner_id', $participantIds);
                    });
            })
            ->get();

        if ($clients->isEmpty()) {
            return $summary + ['message' => 'Không có khách hàng nào nằm trong diện quét xoay vòng.'];
        }

        $summary['scanned'] = $clients->count();
        $pendingTransferClientIds = ClientStaffTransferRequest::query()
            ->where('status', ClientStaffTransferService::STATUS_PENDING)
            ->whereIn('client_id', $clients->pluck('id')->all())
            ->pluck('client_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $pendingTransferSet = array_flip($pendingTransferClientIds);

        $insights = $this->buildClientRotationInsights($clients, $settings, $now);
        $receivedTodayCounts = $this->receivedTodayCounts($participantIds, $now);
        $historicalReceiveCounts = $this->historicalReceiveCounts($participantIds);
        $clientLoadCounts = $this->participantClientLoadCounts($participantIds, $settings['lead_type_ids']);
        $participantsByDepartment = $participants->groupBy(function (User $user) {
            return (int) ($user->department_id ?? 0);
        });

        foreach ($clients as $client) {
            $clientId = (int) $client->id;
            $insight = $insights[$clientId] ?? null;
            if (! is_array($insight) || ! ($insight['in_scope'] ?? false)) {
                $summary['skipped_out_of_scope']++;
                continue;
            }

            if (isset($pendingTransferSet[$clientId])) {
                $summary['skipped_pending_manual_transfer']++;
                continue;
            }

            if ($insight['warning_due'] ?? false) {
                if ($this->sendWarningForClient($client, $insight, $now)) {
                    $summary['warning_sent']++;
                }
            }
        }

        $candidates = $clients
            ->filter(function (Client $client) use ($insights, $pendingTransferSet) {
                $insight = $insights[(int) $client->id] ?? null;

                return is_array($insight)
                    && ($insight['eligible_for_auto_rotation'] ?? false)
                    && ! isset($pendingTransferSet[(int) $client->id]);
            })
            ->sort(function (Client $left, Client $right) use ($insights) {
                $a = $insights[(int) $left->id];
                $b = $insights[(int) $right->id];

                $priorityDiff = ((int) ($b['priority_order'] ?? 0)) <=> ((int) ($a['priority_order'] ?? 0));
                if ($priorityDiff !== 0) {
                    return $priorityDiff;
                }

                $aActivity = (string) ($a['last_meaningful_activity_at'] ?? '');
                $bActivity = (string) ($b['last_meaningful_activity_at'] ?? '');
                if ($aActivity !== $bActivity) {
                    return strcmp($aActivity, $bActivity);
                }

                return ((int) $left->id) <=> ((int) $right->id);
            })
            ->values();

        foreach ($candidates as $client) {
            $clientId = (int) $client->id;
            $insight = $insights[$clientId] ?? null;
            if (! is_array($insight)) {
                continue;
            }

            $rankedRecipients = $this->rankRecipientsForClient(
                $client,
                $participantsByDepartment,
                $historicalReceiveCounts,
                $receivedTodayCounts,
                $clientLoadCounts,
                $settings['daily_receive_limit']
            );

            if ($rankedRecipients->isEmpty()) {
                $summary['skipped_no_recipient']++;
                continue;
            }

            $result = null;
            $selectedRecipient = null;
            $resultStatus = 'recipient_unavailable';

            foreach ($rankedRecipients as $recipient) {
                $attempt = $this->performAutoRotation($clientId, $recipient, $settings, $now);
                $status = (string) ($attempt['status'] ?? 'recipient_unavailable');

                if ($status === 'rotated') {
                    $result = $attempt;
                    $selectedRecipient = $recipient;
                    break;
                }

                if ($status === 'not_due') {
                    $resultStatus = 'not_due';
                    break;
                }
            }

            if (! $result || ! $selectedRecipient) {
                if ($resultStatus === 'not_due') {
                    $summary['skipped_not_due']++;
                } else {
                    $summary['skipped_no_recipient']++;
                }
                continue;
            }

            $summary['rotated']++;
            $fromStaffId = (int) ($result['from_staff_id'] ?? 0);
            $toStaffId = (int) ($selectedRecipient->id ?? 0);
            $receivedTodayCounts[$toStaffId] = (int) ($receivedTodayCounts[$toStaffId] ?? 0) + 1;
            $historicalReceiveCounts[$toStaffId] = (int) ($historicalReceiveCounts[$toStaffId] ?? 0) + 1;
            $clientLoadCounts[$toStaffId] = (int) ($clientLoadCounts[$toStaffId] ?? 0) + 1;
            if ($fromStaffId > 0) {
                $clientLoadCounts[$fromStaffId] = max(0, (int) ($clientLoadCounts[$fromStaffId] ?? 0) - 1);
            }

            $this->notifyAutoRotationOutcome($result, $selectedRecipient);
        }

        return $summary;
    }

    /**
     * @return array<int>
     */
    private function normalizeIdList($value): array
    {
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') {
                return [];
            }

            $decoded = json_decode($trimmed, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $value = $decoded;
            } else {
                $value = preg_split('/[\s,;|]+/', $trimmed) ?: [];
            }
        }

        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();
    }

    private function participantUsers(array $settings): Collection
    {
        return User::query()
            ->whereIn('id', $settings['participant_user_ids'])
            ->whereIn('role', self::ALLOWED_PARTICIPANT_ROLES)
            ->where(function ($query) {
                $query->whereNull('is_active')->orWhere('is_active', true);
            })
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role', 'department_id', 'is_active']);
    }

    /**
     * @return array<string, array<int, CarbonInterface|null>|array<int, bool>>
     */
    private function loadActivityStatsForClients(EloquentCollection $clients): array
    {
        $clientIds = $clients->pluck('id')->map(fn ($id) => (int) $id)->values()->all();
        if (empty($clientIds)) {
            return [
                'care_note_last' => [],
                'comment_history_last' => [],
                'opportunity_last' => [],
                'opportunity_any' => [],
                'contract_last' => [],
                'contract_any' => [],
            ];
        }

        $careNoteLast = ClientCareNote::query()
            ->selectRaw('client_id, MAX(created_at) as last_at')
            ->whereIn('client_id', $clientIds)
            ->groupBy('client_id')
            ->get()
            ->mapWithKeys(function ($row) {
                return [(int) $row->client_id => $row->last_at ? Carbon::parse($row->last_at) : null];
            })
            ->all();

        $opportunityRows = Opportunity::query()
            ->selectRaw('client_id, MAX(created_at) as last_at, COUNT(*) as total')
            ->whereIn('client_id', $clientIds)
            ->groupBy('client_id')
            ->get();
        $opportunityLast = $opportunityRows->mapWithKeys(function ($row) {
            return [(int) $row->client_id => $row->last_at ? Carbon::parse($row->last_at) : null];
        })->all();
        $opportunityAny = $opportunityRows->mapWithKeys(function ($row) {
            return [(int) $row->client_id => (int) $row->total > 0];
        })->all();

        $contractRows = Contract::query()
            ->selectRaw('client_id, MAX(COALESCE(approved_at, created_at)) as last_at, COUNT(*) as total')
            ->whereIn('client_id', $clientIds)
            ->groupBy('client_id')
            ->get();
        $contractLast = $contractRows->mapWithKeys(function ($row) {
            return [(int) $row->client_id => $row->last_at ? Carbon::parse($row->last_at) : null];
        })->all();
        $contractAny = $contractRows->mapWithKeys(function ($row) {
            return [(int) $row->client_id => (int) $row->total > 0];
        })->all();

        $commentHistoryLast = [];
        foreach ($clients as $client) {
            $commentHistoryLast[(int) $client->id] = $this->lastCommentAtFromHistory($client);
        }

        return [
            'care_note_last' => $careNoteLast,
            'comment_history_last' => $commentHistoryLast,
            'opportunity_last' => $opportunityLast,
            'opportunity_any' => $opportunityAny,
            'contract_last' => $contractLast,
            'contract_any' => $contractAny,
        ];
    }

    /**
     * @param  array<string, array<int, CarbonInterface|null>|array<int, bool>>  $stats
     * @return array<string, mixed>
     */
    private function buildInsightFromStats(
        Client $client,
        array $settings,
        CarbonInterface $now,
        array $stats
    ): array {
        $clientId = (int) $client->id;
        $client->loadMissing([
            'leadType:id,name',
            'assignedStaff:id,name,email,department_id',
            'salesOwner:id,name,email,department_id',
        ]);

        $resetAt = $client->care_rotation_reset_at
            ? Carbon::parse($client->care_rotation_reset_at)
            : Carbon::parse($client->created_at ?: $now);
        $actualCommentAt = $this->maxDate(
            $stats['care_note_last'][$clientId] ?? null,
            $stats['comment_history_last'][$clientId] ?? null
        );
        $actualOpportunityAt = $stats['opportunity_last'][$clientId] ?? null;
        $actualContractAt = $stats['contract_last'][$clientId] ?? null;

        $effectiveCommentAt = $this->maxDate($actualCommentAt, $resetAt) ?: $resetAt;
        $effectiveOpportunityAt = $this->maxDate($actualOpportunityAt, $resetAt) ?: $resetAt;
        $effectiveContractAt = $this->maxDate($actualContractAt, $resetAt) ?: $resetAt;

        $daysSinceComment = $effectiveCommentAt->diffInDays($now);
        $daysSinceOpportunity = $effectiveOpportunityAt->diffInDays($now);
        $daysSinceContract = $effectiveContractAt->diffInDays($now);

        $remainingComment = max(0, (int) $settings['comment_stale_days'] - $daysSinceComment);
        $remainingOpportunity = max(0, (int) $settings['opportunity_stale_days'] - $daysSinceOpportunity);
        $remainingContract = max(0, (int) $settings['contract_stale_days'] - $daysSinceContract);
        $daysUntilRotation = max($remainingComment, $remainingOpportunity, $remainingContract);

        $currentOwnerId = $this->currentOwnerId($client);
        $currentDepartmentId = $this->currentDepartmentId($client);
        $leadTypeId = (int) ($client->lead_type_id ?? 0);
        $leadTypeSelected = $leadTypeId > 0 && in_array($leadTypeId, $settings['lead_type_ids'], true);
        $ownerSelected = $currentOwnerId > 0 && in_array($currentOwnerId, $settings['participant_user_ids'], true);
        $inScope = $settings['enabled'] && $leadTypeSelected && $ownerSelected && $currentDepartmentId > 0;

        $protectingSignal = null;
        if ($daysSinceContract < (int) $settings['contract_stale_days']) {
            $protectingSignal = 'contract';
        } elseif ($daysSinceOpportunity < (int) $settings['opportunity_stale_days']) {
            $protectingSignal = 'opportunity';
        } elseif ($daysSinceComment < (int) $settings['comment_stale_days']) {
            $protectingSignal = 'comment';
        }

        $eligible = $inScope && $daysUntilRotation <= 0;
        $warningDue = $inScope
            && ! $eligible
            && $daysUntilRotation > 0
            && $daysUntilRotation <= (int) $settings['warning_days'];

        $hasAnyContract = (bool) ($stats['contract_any'][$clientId] ?? false);
        $hasAnyOpportunity = (bool) ($stats['opportunity_any'][$clientId] ?? false);
        [$priorityBucket, $priorityOrder] = $this->priorityBucket($hasAnyContract, $hasAnyOpportunity);

        $scopeReasons = [];
        if (! $settings['enabled']) {
            $scopeReasons[] = 'settings_disabled';
        }
        if (! $leadTypeSelected) {
            $scopeReasons[] = 'lead_type_not_selected';
        }
        if (! $ownerSelected) {
            $scopeReasons[] = 'owner_not_selected';
        }
        if ($currentDepartmentId <= 0) {
            $scopeReasons[] = 'department_missing';
        }

        $lastMeaningfulActivityAt = $this->maxDate($effectiveContractAt, $this->maxDate($effectiveOpportunityAt, $effectiveCommentAt)) ?: $resetAt;

        return [
            'enabled' => (bool) $settings['enabled'],
            'in_scope' => $inScope,
            'scope_reasons' => $scopeReasons,
            'current_owner_id' => $currentOwnerId > 0 ? $currentOwnerId : null,
            'current_owner_name' => $this->currentOwnerName($client),
            'current_department_id' => $currentDepartmentId > 0 ? $currentDepartmentId : null,
            'lead_type_id' => $leadTypeId > 0 ? $leadTypeId : null,
            'lead_type_name' => $client->leadType ? (string) $client->leadType->name : null,
            'rotation_reset_at' => optional($resetAt)->toIso8601String(),
            'last_comment_at' => $actualCommentAt?->toIso8601String(),
            'last_opportunity_at' => $actualOpportunityAt?->toIso8601String(),
            'last_contract_at' => $actualContractAt?->toIso8601String(),
            'effective_comment_at' => $effectiveCommentAt->toIso8601String(),
            'effective_opportunity_at' => $effectiveOpportunityAt->toIso8601String(),
            'effective_contract_at' => $effectiveContractAt->toIso8601String(),
            'days_since_comment' => $daysSinceComment,
            'days_since_opportunity' => $daysSinceOpportunity,
            'days_since_contract' => $daysSinceContract,
            'remaining_comment_days' => $remainingComment,
            'remaining_opportunity_days' => $remainingOpportunity,
            'remaining_contract_days' => $remainingContract,
            'days_until_rotation' => $daysUntilRotation,
            'warning_due' => $warningDue,
            'eligible_for_auto_rotation' => $eligible,
            'protecting_signal' => $protectingSignal,
            'protecting_label' => $this->protectingLabel($protectingSignal),
            'priority_bucket' => $priorityBucket,
            'priority_order' => $priorityOrder,
            'last_meaningful_activity_at' => $lastMeaningfulActivityAt->toIso8601String(),
            'thresholds' => [
                'comment_stale_days' => (int) $settings['comment_stale_days'],
                'opportunity_stale_days' => (int) $settings['opportunity_stale_days'],
                'contract_stale_days' => (int) $settings['contract_stale_days'],
                'warning_days' => (int) $settings['warning_days'],
                'daily_receive_limit' => (int) $settings['daily_receive_limit'],
            ],
            'status_label' => $this->rotationStatusLabel($inScope, $protectingSignal, $eligible, $daysUntilRotation, $scopeReasons),
        ];
    }

    private function lastCommentAtFromHistory(Client $client): ?CarbonInterface
    {
        $history = $client->comments_history_json;
        if (! is_array($history)) {
            return null;
        }

        $latest = null;
        foreach ($history as $row) {
            if (! is_array($row)) {
                continue;
            }

            $createdAt = trim((string) ($row['created_at'] ?? ''));
            if ($createdAt === '') {
                continue;
            }

            try {
                $parsed = Carbon::parse($createdAt);
            } catch (\Throwable $e) {
                continue;
            }

            if (! $latest || $parsed->gt($latest)) {
                $latest = $parsed;
            }
        }

        return $latest;
    }

    private function currentOwnerId(Client $client): int
    {
        $assignedStaffId = (int) ($client->assigned_staff_id ?? 0);
        if ($assignedStaffId > 0) {
            return $assignedStaffId;
        }

        return (int) ($client->sales_owner_id ?? 0);
    }

    private function currentOwnerName(Client $client): ?string
    {
        if ($client->assignedStaff) {
            return (string) $client->assignedStaff->name;
        }

        if ($client->salesOwner) {
            return (string) $client->salesOwner->name;
        }

        return null;
    }

    private function currentDepartmentId(Client $client): int
    {
        if ((int) ($client->assigned_department_id ?? 0) > 0) {
            return (int) $client->assigned_department_id;
        }

        if ((int) optional($client->assignedStaff)->department_id > 0) {
            return (int) $client->assignedStaff->department_id;
        }

        return (int) optional($client->salesOwner)->department_id;
    }

    /**
     * @return array{0: string, 1: int}
     */
    private function priorityBucket(bool $hasAnyContract, bool $hasAnyOpportunity): array
    {
        if ($hasAnyContract) {
            return ['contract', 3];
        }

        if ($hasAnyOpportunity) {
            return ['opportunity', 2];
        }

        return ['lead', 1];
    }

    private function protectingLabel(?string $signal): ?string
    {
        return match ($signal) {
            'contract' => 'Đang được giữ do còn hợp đồng mới',
            'opportunity' => 'Đang được giữ do còn cơ hội mới',
            'comment' => 'Đang được giữ do còn bình luận / ghi chú mới',
            default => null,
        };
    }

    /**
     * @param  array<int, string>  $scopeReasons
     */
    private function rotationStatusLabel(
        bool $inScope,
        ?string $protectingSignal,
        bool $eligible,
        int $daysUntilRotation,
        array $scopeReasons
    ): string {
        if (! $inScope) {
            if (in_array('settings_disabled', $scopeReasons, true)) {
                return 'Tự động xoay khách đang tắt';
            }
            if (in_array('lead_type_not_selected', $scopeReasons, true)) {
                return 'Không nằm trong loại khách được xoay';
            }
            if (in_array('owner_not_selected', $scopeReasons, true)) {
                return 'Nhân sự phụ trách chưa nằm trong danh sách xoay';
            }

            return 'Chưa đủ điều kiện cấu hình để xoay';
        }

        if ($eligible) {
            return 'Đủ điều kiện điều chuyển tự động';
        }

        if ($protectingSignal === 'contract') {
            return 'Đang giữ do còn hợp đồng mới';
        }
        if ($protectingSignal === 'opportunity') {
            return 'Đang giữ do còn cơ hội mới';
        }
        if ($protectingSignal === 'comment') {
            return 'Đang giữ do còn bình luận / ghi chú mới';
        }

        return sprintf('Còn %d ngày nữa sẽ vào diện điều chuyển', $daysUntilRotation);
    }

    /**
     * @param  array<int, int>  $participantIds
     * @return array<int, int>
     */
    private function receivedTodayCounts(array $participantIds, CarbonInterface $now): array
    {
        if (empty($participantIds)) {
            return [];
        }

        return ClientRotationHistory::query()
            ->where('action_type', self::ACTION_AUTO_ROTATION)
            ->whereDate('transferred_at', $now->toDateString())
            ->whereIn('to_staff_id', $participantIds)
            ->selectRaw('to_staff_id, COUNT(*) as total')
            ->groupBy('to_staff_id')
            ->pluck('total', 'to_staff_id')
            ->mapWithKeys(fn ($count, $userId) => [(int) $userId => (int) $count])
            ->all();
    }

    /**
     * @param  array<int, int>  $participantIds
     * @return array<int, int>
     */
    private function historicalReceiveCounts(array $participantIds): array
    {
        if (empty($participantIds)) {
            return [];
        }

        return ClientRotationHistory::query()
            ->where('action_type', self::ACTION_AUTO_ROTATION)
            ->whereIn('to_staff_id', $participantIds)
            ->selectRaw('to_staff_id, COUNT(*) as total')
            ->groupBy('to_staff_id')
            ->pluck('total', 'to_staff_id')
            ->mapWithKeys(fn ($count, $userId) => [(int) $userId => (int) $count])
            ->all();
    }

    /**
     * @param  array<int, int>  $participantIds
     * @param  array<int, int>  $leadTypeIds
     * @return array<int, int>
     */
    private function participantClientLoadCounts(array $participantIds, array $leadTypeIds): array
    {
        if (empty($participantIds) || empty($leadTypeIds)) {
            return [];
        }

        return Client::query()
            ->where(function ($query) use ($participantIds) {
                $query->whereIn('assigned_staff_id', $participantIds)
                    ->orWhere(function ($fallback) use ($participantIds) {
                        $fallback->whereNull('assigned_staff_id')
                            ->whereIn('sales_owner_id', $participantIds);
                    });
            })
            ->whereIn('lead_type_id', $leadTypeIds)
            ->selectRaw('CASE WHEN assigned_staff_id IS NOT NULL THEN assigned_staff_id ELSE sales_owner_id END as owner_user_id, COUNT(*) as total')
            ->groupBy('owner_user_id')
            ->pluck('total', 'owner_user_id')
            ->mapWithKeys(fn ($count, $userId) => [(int) $userId => (int) $count])
            ->all();
    }

    private function rankRecipientsForClient(
        Client $client,
        Collection $participantsByDepartment,
        array $historicalReceiveCounts,
        array $receivedTodayCounts,
        array $clientLoadCounts,
        int $dailyReceiveLimit
    ): Collection {
        $departmentId = $this->currentDepartmentId($client);
        if ($departmentId <= 0) {
            return collect();
        }

        /** @var Collection<int, User> $candidates */
        $candidates = $participantsByDepartment->get($departmentId, collect())
            ->filter(function (User $user) use ($client, $receivedTodayCounts, $dailyReceiveLimit) {
                return (int) $user->id !== $this->currentOwnerId($client)
                    && in_array((string) $user->role, self::ALLOWED_PARTICIPANT_ROLES, true)
                    && (int) ($receivedTodayCounts[(int) $user->id] ?? 0) < $dailyReceiveLimit;
            })
            ->values();

        if ($candidates->isEmpty()) {
            return collect();
        }

        $ranked = $candidates->map(function (User $user) use ($historicalReceiveCounts, $receivedTodayCounts, $clientLoadCounts) {
            return [
                'user' => $user,
                'historical_received' => (int) ($historicalReceiveCounts[(int) $user->id] ?? 0),
                'received_today' => (int) ($receivedTodayCounts[(int) $user->id] ?? 0),
                'client_load' => (int) ($clientLoadCounts[(int) $user->id] ?? 0),
                'rand' => random_int(1, PHP_INT_MAX),
            ];
        })->sort(function (array $left, array $right) {
            $historicalDiff = $left['historical_received'] <=> $right['historical_received'];
            if ($historicalDiff !== 0) {
                return $historicalDiff;
            }

            $loadDiff = $left['client_load'] <=> $right['client_load'];
            if ($loadDiff !== 0) {
                return $loadDiff;
            }

            $receivedDiff = $left['received_today'] <=> $right['received_today'];
            if ($receivedDiff !== 0) {
                return $receivedDiff;
            }

            return $left['rand'] <=> $right['rand'];
        })->pluck('user')->values();

        return $ranked;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function performAutoRotation(
        int $clientId,
        User $recipientCandidate,
        array $settings,
        CarbonInterface $now
    ): array {
        return DB::transaction(function () use ($clientId, $recipientCandidate, $settings, $now) {
            $client = Client::query()
                ->lockForUpdate()
                ->with([
                    'leadType:id,name',
                    'assignedStaff:id,name,email,department_id,is_active',
                    'salesOwner:id,name,email,department_id,is_active',
                ])
                ->find($clientId);

            if (! $client) {
                return ['status' => 'recipient_unavailable'];
            }

            if (ClientStaffTransferRequest::query()
                ->where('client_id', $clientId)
                ->where('status', ClientStaffTransferService::STATUS_PENDING)
                ->exists()) {
                return ['status' => 'not_due'];
            }

            $freshInsight = $this->buildClientRotationInsight($client, $settings, $now);
            if (! ($freshInsight['eligible_for_auto_rotation'] ?? false)) {
                return ['status' => 'not_due'];
            }

            $recipient = User::query()
                ->where('id', (int) $recipientCandidate->id)
                ->first(['id', 'name', 'email', 'role', 'department_id', 'is_active']);

            if (! $recipient || ! $this->recipientCanReceiveClient($recipient, $client, $settings, $now)) {
                return ['status' => 'recipient_unavailable'];
            }

            $fromStaffId = $this->currentOwnerId($client);
            $fromStaffName = $this->currentOwnerName($client);

            $client->assigned_staff_id = (int) $recipient->id;
            $client->sales_owner_id = (int) $recipient->id;
            if ((int) ($recipient->department_id ?? 0) > 0) {
                $client->assigned_department_id = (int) $recipient->department_id;
            }
            $client->care_rotation_reset_at = $now->toDateTimeString();
            $client->save();

            $this->recordAssignmentHistory(
                $client,
                $fromStaffId > 0 ? $fromStaffId : null,
                (int) $recipient->id,
                self::ACTION_AUTO_ROTATION,
                null,
                $freshInsight,
                null,
                'inactive',
                'Điều chuyển tự động do khách hàng không có hoạt động chăm sóc phù hợp theo cấu hình xoay vòng.',
                $now
            );

            return [
                'status' => 'rotated',
                'client_id' => (int) $client->id,
                'client_name' => (string) ($client->name ?: 'Khách hàng'),
                'from_staff_id' => $fromStaffId > 0 ? $fromStaffId : null,
                'from_staff_name' => $fromStaffName,
                'to_staff_id' => (int) $recipient->id,
                'to_staff_name' => (string) $recipient->name,
                'insight' => $freshInsight,
            ];
        });
    }

    private function recipientCanReceiveClient(
        User $recipient,
        Client $client,
        array $settings,
        CarbonInterface $now
    ): bool {
        $recipientId = (int) ($recipient->id ?? 0);
        if ($recipientId <= 0) {
            return false;
        }

        if (! in_array((string) ($recipient->role ?? ''), self::ALLOWED_PARTICIPANT_ROLES, true)) {
            return false;
        }

        if (! is_null($recipient->is_active) && ! (bool) $recipient->is_active) {
            return false;
        }

        if (! in_array($recipientId, $settings['participant_user_ids'], true)) {
            return false;
        }

        if ($recipientId === $this->currentOwnerId($client)) {
            return false;
        }

        $departmentId = $this->currentDepartmentId($client);
        if ($departmentId <= 0 || (int) ($recipient->department_id ?? 0) !== $departmentId) {
            return false;
        }

        return $this->receivedTodayAutoRotationCountForUser($recipientId, $now) < (int) $settings['daily_receive_limit'];
    }

    private function receivedTodayAutoRotationCountForUser(int $userId, CarbonInterface $now): int
    {
        if ($userId <= 0) {
            return 0;
        }

        return (int) ClientRotationHistory::query()
            ->where('action_type', self::ACTION_AUTO_ROTATION)
            ->where('to_staff_id', $userId)
            ->whereDate('transferred_at', $now->toDateString())
            ->count();
    }

    private function sendWarningForClient(Client $client, array $insight, CarbonInterface $now): bool
    {
        $ownerId = (int) ($insight['current_owner_id'] ?? 0);
        if ($ownerId <= 0) {
            return false;
        }

        if (ClientRotationWarningLog::query()
            ->where('client_id', (int) $client->id)
            ->where('user_id', $ownerId)
            ->whereDate('warning_date', $now->toDateString())
            ->exists()) {
            return false;
        }

        $daysUntilRotation = (int) ($insight['days_until_rotation'] ?? 0);
        $title = sprintf('Khách hàng "%s" sắp vào diện điều chuyển', $client->name ?: 'Khách hàng');
        $body = sprintf(
            '%s • đã %d ngày chưa có bình luận/ghi chú, %d ngày chưa có cơ hội mới, %d ngày chưa có hợp đồng mới. Còn %d ngày nữa sẽ vào diện điều chuyển tự động.',
            $client->name ?: 'Khách hàng',
            (int) ($insight['days_since_comment'] ?? 0),
            (int) ($insight['days_since_opportunity'] ?? 0),
            (int) ($insight['days_since_contract'] ?? 0),
            $daysUntilRotation
        );

        app(NotificationService::class)->notifyUsers(
            [$ownerId],
            $title,
            $body,
            [
                'type' => 'crm_client_rotation_warning',
                'category' => 'crm_realtime',
                'client_id' => (int) $client->id,
                'days_until_rotation' => $daysUntilRotation,
                'days_since_comment' => (int) ($insight['days_since_comment'] ?? 0),
                'days_since_opportunity' => (int) ($insight['days_since_opportunity'] ?? 0),
                'days_since_contract' => (int) ($insight['days_since_contract'] ?? 0),
            ]
        );

        ClientRotationWarningLog::query()->create([
            'client_id' => (int) $client->id,
            'user_id' => $ownerId,
            'warning_date' => $now->toDateString(),
            'days_until_rotation' => $daysUntilRotation,
            'payload' => $insight,
        ]);

        return true;
    }

    /**
     * @param  array<string, mixed>  $result
     */
    private function notifyAutoRotationOutcome(array $result, User $recipient): void
    {
        $clientName = trim((string) ($result['client_name'] ?? 'Khách hàng'));
        $clientId = (int) ($result['client_id'] ?? 0);
        $payload = [
            'category' => 'crm_realtime',
            'client_id' => $clientId,
            'type' => 'crm_client_auto_rotated',
        ];

        $fromStaffId = (int) ($result['from_staff_id'] ?? 0);
        if ($fromStaffId > 0) {
            app(NotificationService::class)->notifyUsers(
                [$fromStaffId],
                'Khách hàng đã bị điều chuyển tự động',
                sprintf('Khách hàng "%s" của bạn đã bị điều chuyển theo cơ chế xoay vòng tự động.', $clientName),
                array_merge($payload, [
                    'type' => 'crm_client_auto_rotated_out',
                    'direction' => 'out',
                ])
            );
        }

        app(NotificationService::class)->notifyUsers(
            [(int) $recipient->id],
            'Bạn vừa nhận thêm khách hàng phụ trách',
            sprintf('Khách hàng "%s" vừa được điều chuyển về cho bạn theo cơ chế xoay vòng tự động.', $clientName),
            array_merge($payload, [
                'type' => 'crm_client_auto_rotated_in',
                'direction' => 'in',
            ])
        );
    }

    private function actionLabel(string $actionType): string
    {
        return match ($actionType) {
            self::ACTION_AUTO_ROTATION => 'Điều chuyển tự động',
            self::ACTION_MANUAL_TRANSFER_REQUEST => 'Phiếu chuyển phụ trách được chấp nhận',
            self::ACTION_MANUAL_DIRECT_ASSIGNMENT => 'Đổi phụ trách trực tiếp',
            default => $actionType,
        };
    }

    private function maxDate(?CarbonInterface $left, ?CarbonInterface $right): ?CarbonInterface
    {
        if (! $left) {
            return $right;
        }
        if (! $right) {
            return $left;
        }

        return $left->gte($right) ? $left : $right;
    }
}
