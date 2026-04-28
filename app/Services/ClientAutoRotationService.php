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
use Illuminate\Support\Facades\Schema;

class ClientAutoRotationService
{
    public const ACTION_AUTO_ROTATION = 'auto_rotation';

    public const ACTION_AUTO_ROTATION_TO_POOL = 'auto_rotation_to_pool';

    public const ACTION_ROTATION_POOL_CLAIM = 'rotation_pool_claim';

    public const ACTION_MANUAL_TRANSFER_REQUEST = 'manual_transfer_request';

    public const ACTION_MANUAL_DIRECT_ASSIGNMENT = 'manual_direct_assignment';

    private const ALLOWED_PARTICIPANT_ROLES = ['quan_ly', 'nhan_vien'];

    public const SCOPE_SAME_DEPARTMENT = 'same_department';

    public const SCOPE_GLOBAL_STAFF = 'global_staff';

    public const SCOPE_BALANCED_DEPARTMENT = 'balanced_department';

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
            'scope_mode' => $this->normalizeScopeMode(
                $setting?->client_rotation_scope_mode,
                $setting?->client_rotation_same_department_only ?? ($defaults['client_rotation_same_department_only'] ?? false)
            ),
            'participant_modes' => $this->normalizeParticipantModeMap(
                $setting?->client_rotation_participant_modes ?? ($defaults['client_rotation_participant_modes'] ?? []),
                $this->normalizeIdList($setting?->client_rotation_participant_user_ids ?? ($defaults['client_rotation_participant_user_ids'] ?? []))
            ),
            'same_department_only' => $this->normalizeScopeMode(
                $setting?->client_rotation_scope_mode,
                $setting?->client_rotation_same_department_only ?? ($defaults['client_rotation_same_department_only'] ?? false)
            ) === self::SCOPE_SAME_DEPARTMENT,
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
            'moved_to_pool' => 0,
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
            ->withoutRotationPool()
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
        $participantDepartmentIds = $participants->pluck('department_id')
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();
        $receivedTodayDepartmentCounts = $this->receivedTodayDepartmentCounts($participantDepartmentIds, $now);
        $historicalDepartmentReceiveCounts = $this->historicalDepartmentReceiveCounts($participantDepartmentIds);
        $departmentClientLoadCounts = $this->departmentClientLoadCounts($participants, $clientLoadCounts, $settings);

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

        $candidateCollection = $clients
            ->filter(function (Client $client) use ($insights, $pendingTransferSet) {
                $insight = $insights[(int) $client->id] ?? null;

                return is_array($insight)
                    && ($insight['eligible_for_auto_rotation'] ?? false)
                    && ! isset($pendingTransferSet[(int) $client->id]);
            });

        $leadTieBreakers = $candidateCollection->mapWithKeys(function (Client $client) use ($insights) {
            $insight = $insights[(int) $client->id] ?? [];
            $contractCount = (int) ($insight['contract_count'] ?? 0);
            $opportunityCount = (int) ($insight['opportunity_count'] ?? 0);

            return [
                (int) $client->id => ($contractCount === 0 && $opportunityCount === 0)
                    ? random_int(0, PHP_INT_MAX)
                    : 0,
            ];
        })->all();

        $candidates = $candidateCollection
            ->sort(function (Client $left, Client $right) use ($insights, $leadTieBreakers) {
                $a = $insights[(int) $left->id];
                $b = $insights[(int) $right->id];

                $leadTypePriorityDiff = ((int) ($a['lead_type_priority_rank'] ?? PHP_INT_MAX)) <=> ((int) ($b['lead_type_priority_rank'] ?? PHP_INT_MAX));
                if ($leadTypePriorityDiff !== 0) {
                    return $leadTypePriorityDiff;
                }

                $contractCountDiff = ((int) ($b['contract_count'] ?? 0)) <=> ((int) ($a['contract_count'] ?? 0));
                if ($contractCountDiff !== 0) {
                    return $contractCountDiff;
                }

                $opportunityCountDiff = ((int) ($b['opportunity_count'] ?? 0)) <=> ((int) ($a['opportunity_count'] ?? 0));
                if ($opportunityCountDiff !== 0) {
                    return $opportunityCountDiff;
                }

                $aIsLead = (int) ($a['contract_count'] ?? 0) === 0 && (int) ($a['opportunity_count'] ?? 0) === 0;
                $bIsLead = (int) ($b['contract_count'] ?? 0) === 0 && (int) ($b['opportunity_count'] ?? 0) === 0;
                if ($aIsLead && $bIsLead) {
                    $leadTieDiff = ((int) ($leadTieBreakers[(int) $left->id] ?? 0)) <=> ((int) ($leadTieBreakers[(int) $right->id] ?? 0));
                    if ($leadTieDiff !== 0) {
                        return $leadTieDiff;
                    }
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
                $historicalDepartmentReceiveCounts,
                $receivedTodayDepartmentCounts,
                $departmentClientLoadCounts,
                $settings
            );

            if ($rankedRecipients->isEmpty()) {
                $pooled = $this->moveClientToRotationPool($clientId, $settings, $now);
                if ($pooled['status'] === 'pooled') {
                    $summary['moved_to_pool']++;
                    $this->notifyClientMovedToRotationPool($pooled);
                } elseif ($pooled['status'] === 'not_due') {
                    $summary['skipped_not_due']++;
                } else {
                    $summary['skipped_no_recipient']++;
                }
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
                    $pooled = $this->moveClientToRotationPool($clientId, $settings, $now);
                    if ($pooled['status'] === 'pooled') {
                        $summary['moved_to_pool']++;
                        $this->notifyClientMovedToRotationPool($pooled);
                    } elseif ($pooled['status'] === 'not_due') {
                        $summary['skipped_not_due']++;
                    } else {
                        $summary['skipped_no_recipient']++;
                    }
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
            $toDepartmentId = (int) ($selectedRecipient->department_id ?? 0);
            if ($toDepartmentId > 0) {
                $receivedTodayDepartmentCounts[$toDepartmentId] = (int) ($receivedTodayDepartmentCounts[$toDepartmentId] ?? 0) + 1;
                $historicalDepartmentReceiveCounts[$toDepartmentId] = (int) ($historicalDepartmentReceiveCounts[$toDepartmentId] ?? 0) + 1;
                $departmentClientLoadCounts[$toDepartmentId] = (int) ($departmentClientLoadCounts[$toDepartmentId] ?? 0) + 1;
            }
            $fromDepartmentId = (int) ($insight['current_department_id'] ?? 0);
            if ($fromDepartmentId > 0 && $this->participantCanReceive($settings, $fromStaffId)) {
                $departmentClientLoadCounts[$fromDepartmentId] = max(0, (int) ($departmentClientLoadCounts[$fromDepartmentId] ?? 0) - 1);
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

    private function normalizeScopeMode($value, bool $legacySameDepartmentOnly = false): string
    {
        $scopeMode = trim((string) $value);
        if (in_array($scopeMode, [
            self::SCOPE_SAME_DEPARTMENT,
            self::SCOPE_GLOBAL_STAFF,
            self::SCOPE_BALANCED_DEPARTMENT,
        ], true)) {
            return $scopeMode;
        }

        return $legacySameDepartmentOnly ? self::SCOPE_SAME_DEPARTMENT : self::SCOPE_GLOBAL_STAFF;
    }

    /**
     * @param  array<int, int>  $participantIds
     * @return array<string, array<string, bool>>
     */
    private function normalizeParticipantModeMap($value, array $participantIds): array
    {
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') {
                return [];
            }

            $decoded = json_decode($trimmed, true);
            $value = json_last_error() === JSON_ERROR_NONE ? $decoded : [];
        }

        if (! is_array($value) || empty($participantIds)) {
            return [];
        }

        $participantSet = array_flip($participantIds);
        $normalized = [];

        foreach ($value as $rawUserId => $mode) {
            $userId = (int) $rawUserId;
            if ($userId <= 0 || ! isset($participantSet[$userId]) || ! is_array($mode)) {
                continue;
            }

            $onlyReceive = (bool) ($mode['only_receive'] ?? false);
            $onlyGive = (bool) ($mode['only_give'] ?? false);

            if (! $onlyReceive && ! $onlyGive) {
                continue;
            }

            $normalized[(string) $userId] = [
                'only_receive' => $onlyReceive,
                'only_give' => $onlyGive,
            ];
        }

        ksort($normalized, SORT_NATURAL);

        return $normalized;
    }

    private function rotationScopeMode(array $settings): string
    {
        return $this->normalizeScopeMode(
            $settings['scope_mode'] ?? null,
            (bool) ($settings['same_department_only'] ?? false)
        );
    }

    /**
     * @return array{only_receive: bool, only_give: bool, mode_key: string, label: string}
     */
    private function participantRotationMode(array $settings, int $userId): array
    {
        $mode = (int) $userId > 0
            ? ($settings['participant_modes'][(string) $userId] ?? [])
            : [];
        $onlyReceive = (bool) ($mode['only_receive'] ?? false);
        $onlyGive = (bool) ($mode['only_give'] ?? false);

        $modeKey = 'normal';
        $label = 'Bình thường';

        if ($onlyReceive && ! $onlyGive) {
            $modeKey = 'only_receive';
            $label = 'Chỉ nhận vào';
        } elseif ($onlyGive && ! $onlyReceive) {
            $modeKey = 'only_give';
            $label = 'Chỉ cho đi';
        } elseif ($onlyGive && $onlyReceive) {
            $modeKey = 'normal';
            $label = 'Bật cả 2 nên xử lý như bình thường';
        }

        return [
            'only_receive' => $onlyReceive,
            'only_give' => $onlyGive,
            'mode_key' => $modeKey,
            'label' => $label,
        ];
    }

    private function participantCanGive(array $settings, int $userId): bool
    {
        if ($userId <= 0 || ! in_array($userId, $settings['participant_user_ids'], true)) {
            return false;
        }

        $mode = $this->participantRotationMode($settings, $userId);

        return ! ($mode['only_receive'] && ! $mode['only_give']);
    }

    private function participantCanReceive(array $settings, int $userId): bool
    {
        if ($userId <= 0 || ! in_array($userId, $settings['participant_user_ids'], true)) {
            return false;
        }

        $mode = $this->participantRotationMode($settings, $userId);

        return ! ($mode['only_give'] && ! $mode['only_receive']);
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
            ->get(['id', 'name', 'email', 'role', 'department_id', 'is_active'])
            ->map(function (User $user) use ($settings) {
                $mode = $this->participantRotationMode($settings, (int) $user->id);
                $user->client_rotation_only_receive = $mode['only_receive'];
                $user->client_rotation_only_give = $mode['only_give'];
                $user->client_rotation_mode_key = $mode['mode_key'];

                return $user;
            })
            ->values();
    }

    /**
     * @return array<string, array<int, CarbonInterface|null>|array<int, int>>
     */
    private function loadActivityStatsForClients(EloquentCollection $clients): array
    {
        $clientIds = $clients->pluck('id')->map(fn ($id) => (int) $id)->values()->all();
        if (empty($clientIds)) {
            return [
                'care_note_last' => [],
                'comment_history_last' => [],
                'opportunity_last' => [],
                'opportunity_count' => [],
                'contract_last' => [],
                'contract_count' => [],
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
        $opportunityCount = $opportunityRows->mapWithKeys(function ($row) {
            return [(int) $row->client_id => (int) $row->total];
        })->all();

        $contractRows = Contract::query()
            ->selectRaw('client_id, MAX(COALESCE(approved_at, created_at)) as last_at, COUNT(*) as total')
            ->whereIn('client_id', $clientIds)
            ->groupBy('client_id')
            ->get();
        $contractLast = $contractRows->mapWithKeys(function ($row) {
            return [(int) $row->client_id => $row->last_at ? Carbon::parse($row->last_at) : null];
        })->all();
        $contractCount = $contractRows->mapWithKeys(function ($row) {
            return [(int) $row->client_id => (int) $row->total];
        })->all();

        $commentHistoryLast = [];
        foreach ($clients as $client) {
            $commentHistoryLast[(int) $client->id] = $this->lastCommentAtFromHistory($client);
        }

        return [
            'care_note_last' => $careNoteLast,
            'comment_history_last' => $commentHistoryLast,
            'opportunity_last' => $opportunityLast,
            'opportunity_count' => $opportunityCount,
            'contract_last' => $contractLast,
            'contract_count' => $contractCount,
        ];
    }

    /**
     * @param  array<string, array<int, CarbonInterface|null>|array<int, int>>  $stats
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
        $daysSinceContract = $effectiveContractAt->diffInDays($now);
        $remainingContract = max(0, (int) $settings['contract_stale_days'] - $daysSinceContract);
        $contractOverdue = $daysSinceContract >= (int) $settings['contract_stale_days'];

        $contractGatePassedAt = $effectiveContractAt->copy()->addDays((int) $settings['contract_stale_days']);

        $opportunityStageStarted = $contractOverdue;
        $effectiveOpportunityAt = $opportunityStageStarted
            ? ($this->maxDate($actualOpportunityAt, $contractGatePassedAt) ?: $contractGatePassedAt)
            : null;
        $daysSinceOpportunity = $opportunityStageStarted && $effectiveOpportunityAt
            ? $effectiveOpportunityAt->diffInDays($now)
            : 0;
        $remainingOpportunity = $opportunityStageStarted
            ? max(0, (int) $settings['opportunity_stale_days'] - $daysSinceOpportunity)
            : (int) $settings['opportunity_stale_days'];
        $opportunityOverdue = $opportunityStageStarted
            && $daysSinceOpportunity >= (int) $settings['opportunity_stale_days'];

        $opportunityGatePassedAt = $effectiveOpportunityAt
            ? $effectiveOpportunityAt->copy()->addDays((int) $settings['opportunity_stale_days'])
            : null;

        $commentStageStarted = $opportunityOverdue;
        $effectiveCommentAt = $commentStageStarted
            ? ($this->maxDate($actualCommentAt, $opportunityGatePassedAt) ?: $opportunityGatePassedAt)
            : null;
        $daysSinceComment = $commentStageStarted && $effectiveCommentAt
            ? $effectiveCommentAt->diffInDays($now)
            : 0;
        $remainingComment = $commentStageStarted
            ? max(0, (int) $settings['comment_stale_days'] - $daysSinceComment)
            : (int) $settings['comment_stale_days'];
        $commentOverdue = $commentStageStarted
            && $daysSinceComment >= (int) $settings['comment_stale_days'];

        $rules = [
            [
                'type' => 'comment',
                'label' => 'bình luận / ghi chú mới',
                'days_since' => $daysSinceComment,
                'threshold' => (int) $settings['comment_stale_days'],
                'remaining_days' => $remainingComment,
                'overdue' => $commentOverdue,
                'priority' => 1,
                'stage_started' => $commentStageStarted,
                'anchor_at' => $effectiveCommentAt,
                'due_at' => $effectiveCommentAt
                    ? $effectiveCommentAt->copy()->addDays((int) $settings['comment_stale_days'])
                    : null,
            ],
            [
                'type' => 'opportunity',
                'label' => 'cơ hội mới',
                'days_since' => $daysSinceOpportunity,
                'threshold' => (int) $settings['opportunity_stale_days'],
                'remaining_days' => $remainingOpportunity,
                'overdue' => $opportunityOverdue,
                'priority' => 2,
                'stage_started' => $opportunityStageStarted,
                'anchor_at' => $effectiveOpportunityAt,
                'due_at' => $effectiveOpportunityAt
                    ? $effectiveOpportunityAt->copy()->addDays((int) $settings['opportunity_stale_days'])
                    : $contractGatePassedAt,
            ],
            [
                'type' => 'contract',
                'label' => 'hợp đồng mới',
                'days_since' => $daysSinceContract,
                'threshold' => (int) $settings['contract_stale_days'],
                'remaining_days' => $remainingContract,
                'overdue' => $contractOverdue,
                'priority' => 3,
                'stage_started' => true,
                'anchor_at' => $effectiveContractAt,
                'due_at' => $effectiveContractAt->copy()->addDays((int) $settings['contract_stale_days']),
            ],
        ];
        $currentStageRule = ! $contractOverdue
            ? $rules[2]
            : (! $opportunityOverdue ? $rules[1] : $rules[0]);
        $activeStageRemainingDays = ! $contractOverdue
            ? $remainingContract
            : (! $opportunityOverdue ? $remainingOpportunity : $remainingComment);
        $eligible = $commentOverdue;
        $eligibilityAt = $eligible && $effectiveCommentAt
            ? $effectiveCommentAt->copy()->addDays((int) $settings['comment_stale_days'])
            : null;
        $eligibilityOverdueDays = $eligible && $eligibilityAt
            ? $eligibilityAt->diffInDays($now)
            : 0;
        $daysUntilRotation = $eligible
            ? 0
            : (! $contractOverdue
                ? $remainingContract + (int) $settings['opportunity_stale_days'] + (int) $settings['comment_stale_days']
                : (! $opportunityOverdue
                    ? $remainingOpportunity + (int) $settings['comment_stale_days']
                    : $remainingComment));

        $currentOwnerId = $this->currentOwnerId($client);
        $currentDepartmentId = $this->currentDepartmentId($client);
        $scopeMode = $this->rotationScopeMode($settings);
        $sameDepartmentOnly = $scopeMode === self::SCOPE_SAME_DEPARTMENT;
        $scopeRequiresDepartment = in_array($scopeMode, [self::SCOPE_SAME_DEPARTMENT, self::SCOPE_BALANCED_DEPARTMENT], true);
        $leadTypeId = (int) ($client->lead_type_id ?? 0);
        $leadTypeSelected = $leadTypeId > 0 && in_array($leadTypeId, $settings['lead_type_ids'], true);
        $leadTypePriorityRank = $this->leadTypePriorityRank($leadTypeId, $settings['lead_type_ids']);
        $ownerSelected = $currentOwnerId > 0 && in_array($currentOwnerId, $settings['participant_user_ids'], true);
        $ownerCanGive = $ownerSelected && $this->participantCanGive($settings, $currentOwnerId);
        $ownerMode = $this->participantRotationMode($settings, $currentOwnerId);
        $inScope = $settings['enabled']
            && $leadTypeSelected
            && $ownerSelected
            && $ownerCanGive
            && (! $scopeRequiresDepartment || $currentDepartmentId > 0);

        $triggerType = (string) ($currentStageRule['type'] ?? '');
        $eligible = $inScope && $eligible;
        $warningRulesDue = $inScope
            ? $this->buildWarningRulesDue($currentStageRule)
            : [];
        $warningDue = ! $eligible && ! empty($warningRulesDue);

        $contractCount = max(0, (int) ($stats['contract_count'][$clientId] ?? 0));
        $opportunityCount = max(0, (int) ($stats['opportunity_count'][$clientId] ?? 0));
        [$priorityBucket, $priorityOrder] = $this->priorityBucket($contractCount, $opportunityCount);

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
        if ($ownerSelected && ! $ownerCanGive) {
            $scopeReasons[] = 'owner_receive_only_locked';
        }
        if ($scopeRequiresDepartment && $currentDepartmentId <= 0) {
            $scopeReasons[] = 'department_missing';
        }

        $lastMeaningfulActivityAt = $this->maxDate(
            $actualContractAt,
            $this->maxDate($actualOpportunityAt, $actualCommentAt)
        ) ?: $rotationAnchorAt;
        $triggerPriority = $eligible
            ? $this->triggerPriority('comment')
            : $this->triggerPriority($triggerType);
        $triggerThreshold = $eligible
            ? (int) $settings['comment_stale_days']
            : (int) ($currentStageRule['threshold'] ?? 0);
        $triggerDaysSince = $eligible
            ? $daysSinceComment
            : (int) ($currentStageRule['days_since'] ?? 0);
        $triggerOverdueDays = $eligible
            ? max(0, $daysSinceComment - (int) $settings['comment_stale_days'])
            : 0;
        $triggerEffectiveAt = $eligible
            ? $eligibilityAt
            : ($currentStageRule['due_at'] ?? $lastMeaningfulActivityAt);

        return [
            'enabled' => (bool) $settings['enabled'],
            'in_scope' => $inScope,
            'scope_reasons' => $scopeReasons,
            'current_owner_id' => $currentOwnerId > 0 ? $currentOwnerId : null,
            'current_owner_name' => $this->currentOwnerName($client),
            'current_department_id' => $currentDepartmentId > 0 ? $currentDepartmentId : null,
            'current_owner_rotation_mode' => $ownerMode['mode_key'],
            'current_owner_rotation_mode_label' => $ownerMode['label'],
            'current_owner_only_receive' => $ownerMode['only_receive'],
            'current_owner_only_give' => $ownerMode['only_give'],
            'lead_type_id' => $leadTypeId > 0 ? $leadTypeId : null,
            'lead_type_name' => $client->leadType ? (string) $client->leadType->name : null,
            'lead_type_priority_rank' => $leadTypePriorityRank,
            'lead_type_priority_label' => $leadTypePriorityRank !== null
                ? sprintf('Loại khách ưu tiên #%d', $leadTypePriorityRank)
                : null,
            'rotation_reset_at' => optional($resetAt)->toIso8601String(),
            'rotation_anchor_at' => optional($rotationAnchorAt)->toIso8601String(),
            'rotation_anchor_source' => $rotationAnchorSource,
            'rotation_anchor_label' => $this->rotationAnchorLabel($rotationAnchorSource),
            'last_comment_at' => $actualCommentAt?->toIso8601String(),
            'last_opportunity_at' => $actualOpportunityAt?->toIso8601String(),
            'last_contract_at' => $actualContractAt?->toIso8601String(),
            'effective_comment_at' => $effectiveCommentAt?->toIso8601String(),
            'effective_opportunity_at' => $effectiveOpportunityAt?->toIso8601String(),
            'effective_contract_at' => $effectiveContractAt->toIso8601String(),
            'days_since_comment' => $daysSinceComment,
            'days_since_opportunity' => $daysSinceOpportunity,
            'days_since_contract' => $daysSinceContract,
            'remaining_comment_days' => $remainingComment,
            'remaining_opportunity_days' => $remainingOpportunity,
            'remaining_contract_days' => $remainingContract,
            'days_until_rotation' => $daysUntilRotation,
            'active_stage_type' => $triggerType,
            'active_stage_remaining_days' => $activeStageRemainingDays,
            'opportunity_stage_started' => $opportunityStageStarted,
            'comment_stage_started' => $commentStageStarted,
            'warning_due' => $warningDue,
            'warning_rules_due' => $warningRulesDue,
            'eligible_for_auto_rotation' => $eligible,
            'trigger_type' => $triggerType,
            'trigger_days_since' => $triggerDaysSince,
            'trigger_threshold_days' => $triggerThreshold,
            'trigger_priority' => $triggerPriority,
            'trigger_overdue_days' => $triggerOverdueDays,
            'trigger_effective_at' => $triggerEffectiveAt?->toIso8601String(),
            'trigger_label' => $this->rotationRuleLabel($rules, $currentStageRule, $eligible, $daysUntilRotation),
            'protecting_signal' => $currentStageRule['type'] ?? null,
            'protecting_label' => $this->rotationRuleLabel($rules, $currentStageRule, $eligible, $daysUntilRotation),
            'priority_bucket' => $priorityBucket,
            'priority_order' => $priorityOrder,
            'contract_count' => $contractCount,
            'opportunity_count' => $opportunityCount,
            'priority_label' => $this->priorityLabel($contractCount, $opportunityCount),
            'priority_rule_label' => 'Nếu chọn nhiều loại khách, hệ thống xét theo thứ tự loại khách đã cấu hình trước. Trong cùng loại khách, ưu tiên số hợp đồng giảm dần, nếu bằng nhau thì xét số cơ hội; nếu cả hai đều là khách tiềm năng thì random trong nhóm đồng hạng.',
            'last_meaningful_activity_at' => $lastMeaningfulActivityAt->toIso8601String(),
            'thresholds' => [
                'comment_stale_days' => (int) $settings['comment_stale_days'],
                'opportunity_stale_days' => (int) $settings['opportunity_stale_days'],
                'contract_stale_days' => (int) $settings['contract_stale_days'],
                'daily_receive_limit' => (int) $settings['daily_receive_limit'],
                'same_department_only' => $sameDepartmentOnly,
                'scope_mode' => $scopeMode,
            ],
            'status_label' => $this->rotationStatusLabel(
                $inScope,
                $currentStageRule,
                $eligible,
                $daysUntilRotation,
                $scopeReasons,
                $daysSinceComment,
                $daysSinceOpportunity,
                $daysSinceContract
            ),
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
    private function priorityBucket(int $contractCount, int $opportunityCount): array
    {
        if ($contractCount > 0) {
            return ['contract', 2000000000 + ($contractCount * 1000000) + min($opportunityCount, 999999)];
        }

        if ($opportunityCount > 0) {
            return ['opportunity', 1000000000 + $opportunityCount];
        }

        return ['lead', 0];
    }

    private function priorityLabel(int $contractCount, int $opportunityCount): string
    {
        if ($contractCount > 0) {
            return sprintf('%d hợp đồng • %d cơ hội', $contractCount, $opportunityCount);
        }

        if ($opportunityCount > 0) {
            return sprintf('0 hợp đồng • %d cơ hội', $opportunityCount);
        }

        return 'Khách tiềm năng thuần';
    }

    private function leadTypePriorityRank(int $leadTypeId, array $orderedLeadTypeIds): ?int
    {
        if ($leadTypeId <= 0 || empty($orderedLeadTypeIds)) {
            return null;
        }

        $position = array_search($leadTypeId, $orderedLeadTypeIds, true);

        return $position === false ? null : ($position + 1);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rules
     * @param  array<string, mixed>|null  $blockingRule
     */
    private function rotationRuleLabel(array $rules, ?array $blockingRule, bool $eligible, int $daysUntilRotation): ?string
    {
        $indexedRules = collect($rules)
            ->keyBy(fn (array $rule) => (string) ($rule['type'] ?? ''))
            ->all();
        $commentRule = $indexedRules['comment'] ?? null;
        $opportunityRule = $indexedRules['opportunity'] ?? null;
        $contractRule = $indexedRules['contract'] ?? null;

        if (! is_array($commentRule) || ! is_array($opportunityRule) || ! is_array($contractRule)) {
            return null;
        }

        if ($eligible) {
            return sprintf(
                'Khách được đếm tuần tự theo 3 tầng: hợp đồng → cơ hội → bình luận. Hiện mốc hợp đồng đã quá hạn, mốc cơ hội cũng đã quá hạn, và tầng cuối là bình luận / ghi chú đã quá %d ngày trên mốc %d ngày nên khách đã đủ điều kiện điều chuyển.',
                (int) ($commentRule['days_since'] ?? 0),
                (int) ($commentRule['threshold'] ?? 0)
            );
        }

        if (! is_array($blockingRule) || empty($blockingRule['type'])) {
            return null;
        }

        return match ((string) ($blockingRule['type'] ?? '')) {
            'contract' => sprintf(
                'Đang ở tầng 1: hợp đồng. Còn %d ngày nữa sẽ quá mốc %d ngày chưa có hợp đồng mới; chỉ sau khi quá mốc này hệ thống mới bắt đầu đếm tầng cơ hội.',
                (int) ($blockingRule['remaining_days'] ?? 0),
                (int) ($contractRule['threshold'] ?? 0)
            ),
            'opportunity' => sprintf(
                'Đang ở tầng 2: cơ hội. Mốc hợp đồng đã quá hạn; hiện còn %d ngày nữa sẽ quá mốc %d ngày chưa có cơ hội mới. Sau khi tầng cơ hội cũng quá hạn, hệ thống mới bắt đầu đếm tầng bình luận.',
                (int) ($blockingRule['remaining_days'] ?? 0),
                (int) ($opportunityRule['threshold'] ?? 0)
            ),
            'comment' => sprintf(
                'Đang ở tầng 3: bình luận / ghi chú. Hợp đồng và cơ hội đã quá hạn; hiện còn %d ngày nữa sẽ quá mốc %d ngày chưa có cập nhật chăm sóc mới. Khi tầng cuối này cũng quá hạn, khách sẽ vào diện xoay.',
                (int) ($blockingRule['remaining_days'] ?? 0),
                (int) ($commentRule['threshold'] ?? 0)
            ),
            default => sprintf('Còn %d ngày nữa mới đủ điều kiện xoay.', $daysUntilRotation),
        };
    }

    /**
     * @param  array<int, string>  $scopeReasons
     */
    private function rotationStatusLabel(
        bool $inScope,
        ?array $blockingRule,
        bool $eligible,
        int $daysUntilRotation,
        array $scopeReasons,
        int $daysSinceComment,
        int $daysSinceOpportunity,
        int $daysSinceContract
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
            if (in_array('owner_receive_only_locked', $scopeReasons, true)) {
                return 'Nhân sự phụ trách đang bật chế độ chỉ nhận vào nên khách không bị xoay ra';
            }
            if (in_array('department_missing', $scopeReasons, true)) {
                return 'Thiếu phòng ban để áp dụng phạm vi nhận khách đã chọn';
            }

            return 'Chưa đủ điều kiện cấu hình để xoay';
        }

        if ($eligible) {
            return sprintf(
                'Đủ điều kiện điều chuyển vì đã đi hết tuần tự 3 tầng: hợp đồng quá hạn, cơ hội quá hạn và bình luận cuối cùng cũng quá hạn %d ngày',
                $daysSinceComment,
            );
        }

        $blockingType = (string) ($blockingRule['type'] ?? '');

        return match ($blockingType) {
            'contract' => sprintf('Đang đếm tầng hợp đồng, còn tối thiểu %d ngày nữa mới có thể vào diện xoay', $daysUntilRotation),
            'opportunity' => sprintf('Hợp đồng đã quá hạn, đang đếm tầng cơ hội; còn tối thiểu %d ngày nữa mới có thể vào diện xoay', $daysUntilRotation),
            'comment' => sprintf('Hợp đồng và cơ hội đã quá hạn, đang đếm tầng bình luận; còn %d ngày nữa sẽ vào diện xoay', $daysUntilRotation),
            default => sprintf('Còn %d ngày nữa mới đủ điều kiện xoay', $daysUntilRotation),
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
            ->withoutRotationPool()
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

    /**
     * @param  array<int, int>  $departmentIds
     * @return array<int, int>
     */
    private function receivedTodayDepartmentCounts(array $departmentIds, CarbonInterface $now): array
    {
        if (empty($departmentIds)) {
            return [];
        }

        return ClientRotationHistory::query()
            ->where('action_type', self::ACTION_AUTO_ROTATION)
            ->whereDate('transferred_at', $now->toDateString())
            ->whereIn('department_id', $departmentIds)
            ->selectRaw('department_id, COUNT(*) as total')
            ->groupBy('department_id')
            ->pluck('total', 'department_id')
            ->mapWithKeys(fn ($count, $departmentId) => [(int) $departmentId => (int) $count])
            ->all();
    }

    /**
     * @param  array<int, int>  $departmentIds
     * @return array<int, int>
     */
    private function historicalDepartmentReceiveCounts(array $departmentIds): array
    {
        if (empty($departmentIds)) {
            return [];
        }

        return ClientRotationHistory::query()
            ->where('action_type', self::ACTION_AUTO_ROTATION)
            ->whereIn('department_id', $departmentIds)
            ->selectRaw('department_id, COUNT(*) as total')
            ->groupBy('department_id')
            ->pluck('total', 'department_id')
            ->mapWithKeys(fn ($count, $departmentId) => [(int) $departmentId => (int) $count])
            ->all();
    }

    /**
     * @return array<int, int>
     */
    private function departmentClientLoadCounts(Collection $participants, array $clientLoadCounts, array $settings): array
    {
        $loads = [];

        foreach ($participants as $user) {
            $userId = (int) ($user->id ?? 0);
            $departmentId = (int) ($user->department_id ?? 0);

            if ($userId <= 0 || $departmentId <= 0 || ! $this->participantCanReceive($settings, $userId)) {
                continue;
            }

            $loads[$departmentId] = (int) ($loads[$departmentId] ?? 0) + (int) ($clientLoadCounts[$userId] ?? 0);
        }

        return $loads;
    }

    private function rankRecipientsForClient(
        Client $client,
        Collection $participants,
        array $historicalReceiveCounts,
        array $receivedTodayCounts,
        array $clientLoadCounts,
        array $historicalDepartmentReceiveCounts,
        array $receivedTodayDepartmentCounts,
        array $departmentClientLoadCounts,
        array $settings
    ): Collection {
        $scopeMode = $this->rotationScopeMode($settings);
        $currentDepartmentId = $this->currentDepartmentId($client);

        if ($scopeMode === self::SCOPE_SAME_DEPARTMENT) {
            if ($currentDepartmentId <= 0) {
                return collect();
            }

            return $this->rankUsers(
                $this->eligibleRecipientCandidatesForClient(
                    $client,
                    $participants,
                    $receivedTodayCounts,
                    (int) $settings['daily_receive_limit'],
                    $settings,
                    $currentDepartmentId
                ),
                $historicalReceiveCounts,
                $receivedTodayCounts,
                $clientLoadCounts
            );
        }

        if ($scopeMode === self::SCOPE_BALANCED_DEPARTMENT) {
            if ($currentDepartmentId <= 0) {
                return collect();
            }

            $departmentGroups = $this->eligibleRecipientCandidatesForClient(
                $client,
                $participants,
                $receivedTodayCounts,
                (int) $settings['daily_receive_limit'],
                $settings
            )
                ->filter(fn (User $user) => (int) ($user->department_id ?? 0) > 0 && (int) ($user->department_id ?? 0) !== $currentDepartmentId)
                ->groupBy(fn (User $user) => (int) ($user->department_id ?? 0));

            if ($departmentGroups->isEmpty()) {
                return collect();
            }

            return $departmentGroups
                ->map(function (Collection $users, $departmentId) use (
                    $historicalDepartmentReceiveCounts,
                    $receivedTodayDepartmentCounts,
                    $departmentClientLoadCounts,
                    $historicalReceiveCounts,
                    $receivedTodayCounts,
                    $clientLoadCounts
                ) {
                    return [
                        'department_id' => (int) $departmentId,
                        'historical_received' => (int) ($historicalDepartmentReceiveCounts[(int) $departmentId] ?? 0),
                        'received_today' => (int) ($receivedTodayDepartmentCounts[(int) $departmentId] ?? 0),
                        'client_load' => (int) ($departmentClientLoadCounts[(int) $departmentId] ?? 0),
                        'rand' => random_int(1, PHP_INT_MAX),
                        'users' => $this->rankUsers(
                            $users->values(),
                            $historicalReceiveCounts,
                            $receivedTodayCounts,
                            $clientLoadCounts
                        ),
                    ];
                })
                ->sort(function (array $left, array $right) {
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
                })
                ->flatMap(fn (array $entry) => $entry['users'])
                ->values();
        }

        return $this->rankUsers(
            $this->eligibleRecipientCandidatesForClient(
                $client,
                $participants,
                $receivedTodayCounts,
                (int) $settings['daily_receive_limit'],
                $settings
            ),
            $historicalReceiveCounts,
            $receivedTodayCounts,
            $clientLoadCounts
        );
    }

    private function eligibleRecipientCandidatesForClient(
        Client $client,
        Collection $participants,
        array $receivedTodayCounts,
        int $dailyReceiveLimit,
        array $settings,
        ?int $requiredDepartmentId = null
    ): Collection {
        return $participants
            ->filter(function (User $user) use ($client, $receivedTodayCounts, $dailyReceiveLimit, $settings, $requiredDepartmentId) {
                $userId = (int) $user->id;
                $departmentId = (int) ($user->department_id ?? 0);

                if ($userId === $this->currentOwnerId($client)) {
                    return false;
                }

                if (! in_array((string) $user->role, self::ALLOWED_PARTICIPANT_ROLES, true)) {
                    return false;
                }

                if (! is_null($user->is_active) && ! (bool) $user->is_active) {
                    return false;
                }

                if (! $this->participantCanReceive($settings, $userId)) {
                    return false;
                }

                if ((int) ($receivedTodayCounts[$userId] ?? 0) >= $dailyReceiveLimit) {
                    return false;
                }

                if (! is_null($requiredDepartmentId) && $requiredDepartmentId > 0 && $departmentId !== $requiredDepartmentId) {
                    return false;
                }

                return true;
            })
            ->values();
    }

    private function rankUsers(
        Collection $candidates,
        array $historicalReceiveCounts,
        array $receivedTodayCounts,
        array $clientLoadCounts
    ): Collection {
        if ($candidates->isEmpty()) {
            return collect();
        }

        return $candidates
            ->map(function (User $user) use ($historicalReceiveCounts, $receivedTodayCounts, $clientLoadCounts) {
                return [
                    'user' => $user,
                    'historical_received' => (int) ($historicalReceiveCounts[(int) $user->id] ?? 0),
                    'received_today' => (int) ($receivedTodayCounts[(int) $user->id] ?? 0),
                    'client_load' => (int) ($clientLoadCounts[(int) $user->id] ?? 0),
                    'rand' => random_int(1, PHP_INT_MAX),
                ];
            })
            ->sort(function (array $left, array $right) {
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
            })
            ->pluck('user')
            ->values();
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
            if ((int) ($recipient->department_id ?? 0) > 0) {
                $client->assigned_department_id = (int) $recipient->department_id;
            }
            $client->care_rotation_reset_at = $now->toDateTimeString();
            $client->save();
            $this->replaceClientCareStaffForAssignment(
                $client,
                $fromStaffId > 0 ? $fromStaffId : null,
                (int) $recipient->id,
                (int) $recipient->id
            );

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

    /**
     * @return array<string, mixed>
     */
    private function moveClientToRotationPool(
        int $clientId,
        array $settings,
        CarbonInterface $now
    ): array {
        return DB::transaction(function () use ($clientId, $settings, $now) {
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

            if ($client->inRotationPool()) {
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

            $fromStaffId = $this->currentOwnerId($client);
            $fromStaffName = $this->currentOwnerName($client);

            $client->assigned_staff_id = null;
            $client->assigned_department_id = null;
            $client->is_in_rotation_pool = true;
            $client->rotation_pool_entered_at = $now->toDateTimeString();
            $client->rotation_pool_reason = 'auto_rotation_no_recipient';
            $client->save();
            $this->replaceClientCareStaffForAssignment($client, null, null);

            $this->recordAssignmentHistory(
                $client,
                $fromStaffId > 0 ? $fromStaffId : null,
                null,
                self::ACTION_AUTO_ROTATION_TO_POOL,
                null,
                $freshInsight,
                null,
                'rotation_pool_overflow',
                'Khách đủ điều kiện xoay nhưng toàn bộ người nhận tự động đã hết suất hoặc không còn người nhận phù hợp, nên hệ thống đưa vào kho số để chờ nhân sự nhận thủ công.',
                $now
            );

            return [
                'status' => 'pooled',
                'client_id' => (int) $client->id,
                'client_name' => (string) ($client->name ?: 'Khách hàng'),
                'from_staff_id' => $fromStaffId > 0 ? $fromStaffId : null,
                'from_staff_name' => $fromStaffName,
                'insight' => $freshInsight,
            ];
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function claimClientFromRotationPool(
        int $clientId,
        User $recipient,
        ?CarbonInterface $at = null
    ): array {
        $now = $at ? Carbon::instance($at) : now('Asia/Ho_Chi_Minh');

        return DB::transaction(function () use ($clientId, $recipient, $now) {
            $client = Client::query()
                ->lockForUpdate()
                ->with([
                    'leadType:id,name',
                    'assignedStaff:id,name,email,department_id,is_active',
                    'salesOwner:id,name,email,department_id,is_active',
                ])
                ->find($clientId);

            if (! $client || ! $client->inRotationPool()) {
                return ['status' => 'not_in_pool'];
            }

            if (ClientStaffTransferRequest::query()
                ->where('client_id', $clientId)
                ->where('status', ClientStaffTransferService::STATUS_PENDING)
                ->exists()) {
                return ['status' => 'pending_transfer'];
            }

            $recipientId = (int) ($recipient->id ?? 0);
            if ($recipientId <= 0 || ! in_array((string) ($recipient->role ?? ''), self::ALLOWED_PARTICIPANT_ROLES, true)) {
                return ['status' => 'recipient_unavailable'];
            }

            if (! is_null($recipient->is_active) && ! (bool) $recipient->is_active) {
                return ['status' => 'recipient_unavailable'];
            }

            $client->assigned_staff_id = $recipientId;
            $client->assigned_department_id = (int) ($recipient->department_id ?? 0) > 0
                ? (int) $recipient->department_id
                : null;
            $client->is_in_rotation_pool = false;
            $client->rotation_pool_entered_at = null;
            $client->rotation_pool_reason = null;
            $client->care_rotation_reset_at = $now->toDateTimeString();
            $client->save();
            $this->replaceClientCareStaffForAssignment($client, null, $recipientId, $recipientId);

            $this->recordAssignmentHistory(
                $client,
                null,
                $recipientId,
                self::ACTION_ROTATION_POOL_CLAIM,
                $recipientId,
                null,
                null,
                'rotation_pool_claim',
                'Nhân sự đã nhận khách hàng từ kho số.',
                $now
            );

            return [
                'status' => 'claimed',
                'client_id' => (int) $client->id,
                'client_name' => (string) ($client->name ?: 'Khách hàng'),
                'to_staff_id' => $recipientId,
                'to_staff_name' => (string) ($recipient->name ?: 'Nhân sự'),
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

        if (! $this->participantCanReceive($settings, $recipientId)) {
            return false;
        }

        if ($recipientId === $this->currentOwnerId($client)) {
            return false;
        }

        $scopeMode = $this->rotationScopeMode($settings);
        $departmentId = $this->currentDepartmentId($client);

        if ($scopeMode === self::SCOPE_SAME_DEPARTMENT) {
            if ($departmentId <= 0 || (int) ($recipient->department_id ?? 0) !== $departmentId) {
                return false;
            }
        }

        if ($scopeMode === self::SCOPE_BALANCED_DEPARTMENT) {
            $recipientDepartmentId = (int) ($recipient->department_id ?? 0);
            if ($departmentId <= 0 || $recipientDepartmentId <= 0 || $recipientDepartmentId === $departmentId) {
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
        $title = sprintf('Khách hàng "%s" đang tiến gần điều kiện xoay', $client->name ?: 'Khách hàng');
        $activeStageType = (string) ($insight['active_stage_type'] ?? '');
        $stageContext = match ($activeStageType) {
            'contract' => 'Hiện hệ thống đang đếm tầng 1 là hợp đồng. Khi tầng này quá hạn xong mới bắt đầu đếm tầng cơ hội.',
            'opportunity' => 'Hiện hệ thống đang đếm tầng 2 là cơ hội vì tầng hợp đồng đã quá hạn. Khi tầng này quá hạn xong mới bắt đầu đếm tầng bình luận.',
            'comment' => 'Hiện hệ thống đang đếm tầng 3 là bình luận vì tầng hợp đồng và cơ hội đều đã quá hạn.',
            default => 'Hiện hệ thống đang đếm tuần tự theo các tầng xoay khách.',
        };
        $body = sprintf(
            '%s • %s. %s',
            $client->name ?: 'Khách hàng',
            implode('; ', $warningLines),
            $stageContext,
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

    /**
     * @param  array<string, mixed>  $result
     */
    private function notifyClientMovedToRotationPool(array $result): void
    {
        $fromStaffId = (int) ($result['from_staff_id'] ?? 0);
        if ($fromStaffId <= 0) {
            return;
        }

        $clientName = trim((string) ($result['client_name'] ?? 'Khách hàng'));
        $clientId = (int) ($result['client_id'] ?? 0);

        app(NotificationService::class)->notifyUsers(
            [$fromStaffId],
            'Khách hàng đã được đưa vào kho số',
            sprintf('Khách hàng "%s" đủ điều kiện xoay nhưng chưa còn suất nhận tự động, nên đã được đưa vào kho số để chờ nhân sự nhận thủ công.', $clientName),
            [
                'category' => 'crm_realtime',
                'client_id' => $clientId,
                'type' => 'crm_client_rotation_pool_entered',
            ]
        );
    }

    /**
     * @param  array<string, mixed>  $result
     */
    public function notifyRotationPoolClaimOutcome(array $result): void
    {
        $recipientId = (int) ($result['to_staff_id'] ?? 0);
        if ($recipientId <= 0) {
            return;
        }

        $clientName = trim((string) ($result['client_name'] ?? 'Khách hàng'));
        $clientId = (int) ($result['client_id'] ?? 0);

        app(NotificationService::class)->notifyUsers(
            [$recipientId],
            'Bạn vừa nhận khách hàng từ kho số',
            sprintf('Khách hàng "%s" đã được gán về cho bạn từ kho số.', $clientName),
            [
                'category' => 'crm_realtime',
                'client_id' => $clientId,
                'type' => 'crm_client_rotation_pool_claimed',
            ]
        );
    }

    private function actionLabel(string $actionType): string
    {
        return match ($actionType) {
            self::ACTION_AUTO_ROTATION => 'Điều chuyển tự động',
            self::ACTION_AUTO_ROTATION_TO_POOL => 'Đưa vào kho số',
            self::ACTION_ROTATION_POOL_CLAIM => 'Nhận khách từ kho số',
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
     * @param  array<string, mixed>|null  $activeRule
     * @return array<int, array<string, int|string>>
     */
    private function buildWarningRulesDue(?array $activeRule): array
    {
        if (! is_array($activeRule) || empty($activeRule['type'])) {
            return [];
        }

        $type = (string) ($activeRule['type'] ?? '');
        $schedule = self::WARNING_SCHEDULES[$type] ?? null;
        if (! is_array($schedule)) {
            return [];
        }

        $threshold = max(0, (int) ($activeRule['threshold'] ?? 0));
        $remainingDays = max(0, (int) ($activeRule['remaining_days'] ?? 0));
        $daysSince = max(0, (int) ($activeRule['days_since'] ?? 0));
        $windowStart = min((int) ($schedule['window_days'] ?? 0), max(0, $threshold - 1));
        $intervalDays = max(1, (int) ($schedule['interval_days'] ?? 1));

        if ($remainingDays <= 0 || $windowStart <= 0 || $remainingDays > $windowStart) {
            return [];
        }

        if ((($windowStart - $remainingDays) % $intervalDays) !== 0) {
            return [];
        }

        return [[
            'type' => $type,
            'label' => (string) ($schedule['label'] ?? $type),
            'days_since' => $daysSince,
            'threshold' => $threshold,
            'remaining_days' => $remainingDays,
            'window_days' => $windowStart,
            'interval_days' => $intervalDays,
        ]];
    }

    public function replaceClientCareStaffForAssignment(
        Client $client,
        ?int $previousPrimaryStaffId,
        ?int $newPrimaryStaffId,
        ?int $assignedBy = null
    ): void {
        if (! Schema::hasTable('client_care_staff')
            || ! Schema::hasColumn('client_care_staff', 'client_id')
            || ! Schema::hasColumn('client_care_staff', 'user_id')) {
            return;
        }

        try {
            if ($previousPrimaryStaffId && $previousPrimaryStaffId > 0) {
                $client->careStaffUsers()->detach([$previousPrimaryStaffId]);
            }

            if ($newPrimaryStaffId && $newPrimaryStaffId > 0) {
                $client->careStaffUsers()->syncWithoutDetaching([
                    $newPrimaryStaffId => [
                        'assigned_by' => (int) ($assignedBy ?: $newPrimaryStaffId),
                    ],
                ]);
            }

            if ((! $newPrimaryStaffId || $newPrimaryStaffId <= 0)
                && (! $previousPrimaryStaffId || $previousPrimaryStaffId <= 0)) {
                $client->careStaffUsers()->sync([]);
            }
        } catch (\Throwable $e) {
            Log::warning('Client care staff reassignment failed', [
                'client_id' => (int) $client->id,
                'previous_staff_id' => $previousPrimaryStaffId,
                'new_staff_id' => $newPrimaryStaffId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function rotationAnchorLabel(string $source): string
    {
        return match ($source) {
            'contract_reset' => 'Hợp đồng mới nhất đang là mốc reset chung. Từ mốc này, hệ thống đếm tầng hợp đồng trước; chỉ khi tầng này quá hạn mới mở sang tầng cơ hội, rồi cuối cùng mới tới tầng bình luận.',
            'assignment_reset' => 'Lần đổi phụ trách / xoay gần nhất đang là mốc reset chung. Từ mốc này, hệ thống bắt đầu lại chuỗi đếm tuần tự: hợp đồng trước, rồi cơ hội, rồi cuối cùng mới tới bình luận.',
            default => 'Hệ thống lấy ngày tạo khách làm mốc gốc. Hợp đồng mới sẽ reset lại trục đếm; cơ hội mới chỉ tác động khi đã qua tầng hợp đồng; bình luận mới chỉ tác động khi đã qua cả tầng hợp đồng và cơ hội.',
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
            'comment' => sprintf('Điều chuyển tự động vì mốc hợp đồng và cơ hội đã quá hạn từ trước, và tầng cuối là bình luận / ghi chú cũng đã %d ngày vượt mốc %d ngày theo cấu hình.', $daysSince, $threshold),
            default => 'Điều chuyển tự động do khách hàng không có hoạt động chăm sóc phù hợp theo cấu hình xoay vòng.',
        };
    }
}
