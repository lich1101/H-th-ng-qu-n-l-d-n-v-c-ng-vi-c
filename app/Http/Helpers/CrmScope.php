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
    public static function canViewRotationPoolClientsInCrm(User $user): bool
    {
        return in_array($user->role, ['admin', 'administrator'], true);
    }

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

    private static function applyEmployeeOwnedClientScope(Builder $builder, int $userId): void
    {
        $builder->where('assigned_staff_id', $userId)
            ->orWhere(function (Builder $fallbackQuery) use ($userId) {
                $fallbackQuery->whereNull('assigned_staff_id')
                    ->where('sales_owner_id', $userId);
            });
    }

    private static function applyOwnedRotationPoolClientScope(Builder $builder, int $userId, string $qualifiedColumn = 'clients.is_in_rotation_pool'): void
    {
        $builder->where($qualifiedColumn, true)
            ->where(function (Builder $ownedQuery) use ($userId) {
                self::applyEmployeeOwnedClientScope($ownedQuery, $userId);
            });
    }

    private static function applyNotInRotationPool(Builder $builder, string $qualifiedColumn = 'clients.is_in_rotation_pool'): void
    {
        $builder->where(function (Builder $poolQuery) use ($qualifiedColumn) {
            $poolQuery->whereNull($qualifiedColumn)
                ->orWhere($qualifiedColumn, false);
        });
    }

    public static function isClientInRotationPool(Client $client): bool
    {
        return (bool) ($client->is_in_rotation_pool ?? false);
    }

    public static function canAccessRotationPoolClient(User $user, Client $client): bool
    {
        if (self::canViewRotationPoolClientsInCrm($user)) {
            return true;
        }

        return self::employeeOwnsClient($user, $client);
    }

    public static function employeeOwnsClient(User $user, Client $client): bool
    {
        if ((int) ($client->assigned_staff_id ?? 0) === (int) $user->id) {
            return true;
        }

        return (int) ($client->assigned_staff_id ?? 0) <= 0
            && (int) ($client->sales_owner_id ?? 0) === (int) $user->id;
    }

    private static function isClientCareStaff(User $user, Client $client): bool
    {
        $client->loadMissing('careStaffUsers:id');

        return $client->careStaffUsers->contains(function ($staff) use ($user) {
            return (int) $staff->id === (int) $user->id;
        });
    }

    public static function applyClientScope(Builder $query, User $user): Builder
    {
        if (self::canViewRotationPoolClientsInCrm($user)) {
            return $query;
        }

        if (self::hasGlobalScope($user)) {
            self::applyNotInRotationPool($query);

            return $query;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = self::managedDepartmentIds($user);
            $teamUserIds = self::managerVisibleUserIds($user);

            return $query->where(function (Builder $visibilityQuery) use ($deptIds, $teamUserIds, $user) {
                $visibilityQuery->where(function (Builder $builder) use ($deptIds, $teamUserIds, $user) {
                    self::applyNotInRotationPool($builder);

                    $builder->where(function (Builder $scopeQuery) use ($deptIds, $teamUserIds, $user) {
                        $scopeQuery->where('assigned_staff_id', (int) $user->id);
                        $scopeQuery->orWhere(function (Builder $fallbackQuery) use ($user) {
                            $fallbackQuery->whereNull('assigned_staff_id')
                                ->where('sales_owner_id', (int) $user->id);
                        });

                        if ($teamUserIds->isNotEmpty()) {
                            $scopeQuery->orWhereIn('assigned_staff_id', $teamUserIds->all())
                                ->orWhere(function (Builder $fallbackQuery) use ($teamUserIds) {
                                    $fallbackQuery->whereNull('assigned_staff_id')
                                        ->whereIn('sales_owner_id', $teamUserIds->all());
                                });
                        }

                        if ($deptIds->isNotEmpty()) {
                            $scopeQuery->orWhereIn('assigned_department_id', $deptIds->all())
                                ->orWhereHas('assignedStaff', function (Builder $staffQuery) use ($deptIds) {
                                    $staffQuery->whereIn('department_id', $deptIds->all());
                                })
                                ->orWhere(function (Builder $fallbackQuery) use ($deptIds) {
                                    $fallbackQuery->whereNull('assigned_staff_id')
                                        ->whereNull('assigned_department_id')
                                        ->whereHas('salesOwner', function (Builder $staffQuery) use ($deptIds) {
                                            $staffQuery->whereIn('department_id', $deptIds->all());
                                        });
                                });
                        }
                    });
                });

                $visibilityQuery->orWhere(function (Builder $poolQuery) use ($user) {
                    self::applyOwnedRotationPoolClientScope($poolQuery, (int) $user->id);
                });
            });
        }

        return $query->where(function (Builder $visibilityQuery) use ($user) {
            $visibilityQuery->where(function (Builder $builder) use ($user) {
                self::applyNotInRotationPool($builder);

                $builder->where(function (Builder $scopeQuery) use ($user) {
                    self::applyEmployeeOwnedClientScope($scopeQuery, (int) $user->id);
                    $scopeQuery->orWhereHas('careStaffUsers', function (Builder $careQuery) use ($user) {
                        $careQuery->where('users.id', (int) $user->id);
                    });
                });
            });

            $visibilityQuery->orWhere(function (Builder $poolQuery) use ($user) {
                self::applyOwnedRotationPoolClientScope($poolQuery, (int) $user->id);
            });
        });
    }

    /**
     * Nhân viên chỉ thấy khách theo phụ trách hiện tại; chỉ fallback sang sales_owner khi dữ liệu cũ chưa có assigned_staff.
     * Quản lý / admin / kế toán: giữ nguyên logic như applyClientScope.
     */
    public static function applyClientScopeAssignedOnly(Builder $query, User $user): Builder
    {
        if (self::canViewRotationPoolClientsInCrm($user)) {
            return $query;
        }

        if (self::hasGlobalScope($user)) {
            self::applyNotInRotationPool($query);

            return $query;
        }

        if ($user->role === 'quan_ly') {
            return self::applyClientScope($query, $user);
        }

        return $query->where(function (Builder $visibilityQuery) use ($user) {
            $visibilityQuery->where(function (Builder $builder) use ($user) {
                self::applyNotInRotationPool($builder);
                $builder->where(function (Builder $scopeQuery) use ($user) {
                    self::applyEmployeeOwnedClientScope($scopeQuery, (int) $user->id);
                });
            });

            $visibilityQuery->orWhere(function (Builder $poolQuery) use ($user) {
                self::applyOwnedRotationPoolClientScope($poolQuery, (int) $user->id);
            });
        });
    }

    public static function applyContractScope(Builder $query, User $user): Builder
    {
        $query->whereHas('client', function (Builder $clientQuery) {
            self::applyNotInRotationPool($clientQuery);
        });

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

        // Nhân viên: thấy hợp đồng nếu trực tiếp liên quan hoặc thuộc khách đang phụ trách/chăm sóc.
        return $query->where(function (Builder $builder) use ($user) {
            $builder->where('created_by', $user->id)
                ->orWhere('collector_user_id', $user->id)
                ->orWhereHas('careStaffUsers', function (Builder $careStaffQuery) use ($user) {
                    $careStaffQuery->where('users.id', $user->id);
                })
                ->orWhereHas('client', function (Builder $clientQuery) use ($user) {
                    self::applyEmployeeOwnedClientScope($clientQuery, (int) $user->id);
                    $clientQuery->orWhereHas('careStaffUsers', function (Builder $careQuery) use ($user) {
                        $careQuery->where('users.id', (int) $user->id);
                    });
                });
        });
    }

    public static function applyOpportunityScope(Builder $query, User $user): Builder
    {
        $query->whereHas('client', function (Builder $clientQuery) {
            self::applyNotInRotationPool($clientQuery);
        });

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

        // Nhân viên: chỉ thấy cơ hội thuộc khách mình đang phụ trách/chăm sóc.
        return $query->where(function (Builder $builder) use ($user) {
            $builder->whereHas('client', function (Builder $clientQuery) use ($user) {
                self::applyEmployeeOwnedClientScope($clientQuery, (int) $user->id);
                $clientQuery->orWhereHas('careStaffUsers', function (Builder $careQuery) use ($user) {
                    $careQuery->where('users.id', (int) $user->id);
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
        $assignedStaffId = (int) ($client->assigned_staff_id ?? 0);
        $salesOwnerId = (int) ($client->sales_owner_id ?? 0);
        if ((int) ($client->assigned_staff_id ?? 0) === (int) $user->id) {
            return true;
        }
        if ($assignedStaffId <= 0 && $salesOwnerId === (int) $user->id) {
            return true;
        }

        if ($teamUserIds->contains($assignedStaffId)
            || ($assignedStaffId <= 0 && $teamUserIds->contains($salesOwnerId))) {
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
        if ($assignedStaffId <= 0
            && ! $client->assigned_department_id
            && $salesOwnerDeptId > 0
            && $deptIds->contains($salesOwnerDeptId)) {
            return true;
        }

        return false;
    }

    public static function canAccessClient(User $user, Client $client): bool
    {
        if (self::isClientInRotationPool($client)) {
            return self::canAccessRotationPoolClient($user, $client);
        }

        if (self::hasGlobalScope($user)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            return self::canManagerAccessClient($user, $client);
        }

        if (self::employeeOwnsClient($user, $client)) {
            return true;
        }

        return self::isClientCareStaff($user, $client);
    }

    public static function canManageClient(User $user, Client $client): bool
    {
        if (self::isClientInRotationPool($client)) {
            return self::canAccessRotationPoolClient($user, $client);
        }

        if (in_array($user->role, ['admin', 'administrator'], true)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            return self::canManagerAccessClient($user, $client);
        }

        return self::employeeOwnsClient($user, $client);
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
                    ->orWhere(function (Builder $fallbackQuery) use ($teamUserIds) {
                        $fallbackQuery->whereNull('assigned_staff_id')
                            ->whereIn('sales_owner_id', $teamUserIds->all());
                    });
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
                $clientQuery->orWhere(function (Builder $fallbackQuery) use ($deptIds) {
                    $fallbackQuery->whereNull('assigned_staff_id')
                        ->whereNull('assigned_department_id')
                        ->whereHas('salesOwner', function (Builder $staffQuery) use ($deptIds) {
                            $staffQuery->whereIn('department_id', $deptIds->all());
                        });
                });

                $hasScope = true;
            }

            if (! $hasScope) {
                $clientQuery->whereRaw('1 = 0');
            }
        });
    }
}
