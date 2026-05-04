<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table): void {
            if (! Schema::hasColumn('clients', 'assigned_staff_at')) {
                $table->timestamp('assigned_staff_at')->nullable()->after('assigned_staff_id');
                $table->index('assigned_staff_at');
            }
        });

        $this->backfillAssignedStaffTracking();
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table): void {
            if (Schema::hasColumn('clients', 'assigned_staff_at')) {
                $table->dropIndex(['assigned_staff_at']);
                $table->dropColumn('assigned_staff_at');
            }
        });
    }

    private function backfillAssignedStaffTracking(): void
    {
        if (! Schema::hasColumn('clients', 'assigned_staff_at')) {
            return;
        }

        DB::table('clients')
            ->select([
                'id',
                'assigned_staff_id',
                'sales_owner_id',
                'assigned_department_id',
                'assigned_staff_at',
                'is_in_rotation_pool',
                'created_at',
            ])
            ->orderBy('id')
            ->chunkById(300, function (Collection $rows): void {
                $clientIds = $rows->pluck('id')->map(fn ($id) => (int) $id)->all();
                $historyRows = DB::table('client_rotation_histories')
                    ->whereIn('client_id', $clientIds)
                    ->orderByDesc('transferred_at')
                    ->orderByDesc('id')
                    ->get(['client_id', 'from_staff_id', 'to_staff_id', 'transferred_at']);

                $historyByClient = [];
                $repairOwnerIds = [];
                foreach ($historyRows as $historyRow) {
                    $clientId = (int) ($historyRow->client_id ?? 0);
                    if ($clientId <= 0) {
                        continue;
                    }
                    $historyByClient[$clientId][] = $historyRow;
                    $candidateOwnerId = (int) ($historyRow->to_staff_id ?? $historyRow->from_staff_id ?? 0);
                    if ($candidateOwnerId > 0) {
                        $repairOwnerIds[$candidateOwnerId] = $candidateOwnerId;
                    }
                }

                $departmentIdsByUser = DB::table('users')
                    ->whereIn('id', array_values($repairOwnerIds))
                    ->pluck('department_id', 'id')
                    ->mapWithKeys(function ($departmentId, $userId) {
                        return [(int) $userId => $departmentId ? (int) $departmentId : null];
                    })
                    ->all();

                foreach ($rows as $row) {
                    $clientId = (int) ($row->id ?? 0);
                    if ($clientId <= 0) {
                        continue;
                    }

                    $updates = [];
                    $resolvedOwnerId = (int) ($row->assigned_staff_id ?? 0);
                    if ($resolvedOwnerId <= 0) {
                        $resolvedOwnerId = (int) ($row->sales_owner_id ?? 0);
                    }

                    if ($resolvedOwnerId <= 0 && (bool) ($row->is_in_rotation_pool ?? false)) {
                        $resolvedOwnerId = $this->resolveLatestOwnerIdFromHistory($historyByClient[$clientId] ?? []);
                        if ($resolvedOwnerId > 0) {
                            $updates['assigned_staff_id'] = $resolvedOwnerId;
                            $updates['sales_owner_id'] = $resolvedOwnerId;
                            if ((int) ($row->assigned_department_id ?? 0) <= 0) {
                                $updates['assigned_department_id'] = $departmentIdsByUser[$resolvedOwnerId] ?? null;
                            }
                        }
                    }

                    if (empty($row->assigned_staff_at)) {
                        $assignedAt = $resolvedOwnerId > 0
                            ? $this->resolveLatestAssignmentReceivedAt($historyByClient[$clientId] ?? [], $resolvedOwnerId)
                            : null;

                        if (! $assignedAt && ! empty($row->created_at)) {
                            $assignedAt = (string) $row->created_at;
                        }

                        if ($assignedAt) {
                            $updates['assigned_staff_at'] = $assignedAt;
                        }
                    }

                    if ($updates !== []) {
                        DB::table('clients')
                            ->where('id', $clientId)
                            ->update($updates);
                    }
                }
            }, 'id');
    }

    private function resolveLatestOwnerIdFromHistory(array $rows): int
    {
        foreach ($rows as $row) {
            $candidateTo = (int) ($row->to_staff_id ?? 0);
            if ($candidateTo > 0) {
                return $candidateTo;
            }

            $candidateFrom = (int) ($row->from_staff_id ?? 0);
            if ($candidateFrom > 0) {
                return $candidateFrom;
            }
        }

        return 0;
    }

    private function resolveLatestAssignmentReceivedAt(array $rows, int $ownerId): ?string
    {
        if ($ownerId <= 0) {
            return null;
        }

        foreach ($rows as $row) {
            $toStaffId = (int) ($row->to_staff_id ?? 0);
            $fromStaffId = (int) ($row->from_staff_id ?? 0);

            if ($toStaffId !== $ownerId) {
                continue;
            }

            if ($fromStaffId > 0 && $fromStaffId === $toStaffId) {
                continue;
            }

            $transferredAt = (string) ($row->transferred_at ?? '');
            if ($transferredAt !== '') {
                return $transferredAt;
            }
        }

        return null;
    }
};
