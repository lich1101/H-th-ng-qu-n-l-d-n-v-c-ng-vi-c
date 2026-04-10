<?php

namespace App\Http\Helpers;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Opportunity;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Phân quyền CRM: admin xem tất cả; quản lý xem số liệu nhân sự thuộc phòng ban; nhân sự xem của mình.
 */
class CrmScope
{
    public static function hasGlobalScope(User $user): bool
    {
        return in_array($user->role, ['admin', 'administrator', 'ke_toan'], true);
    }

    public static function managedDepartmentIds(User $user): Collection
    {
        if ($user->role !== 'quan_ly') {
            return collect();
        }

        return $user->managedDepartments()
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter()
            ->unique()
            ->values();
    }

    public static function managerVisibleUserIds(User $user): Collection
    {
        $ids = collect([(int) $user->id]);
        $deptIds = self::managedDepartmentIds($user);
        if ($deptIds->isEmpty()) {
            return $ids->unique()->values();
        }

        return $ids
            ->merge(
                User::query()
                    ->whereIn('department_id', $deptIds)
                    ->pluck('id')
                    ->all()
            )
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter()
            ->unique()
            ->values();
    }

    public static function applyClientScope(Builder $query, User $user): Builder
    {
        if (self::hasGlobalScope($user)) {
            return $query;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = self::managedDepartmentIds($user);
            $teamUserIds = self::managerVisibleUserIds($user);

            return $query->where(function (Builder $builder) use ($deptIds, $teamUserIds, $user) {
                $builder->where('assigned_staff_id', (int) $user->id);
                $builder->orWhere('sales_owner_id', (int) $user->id);

                if ($teamUserIds->isNotEmpty()) {
                    $builder->orWhereIn('assigned_staff_id', $teamUserIds->all())
                        ->orWhereIn('sales_owner_id', $teamUserIds->all());
                }

                if ($deptIds->isNotEmpty()) {
                    $builder->orWhereIn('assigned_department_id', $deptIds->all())
                        ->orWhereHas('assignedStaff', function (Builder $staffQuery) use ($deptIds) {
                            $staffQuery->whereIn('department_id', $deptIds->all());
                        })
                        ->orWhereHas('salesOwner', function (Builder $staffQuery) use ($deptIds) {
                            $staffQuery->whereIn('department_id', $deptIds->all());
                        });
                }
            });
        }

        return $query->where(function (Builder $builder) use ($user) {
            $builder->where('assigned_staff_id', (int) $user->id)
                ->orWhere('sales_owner_id', (int) $user->id)
                ->orWhereHas('careStaffUsers', function (Builder $careQuery) use ($user) {
                    $careQuery->where('users.id', (int) $user->id);
                });
        });
    }

    /**
     * Nhân viên chỉ thấy khách theo phụ trách (assigned_staff / sales_owner), không theo nhóm chăm sóc.
     * Quản lý / admin / kế toán: giữ nguyên logic như applyClientScope.
     */
    public static function applyClientScopeAssignedOnly(Builder $query, User $user): Builder
    {
        if (self::hasGlobalScope($user)) {
            return $query;
        }

        if ($user->role === 'quan_ly') {
            return self::applyClientScope($query, $user);
        }

        return $query->where(function (Builder $builder) use ($user) {
            $builder->where('assigned_staff_id', (int) $user->id)
                ->orWhere('sales_owner_id', (int) $user->id);
        });
    }

    public static function applyContractScope(Builder $query, User $user): Builder
    {
        if (self::hasGlobalScope($user)) {
            return $query;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = self::managedDepartmentIds($user);
            $teamUserIds = self::managerVisibleUserIds($user);

            return $query->where(function (Builder $builder) use ($deptIds, $teamUserIds) {
                if ($teamUserIds->isNotEmpty()) {
                    $builder->whereIn('created_by', $teamUserIds)
                        ->orWhereIn('collector_user_id', $teamUserIds)
                        ->orWhereIn('handover_received_by', $teamUserIds);
                }

                $builder->orWhereHas('collector', function (Builder $collectorQuery) use ($deptIds, $teamUserIds) {
                    if ($teamUserIds->isNotEmpty()) {
                        $collectorQuery->whereIn('users.id', $teamUserIds);
                    }
                    if ($deptIds->isNotEmpty()) {
                        $collectorQuery->orWhereIn('department_id', $deptIds);
                    }
                });

                $builder->orWhereHas('careStaffUsers', function (Builder $careStaffQuery) use ($deptIds, $teamUserIds) {
                    if ($teamUserIds->isNotEmpty()) {
                        $careStaffQuery->whereIn('users.id', $teamUserIds);
                    }
                    if ($deptIds->isNotEmpty()) {
                        $careStaffQuery->orWhereIn('department_id', $deptIds);
                    }
                });

                $builder->orWhereHas('client', function (Builder $clientQuery) use ($deptIds, $teamUserIds) {
                    self::applyManagerClientScope($clientQuery, $deptIds, $teamUserIds);
                });
            });
        }

        return $query->where(function (Builder $builder) use ($user) {
            $builder->where('created_by', $user->id)
                ->orWhere('collector_user_id', $user->id)
                ->orWhereHas('careStaffUsers', function (Builder $careStaffQuery) use ($user) {
                    $careStaffQuery->where('users.id', $user->id);
                })
                ->orWhereHas('client', function (Builder $clientQuery) use ($user) {
                    $clientQuery->where('assigned_staff_id', $user->id)
                        ->orWhere('sales_owner_id', $user->id)
                        ->orWhereHas('careStaffUsers', function (Builder $careQuery) use ($user) {
                            $careQuery->where('users.id', $user->id);
                        });
                });
        });
    }

    public static function applyOpportunityScope(Builder $query, User $user): Builder
    {
        if (self::hasGlobalScope($user)) {
            return $query;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = self::managedDepartmentIds($user);
            $teamUserIds = self::managerVisibleUserIds($user);

            return $query->whereHas('client', function (Builder $clientQuery) use ($deptIds, $teamUserIds) {
                    self::applyManagerClientScope($clientQuery, $deptIds, $teamUserIds);
            });
        }

        return $query->where(function (Builder $builder) use ($user) {
            $builder->where('created_by', $user->id)
                ->orWhere('assigned_to', $user->id)
                ->orWhereHas('client', function (Builder $clientQuery) use ($user) {
                    $clientQuery->where('assigned_staff_id', $user->id)
                        ->orWhere('sales_owner_id', $user->id)
                        ->orWhereHas('careStaffUsers', function (Builder $careQuery) use ($user) {
                            $careQuery->where('users.id', $user->id);
                        });
                });
        });
    }

    public static function canManagerAccessClient(User $user, Client $client): bool
    {
        if ($user->role !== 'quan_ly') {
            return false;
        }

        $deptIds = self::managedDepartmentIds($user);
        $teamUserIds = self::managerVisibleUserIds($user);
        if ((int) ($client->assigned_staff_id ?? 0) === (int) $user->id) {
            return true;
        }
        if ((int) ($client->sales_owner_id ?? 0) === (int) $user->id) {
            return true;
        }

        if ($teamUserIds->contains((int) ($client->assigned_staff_id ?? 0))
            || $teamUserIds->contains((int) ($client->sales_owner_id ?? 0))) {
            return true;
        }

        if ($client->assigned_department_id && $deptIds->contains((int) $client->assigned_department_id)) {
            return true;
        }

        if ($deptIds->isEmpty()) {
            return false;
        }

        $client->loadMissing([
            'assignedStaff:id,department_id',
            'salesOwner:id,department_id',
        ]);

        $assignedStaffDeptId = (int) optional($client->assignedStaff)->department_id;
        if ($assignedStaffDeptId > 0 && $deptIds->contains($assignedStaffDeptId)) {
            return true;
        }

        $salesOwnerDeptId = (int) optional($client->salesOwner)->department_id;
        if ($salesOwnerDeptId > 0 && $deptIds->contains($salesOwnerDeptId)) {
            return true;
        }

        return false;
    }

    public static function canAccessClient(User $user, Client $client): bool
    {
        if (self::hasGlobalScope($user)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            return self::canManagerAccessClient($user, $client);
        }

        if ((int) ($client->assigned_staff_id ?? 0) === (int) $user->id) {
            return true;
        }
        if ((int) ($client->sales_owner_id ?? 0) === (int) $user->id) {
            return true;
        }

        $client->loadMissing('careStaffUsers:id');

        return $client->careStaffUsers->contains(function ($staff) use ($user) {
            return (int) $staff->id === (int) $user->id;
        });
    }

    public static function canManageClient(User $user, Client $client): bool
    {
        if ($user->role === 'admin') {
            return true;
        }

        if ($user->role === 'quan_ly') {
            return self::canManagerAccessClient($user, $client);
        }

        return (int) ($client->assigned_staff_id ?? 0) === (int) $user->id
            || (int) ($client->sales_owner_id ?? 0) === (int) $user->id;
    }

    public static function canManagerAccessOpportunity(User $user, Opportunity $opportunity): bool
    {
        if ($user->role !== 'quan_ly') {
            return false;
        }

        $opportunity->loadMissing('client');
        $client = $opportunity->client;
        if (! $client) {
            return false;
        }

        return self::canManagerAccessClient($user, $client);
    }

    public static function canManagerAccessContract(User $user, Contract $contract): bool
    {
        if ($user->role !== 'quan_ly') {
            return false;
        }

        $deptIds = self::managedDepartmentIds($user);
        $teamUserIds = self::managerVisibleUserIds($user);

        if ($teamUserIds->contains((int) $contract->created_by)
            || $teamUserIds->contains((int) $contract->collector_user_id)
            || $teamUserIds->contains((int) $contract->handover_received_by)) {
            return true;
        }

        $contract->loadMissing('collector');
        if ($contract->collector
            && ($teamUserIds->contains((int) $contract->collector->id)
                || ($contract->collector->department_id && $deptIds->contains((int) $contract->collector->department_id)))) {
            return true;
        }

        $contract->loadMissing('careStaffUsers:id,department_id');
        if ($contract->careStaffUsers->contains(function ($staff) use ($teamUserIds, $deptIds) {
            return $teamUserIds->contains((int) $staff->id)
                || ($staff->department_id && $deptIds->contains((int) $staff->department_id));
        })) {
            return true;
        }

        $contract->loadMissing('client');
        $client = $contract->client;
        if (! $client) {
            return false;
        }

        return self::canManagerAccessClient($user, $client);
    }

    private static function applyManagerClientScope(Builder $builder, Collection $deptIds, Collection $teamUserIds): void
    {
        $builder->where(function (Builder $clientQuery) use ($deptIds, $teamUserIds) {
            $hasScope = false;

            if ($teamUserIds->isNotEmpty()) {
                $clientQuery->whereIn('assigned_staff_id', $teamUserIds->all())
                    ->orWhereIn('sales_owner_id', $teamUserIds->all());
                $hasScope = true;
            }

            if ($deptIds->isNotEmpty()) {
                if (! $hasScope) {
                    $clientQuery->whereIn('assigned_department_id', $deptIds->all());
                } else {
                    $clientQuery->orWhereIn('assigned_department_id', $deptIds->all());
                }

                $clientQuery->orWhereHas('assignedStaff', function (Builder $staffQuery) use ($deptIds) {
                    $staffQuery->whereIn('department_id', $deptIds->all());
                });
                $clientQuery->orWhereHas('salesOwner', function (Builder $staffQuery) use ($deptIds) {
                    $staffQuery->whereIn('department_id', $deptIds->all());
                });

                $hasScope = true;
            }

            if (! $hasScope) {
                $clientQuery->whereRaw('1 = 0');
            }
        });
    }
}
