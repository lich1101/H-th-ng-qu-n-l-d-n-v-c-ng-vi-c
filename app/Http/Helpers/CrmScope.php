<?php

namespace App\Http\Helpers;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Phân quyền CRM: admin xem tất cả; quản lý xem số liệu nhân sự thuộc phòng ban; nhân sự xem của mình.
 */
class CrmScope
{
    public static function applyClientScope(Builder $query, User $user): Builder
    {
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return $query;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return $query->whereIn('assigned_department_id', $deptIds);
        }

        return $query->where('assigned_staff_id', $user->id);
    }

    public static function applyContractScope(Builder $query, User $user): Builder
    {
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return $query;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return $query->where(function (Builder $builder) use ($deptIds, $user) {
                $builder->where('collector_user_id', $user->id)
                    ->orWhereHas('collector', function (Builder $collectorQuery) use ($deptIds) {
                        $collectorQuery->whereIn('department_id', $deptIds);
                    })
                    ->orWhereHas('client', function (Builder $clientQuery) use ($deptIds) {
                        $clientQuery->whereIn('assigned_department_id', $deptIds);
                    });
            });
        }

        return $query->where(function (Builder $builder) use ($user) {
            $builder->where('collector_user_id', $user->id)
                ->orWhereHas('client', function (Builder $clientQuery) use ($user) {
                    $clientQuery->where('assigned_staff_id', $user->id);
                });
        });
    }

    public static function applyOpportunityScope(Builder $query, User $user): Builder
    {
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return $query;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return $query->whereHas('client', function (Builder $clientQuery) use ($deptIds) {
                $clientQuery->whereIn('assigned_department_id', $deptIds);
            });
        }

        return $query->whereHas('client', function (Builder $clientQuery) use ($user) {
            $clientQuery->where('assigned_staff_id', $user->id);
        });
    }
}
