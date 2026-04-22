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

    private const WARNING_SCHEDULES = [
        'comment' => [
            'window_days' => 2,
            'interval_days' => 1,
            'label' => 'bình luận / ghi chú',
        ],
        'opportunity' => [
            'window_days' => 14,
            'interval_days' => 3,
            'label' => 'cơ hội',
        ],
        'contract' => [
            'window_days' => 45,
            'interval_days' => 7,
            'label' => 'hợp đồng',
        ],
    ];

    public function settings(): array
    {
        $setting = AppSetting::query()->first();
        $defaults = AppSetting::defaults();

        return [
            'enabled' => $setting ? (bool) ($setting->client_rotation_enabled ?? false) : false,
            'comment_stale_days' => max(1, (int) ($setting->client_rotation_comment_stale_days ?? ($defaults['client_rotation_comment_stale_days'] ?? 3))),
            'opportunity_stale_days' => max(1, (int) ($setting->client_rotation_opportunity_stale_days ?? ($defaults['client_rotation_opportunity_stale_days'] ?? 30))),
            'contract_stale_days' => max(1, (int) ($setting->client_rotation_contract_stale_days ?? ($defaults['client_rotation_contract_stale_days'] ?? 90))),
            'daily_receive_limit' => max(1, (int) ($setting->client_rotation_daily_receive_limit ?? ($defaults['client_rotation_daily_receive_limit'] ?? 5))),
            'lead_type_ids' => $this->normalizeIdList($setting?->client_rotation_lead_type_ids ?? ($defaults['client_rotation_lead_type_ids'] ?? [])),
            'participant_user_ids' => $this->normalizeIdList($setting?->client_rotation_participant_user_ids ?? ($defaults['client_rotation_participant_user_ids'] ?? [])),
            'same_department_only' => $setting ? (bool) ($setting->client_rotation_same_department_only ?? ($defaults['client_rotation_same_department_only'] ?? false)) : (bool) ($defaults['client_rotation_same_department_only'] ?? false),
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

                $triggerPriorityDiff = ((int) ($b['trigger_priority'] ?? 0)) <=> ((int) ($a['trigger_priority'] ?? 0));
                if ($triggerPriorityDiff !== 0) {
                    return $triggerPriorityDiff;
                }

                $triggerOverdueDiff = ((int) ($b['trigger_overdue_days'] ?? 0)) <=> ((int) ($a['trigger_overdue_days'] ?? 0));
                if ($triggerOverdueDiff !== 0) {
                    return $triggerOverdueDiff;
                }

                $aTriggerAt = (string) ($a['trigger_effective_at'] ?? '');
                $bTriggerAt = (string) ($b['trigger_effective_at'] ?? '');
                if ($aTriggerAt !== $bTriggerAt) {
                    return strcmp($aTriggerAt, $bTriggerAt);
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
                $participants,
                $historicalReceiveCounts,
                $receivedTodayCounts,
                $clientLoadCounts,
                $settings['daily_receive_limit'],
                (bool) ($settings['same_department_only'] ?? false)
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

        $rotationAnchorAt = $resetAt;
        $rotationAnchorSource = $client->care_rotation_reset_at ? 'assignment_reset' : 'client_created';
        if ($actualContractAt && $actualContractAt->gt($rotationAnchorAt)) {
            $rotationAnchorAt = $actualContractAt;
            $rotationAnchorSource = 'contract_reset';
        }

        $effectiveContractAt = $this->maxDate($actualContractAt, $resetAt) ?: $resetAt;
        $effectiveOpportunityAt = $this->maxDate($actualOpportunityAt, $effectiveContractAt) ?: $effectiveContractAt;
        $effectiveCommentAt = $this->maxDate($actualCommentAt, $effectiveOpportunityAt) ?: $effectiveOpportunityAt;

        $daysSinceComment = $effectiveCommentAt->diffInDays($now);
        $daysSinceOpportunity = $effectiveOpportunityAt->diffInDays($now);
        $daysSinceContract = $effectiveContractAt->diffInDays($now);

        $remainingComment = max(0, (int) $settings['comment_stale_days'] - $daysSinceComment);
        $remainingOpportunity = max(0, (int) $settings['opportunity_stale_days'] - $daysSinceOpportunity);
        $remainingContract = max(0, (int) $settings['contract_stale_days'] - $daysSinceContract);
        $commentOverdue = $daysSinceComment >= (int) $settings['comment_stale_days'];
        $opportunityOverdue = $daysSinceOpportunity >= (int) $settings['opportunity_stale_days'];
        $contractOverdue = $daysSinceContract >= (int) $settings['contract_stale_days'];

        $triggerRule = $this->resolveRotationRule([
            [
                'type' => 'comment',
                'label' => 'bình luận / ghi chú mới',
                'days_since' => $daysSinceComment,
                'threshold' => (int) $settings['comment_stale_days'],
                'remaining_days' => $remainingComment,
                'overdue' => $commentOverdue,
                'priority' => 1,
            ],
            [
                'type' => 'opportunity',
                'label' => 'cơ hội mới',
                'days_since' => $daysSinceOpportunity,
                'threshold' => (int) $settings['opportunity_stale_days'],
                'remaining_days' => $remainingOpportunity,
                'overdue' => $opportunityOverdue,
                'priority' => 2,
            ],
            [
                'type' => 'contract',
                'label' => 'hợp đồng mới',
                'days_since' => $daysSinceContract,
                'threshold' => (int) $settings['contract_stale_days'],
                'remaining_days' => $remainingContract,
                'overdue' => $contractOverdue,
                'priority' => 3,
            ],
        ]);
        $daysUntilRotation = (int) ($triggerRule['days_until_rotation'] ?? 0);

        $currentOwnerId = $this->currentOwnerId($client);
        $currentDepartmentId = $this->currentDepartmentId($client);
        $sameDepartmentOnly = (bool) ($settings['same_department_only'] ?? false);
        $leadTypeId = (int) ($client->lead_type_id ?? 0);
        $leadTypeSelected = $leadTypeId > 0 && in_array($leadTypeId, $settings['lead_type_ids'], true);
        $ownerSelected = $currentOwnerId > 0 && in_array($currentOwnerId, $settings['participant_user_ids'], true);
        $inScope = $settings['enabled']
            && $leadTypeSelected
            && $ownerSelected
            && (! $sameDepartmentOnly || $currentDepartmentId > 0);

        $triggerType = $triggerRule['type'] ?? null;
        $eligible = $inScope && (bool) ($triggerRule['overdue'] ?? false);
        $warningRulesDue = $inScope
            ? $this->buildWarningRulesDue([
                'comment' => [
                    'days_since' => $daysSinceComment,
                    'threshold' => (int) $settings['comment_stale_days'],
                    'remaining_days' => $remainingComment,
                ],
                'opportunity' => [
                    'days_since' => $daysSinceOpportunity,
                    'threshold' => (int) $settings['opportunity_stale_days'],
                    'remaining_days' => $remainingOpportunity,
                ],
                'contract' => [
                    'days_since' => $daysSinceContract,
                    'threshold' => (int) $settings['contract_stale_days'],
                    'remaining_days' => $remainingContract,
                ],
            ])
            : [];
        $warningDue = ! $eligible && ! empty($warningRulesDue);

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
        if ($sameDepartmentOnly && $currentDepartmentId <= 0) {
            $scopeReasons[] = 'department_missing';
        }

        $lastMeaningfulActivityAt = $this->maxDate($effectiveContractAt, $this->maxDate($effectiveOpportunityAt, $effectiveCommentAt)) ?: $rotationAnchorAt;
        $triggerPriority = $this->triggerPriority((string) $triggerType);
        $triggerThreshold = (int) ($triggerRule['threshold'] ?? 0);
        $triggerDaysSince = (int) ($triggerRule['days_since'] ?? 0);
        $triggerOverdueDays = max(0, $triggerDaysSince - $triggerThreshold);
        $triggerEffectiveAt = match ((string) $triggerType) {
            'contract' => $effectiveContractAt,
            'opportunity' => $effectiveOpportunityAt,
            'comment' => $effectiveCommentAt,
            default => $lastMeaningfulActivityAt,
        };

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
            'rotation_anchor_at' => optional($rotationAnchorAt)->toIso8601String(),
            'rotation_anchor_source' => $rotationAnchorSource,
            'rotation_anchor_label' => $this->rotationAnchorLabel($rotationAnchorSource),
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
            'warning_rules_due' => $warningRulesDue,
            'eligible_for_auto_rotation' => $eligible,
            'trigger_type' => $triggerType,
            'trigger_days_since' => $triggerDaysSince,
            'trigger_threshold_days' => $triggerThreshold,
            'trigger_priority' => $triggerPriority,
            'trigger_overdue_days' => $triggerOverdueDays,
            'trigger_effective_at' => $triggerEffectiveAt?->toIso8601String(),
            'trigger_label' => $this->rotationRuleLabel($triggerRule, $eligible),
            'protecting_signal' => $triggerType,
            'protecting_label' => $this->rotationRuleLabel($triggerRule, $eligible),
            'priority_bucket' => $priorityBucket,
            'priority_order' => $priorityOrder,
            'last_meaningful_activity_at' => $lastMeaningfulActivityAt->toIso8601String(),
            'thresholds' => [
                'comment_stale_days' => (int) $settings['comment_stale_days'],
                'opportunity_stale_days' => (int) $settings['opportunity_stale_days'],
                'contract_stale_days' => (int) $settings['contract_stale_days'],
                'daily_receive_limit' => (int) $settings['daily_receive_limit'],
                'same_department_only' => $sameDepartmentOnly,
            ],
            'status_label' => $this->rotationStatusLabel($inScope, $triggerRule, $eligible, $daysUntilRotation, $scopeReasons),
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

    /**
     * @param  array<string, int|string|bool>|null  $rule
     */
    private function rotationRuleLabel(?array $rule, bool $eligible): ?string
    {
        if (! is_array($rule) || empty($rule['type'])) {
            return null;
        }

        $type = (string) $rule['type'];
        $daysSince = (int) ($rule['days_since'] ?? 0);
        $threshold = (int) ($rule['threshold'] ?? 0);
        $daysUntilRotation = (int) ($rule['days_until_rotation'] ?? 0);

        return match ($type) {
            'contract' => $eligible
                ? sprintf('Đã %d ngày chưa có hợp đồng mới. Theo cấu hình, chạm mốc %d ngày là điều chuyển ngay, kể cả vẫn có bình luận hoặc cơ hội mới.', $daysSince, $threshold)
                : sprintf('Mốc gần nhất đang theo dõi là hợp đồng: còn %d ngày nữa sẽ chạm ngưỡng %d ngày chưa có hợp đồng mới. Khi chạm mốc này hệ thống sẽ điều chuyển ngay, kể cả vẫn có bình luận hoặc cơ hội mới.', $daysUntilRotation, $threshold),
            'opportunity' => $eligible
                ? sprintf('Đã %d ngày chưa có cơ hội mới. Theo cấu hình, chạm mốc %d ngày là điều chuyển ngay, kể cả vẫn có bình luận mới.', $daysSince, $threshold)
                : sprintf('Mốc gần nhất đang theo dõi là cơ hội: còn %d ngày nữa sẽ chạm ngưỡng %d ngày chưa có cơ hội mới. Khi chạm mốc này hệ thống sẽ điều chuyển ngay, kể cả vẫn có bình luận mới.', $daysUntilRotation, $threshold),
            'comment' => $eligible
                ? sprintf('Đã %d ngày chưa có bình luận / ghi chú mới. Theo cấu hình, chạm mốc %d ngày là điều chuyển ngay.', $daysSince, $threshold)
                : sprintf('Mốc gần nhất đang theo dõi là bình luận / ghi chú: còn %d ngày nữa sẽ chạm ngưỡng %d ngày chưa có cập nhật chăm sóc mới.', $daysUntilRotation, $threshold),
            default => null,
        };
    }

    /**
     * @param  array<int, string>  $scopeReasons
     */
    private function rotationStatusLabel(
        bool $inScope,
        ?array $triggerRule,
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
            if (in_array('department_missing', $scopeReasons, true)) {
                return 'Thiếu phòng ban để xoay trong cùng phòng ban';
            }

            return 'Chưa đủ điều kiện cấu hình để xoay';
        }

        $triggerType = (string) ($triggerRule['type'] ?? '');
        $daysSince = (int) ($triggerRule['days_since'] ?? 0);

        if ($eligible) {
            return match ($triggerType) {
                'contract' => sprintf('Đủ điều kiện điều chuyển do đã %d ngày chưa có hợp đồng mới', $daysSince),
                'opportunity' => sprintf('Đủ điều kiện điều chuyển do đã %d ngày chưa có cơ hội mới', $daysSince),
                'comment' => sprintf('Đủ điều kiện điều chuyển do đã %d ngày chưa có bình luận / ghi chú mới', $daysSince),
                default => 'Đủ điều kiện điều chuyển tự động',
            };
        }

        return match ($triggerType) {
            'contract' => sprintf('Còn %d ngày nữa sẽ chạm mốc hợp đồng', $daysUntilRotation),
            'opportunity' => sprintf('Còn %d ngày nữa sẽ chạm mốc cơ hội', $daysUntilRotation),
            'comment' => sprintf('Còn %d ngày nữa sẽ chạm mốc chăm sóc', $daysUntilRotation),
            default => sprintf('Còn %d ngày nữa sẽ vào diện điều chuyển', $daysUntilRotation),
        };
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
        Collection $participants,
        array $historicalReceiveCounts,
        array $receivedTodayCounts,
        array $clientLoadCounts,
        int $dailyReceiveLimit,
        bool $sameDepartmentOnly = false
    ): Collection {
        $departmentId = $sameDepartmentOnly ? $this->currentDepartmentId($client) : 0;
        if ($sameDepartmentOnly && $departmentId <= 0) {
            return collect();
        }

        /** @var Collection<int, User> $candidates */
        $candidates = $participants
            ->filter(function (User $user) use ($client, $receivedTodayCounts, $dailyReceiveLimit, $sameDepartmentOnly, $departmentId) {
                return (int) $user->id !== $this->currentOwnerId($client)
                    && in_array((string) $user->role, self::ALLOWED_PARTICIPANT_ROLES, true)
                    && (! $sameDepartmentOnly || (int) ($user->department_id ?? 0) === $departmentId)
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

            $triggerType = (string) ($freshInsight['trigger_type'] ?? 'inactive');
            $triggerDays = (int) ($freshInsight['trigger_days_since'] ?? 0);
            $triggerThreshold = (int) ($freshInsight['trigger_threshold_days'] ?? 0);

            $this->recordAssignmentHistory(
                $client,
                $fromStaffId > 0 ? $fromStaffId : null,
                (int) $recipient->id,
                self::ACTION_AUTO_ROTATION,
                null,
                $freshInsight,
                null,
                $this->rotationReasonCode($triggerType),
                $this->autoRotationNote($triggerType, $triggerDays, $triggerThreshold),
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

        if ((bool) ($settings['same_department_only'] ?? false)) {
            $departmentId = $this->currentDepartmentId($client);
            if ($departmentId <= 0 || (int) ($recipient->department_id ?? 0) !== $departmentId) {
                return false;
            }
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

        $warningRulesDue = collect($insight['warning_rules_due'] ?? [])
            ->filter(fn ($rule) => is_array($rule) && ! empty($rule['type']))
            ->values()
            ->all();
        if (empty($warningRulesDue)) {
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
        $warningLines = collect($warningRulesDue)
            ->sort(function (array $left, array $right) {
                $remainingDiff = ((int) ($left['remaining_days'] ?? 0)) <=> ((int) ($right['remaining_days'] ?? 0));
                if ($remainingDiff !== 0) {
                    return $remainingDiff;
                }

                return $this->triggerPriority((string) ($right['type'] ?? '')) <=> $this->triggerPriority((string) ($left['type'] ?? ''));
            })
            ->map(function (array $rule) {
                return sprintf(
                    '%s: còn %d ngày nữa sẽ chạm mốc %d ngày chưa có %s mới',
                    $this->triggerShortLabel((string) ($rule['type'] ?? '')),
                    (int) ($rule['remaining_days'] ?? 0),
                    (int) ($rule['threshold'] ?? 0),
                    $this->warningObjectLabel((string) ($rule['type'] ?? ''))
                );
            })
            ->values()
            ->all();
        $title = sprintf('Khách hàng "%s" sắp vào diện điều chuyển', $client->name ?: 'Khách hàng');
        $body = sprintf(
            '%s • %s. Hiện tại đã %d ngày chưa có bình luận/ghi chú, %d ngày chưa có cơ hội mới, %d ngày chưa có hợp đồng mới.',
            $client->name ?: 'Khách hàng',
            implode('; ', $warningLines),
            (int) ($insight['days_since_comment'] ?? 0),
            (int) ($insight['days_since_opportunity'] ?? 0),
            (int) ($insight['days_since_contract'] ?? 0),
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
                'trigger_type' => (string) ($insight['trigger_type'] ?? ''),
                'warning_rules_due' => $warningRulesDue,
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

    /**
     * @param  array<int, array<string, int|string|bool>>  $rules
     * @return array<string, int|string|bool>|null
     */
    private function resolveRotationRule(array $rules): ?array
    {
        if (empty($rules)) {
            return null;
        }

        $overdueRules = array_values(array_filter($rules, fn (array $rule) => (bool) ($rule['overdue'] ?? false)));
        if (! empty($overdueRules)) {
            usort($overdueRules, function (array $left, array $right) {
                return ((int) ($right['priority'] ?? 0)) <=> ((int) ($left['priority'] ?? 0));
            });

            $rule = $overdueRules[0];
            $rule['days_until_rotation'] = 0;

            return $rule;
        }

        usort($rules, function (array $left, array $right) {
            $remainingDiff = ((int) ($left['remaining_days'] ?? 0)) <=> ((int) ($right['remaining_days'] ?? 0));
            if ($remainingDiff !== 0) {
                return $remainingDiff;
            }

            return ((int) ($right['priority'] ?? 0)) <=> ((int) ($left['priority'] ?? 0));
        });

        $rule = $rules[0];
        $rule['days_until_rotation'] = (int) ($rule['remaining_days'] ?? 0);

        return $rule;
    }

    /**
     * @param  array<string, array<string, int>>  $metrics
     * @return array<int, array<string, int|string>>
     */
    private function buildWarningRulesDue(array $metrics): array
    {
        $warnings = [];

        foreach (self::WARNING_SCHEDULES as $type => $schedule) {
            $metric = $metrics[$type] ?? null;
            if (! is_array($metric)) {
                continue;
            }

            $threshold = max(0, (int) ($metric['threshold'] ?? 0));
            $remainingDays = max(0, (int) ($metric['remaining_days'] ?? 0));
            $daysSince = max(0, (int) ($metric['days_since'] ?? 0));
            $windowStart = min((int) ($schedule['window_days'] ?? 0), max(0, $threshold - 1));
            $intervalDays = max(1, (int) ($schedule['interval_days'] ?? 1));

            if ($remainingDays <= 0 || $windowStart <= 0 || $remainingDays > $windowStart) {
                continue;
            }

            if ((($windowStart - $remainingDays) % $intervalDays) !== 0) {
                continue;
            }

            $warnings[] = [
                'type' => $type,
                'label' => (string) ($schedule['label'] ?? $type),
                'days_since' => $daysSince,
                'threshold' => $threshold,
                'remaining_days' => $remainingDays,
                'window_days' => $windowStart,
                'interval_days' => $intervalDays,
            ];
        }

        return $warnings;
    }

    private function rotationAnchorLabel(string $source): string
    {
        return match ($source) {
            'contract_reset' => 'Hợp đồng mới nhất đang là mốc reset chung. Từ mốc này, bộ đếm hợp đồng dùng chính ngày hợp đồng; bộ đếm cơ hội và bình luận cũng không thể cũ hơn mốc này.',
            'assignment_reset' => 'Lần đổi phụ trách / xoay gần nhất đang là mốc reset chung. Sau đó, nếu có cơ hội mới thì mốc chăm sóc sẽ nhảy theo cơ hội; nếu có hợp đồng mới thì cả 3 mốc cùng nhảy theo hợp đồng.',
            default => 'Hệ thống lấy ngày tạo khách làm mốc gốc. Bình luận mới chỉ cập nhật mốc chăm sóc; cơ hội mới cập nhật cả mốc cơ hội và chăm sóc; hợp đồng mới cập nhật cả 3 mốc.',
        };
    }

    private function triggerShortLabel(string $type): string
    {
        return match ($type) {
            'contract' => 'Hợp đồng',
            'opportunity' => 'Cơ hội',
            'comment' => 'Chăm sóc',
            default => 'quy tắc đang theo dõi',
        };
    }

    private function warningObjectLabel(string $type): string
    {
        return match ($type) {
            'contract' => 'hợp đồng',
            'opportunity' => 'cơ hội',
            'comment' => 'bình luận / ghi chú',
            default => 'hoạt động',
        };
    }

    private function triggerPriority(string $type): int
    {
        return match ($type) {
            'contract' => 3,
            'opportunity' => 2,
            'comment' => 1,
            default => 0,
        };
    }

    private function rotationReasonCode(string $type): string
    {
        return match ($type) {
            'contract' => 'stale_contract',
            'opportunity' => 'stale_opportunity',
            'comment' => 'stale_comment',
            default => 'inactive',
        };
    }

    private function autoRotationNote(string $type, int $daysSince, int $threshold): string
    {
        return match ($type) {
            'contract' => sprintf('Điều chuyển tự động vì đã %d ngày chưa có hợp đồng mới, vượt mốc %d ngày theo cấu hình.', $daysSince, $threshold),
            'opportunity' => sprintf('Điều chuyển tự động vì đã %d ngày chưa có cơ hội mới, vượt mốc %d ngày theo cấu hình.', $daysSince, $threshold),
            'comment' => sprintf('Điều chuyển tự động vì đã %d ngày chưa có bình luận / ghi chú mới, vượt mốc %d ngày theo cấu hình.', $daysSince, $threshold),
            default => 'Điều chuyển tự động do khách hàng không có hoạt động chăm sóc phù hợp theo cấu hình xoay vòng.',
        };
    }
}
