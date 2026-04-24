<?php

namespace App\Http\Helpers;

use App\Models\Department;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class ProjectScope
{
    public static function applyProjectScope(Builder $query, ?User $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if (self::isAdminRole($user)) {
            return $query;
        }

        if ($user->role === 'ke_toan') {
            return $query->whereRaw('1 = 0');
        }

        $managedDepartmentIds = self::managedDepartmentIds($user);

        return $query->where(function (Builder $builder) use ($user, $managedDepartmentIds) {
            $builder->where('owner_id', $user->id)
                ->orWhereHas('contract', function (Builder $contractQuery) use ($user) {
                    $contractQuery->where('collector_user_id', $user->id);
                })
                ->orWhereHas('tasks', function (Builder $taskQuery) use ($user, $managedDepartmentIds) {
                    $taskQuery->where('assignee_id', $user->id)
                        ->orWhere('reviewer_id', $user->id)
                        ->orWhere('created_by', $user->id)
                        ->orWhere('assigned_by', $user->id)
                        ->orWhereHas('items', function (Builder $itemQuery) use ($user) {
                            $itemQuery->where('assignee_id', $user->id)
                                ->orWhere('reviewer_id', $user->id)
                                ->orWhere('created_by', $user->id)
                                ->orWhere('assigned_by', $user->id);
                        });

                    if ($managedDepartmentIds->isNotEmpty()) {
                        $taskQuery->orWhereIn('department_id', $managedDepartmentIds)
                            ->orWhereHas('assignee', function (Builder $assigneeQuery) use ($managedDepartmentIds) {
                                $assigneeQuery->whereIn('department_id', $managedDepartmentIds);
                            })
                            ->orWhereHas('reviewer', function (Builder $reviewerQuery) use ($managedDepartmentIds) {
                                $reviewerQuery->whereIn('department_id', $managedDepartmentIds);
                            });
                    }
                });

            if ($managedDepartmentIds->isNotEmpty()) {
                $builder->orWhereHas('contract.collector', function (Builder $collectorQuery) use ($managedDepartmentIds) {
                    $collectorQuery->whereIn('department_id', $managedDepartmentIds);
                });
            }
        });
    }

    public static function canAccessProject(?User $user, Project $project): bool
    {
        if (! $user) {
            return false;
        }

        return self::applyProjectScope(
            Project::query()->whereKey($project->id),
            $user
        )->exists();
    }

    public static function applyTaskScope(Builder $query, ?User $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if (self::isAdminRole($user)) {
            return $query;
        }

        if ($user->role === 'ke_toan') {
            return $query->whereRaw('1 = 0');
        }

        $managedDepartmentIds = self::managedDepartmentIds($user);

        return $query->where(function (Builder $builder) use ($user, $managedDepartmentIds) {
            $builder->where('assignee_id', $user->id)
                ->orWhere('reviewer_id', $user->id)
                ->orWhere('created_by', $user->id)
                ->orWhere('assigned_by', $user->id)
                ->orWhereHas('items', function (Builder $itemQuery) use ($user) {
                    $itemQuery->where('assignee_id', $user->id)
                        ->orWhere('reviewer_id', $user->id)
                        ->orWhere('created_by', $user->id)
                        ->orWhere('assigned_by', $user->id);
                })
                ->orWhereHas('project', function (Builder $projectQuery) use ($user, $managedDepartmentIds) {
                    $projectQuery->where('owner_id', $user->id)
                        ->orWhereHas('contract', function (Builder $contractQuery) use ($user) {
                            $contractQuery->where('collector_user_id', $user->id);
                        });

                    if ($managedDepartmentIds->isNotEmpty()) {
                        $projectQuery->orWhereHas('contract.collector', function (Builder $collectorQuery) use ($managedDepartmentIds) {
                            $collectorQuery->whereIn('department_id', $managedDepartmentIds);
                        });
                    }
                });

            if ($managedDepartmentIds->isNotEmpty()) {
                $builder->orWhereIn('department_id', $managedDepartmentIds)
                    ->orWhereHas('assignee', function (Builder $assigneeQuery) use ($managedDepartmentIds) {
                        $assigneeQuery->whereIn('department_id', $managedDepartmentIds);
                    })
                    ->orWhereHas('reviewer', function (Builder $reviewerQuery) use ($managedDepartmentIds) {
                        $reviewerQuery->whereIn('department_id', $managedDepartmentIds);
                    });
            }
        });
    }

    public static function applyTaskListScope(Builder $query, ?User $user): Builder
    {
        return self::applyTaskScope($query, $user);
    }

    public static function canAccessTask(?User $user, Task $task): bool
    {
        if (! $user) {
            return false;
        }

        return self::applyTaskScope(
            Task::query()->whereKey($task->id),
            $user
        )->exists();
    }

    public static function applyTaskChatScope(Builder $query, ?User $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if (self::isAdminRole($user)) {
            return $query;
        }

        if ($user->role === 'ke_toan') {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(function (Builder $builder) use ($user) {
            $builder->where('assignee_id', $user->id)
                ->orWhereHas('project', function (Builder $projectQuery) use ($user) {
                    $projectQuery->where('owner_id', $user->id);
                })
                ->orWhereHas('items', function (Builder $itemQuery) use ($user) {
                    $itemQuery->where('assignee_id', $user->id);
                });
        });
    }

    public static function canAccessTaskChat(?User $user, Task $task): bool
    {
        if (! $user) {
            return false;
        }

        return self::applyTaskChatScope(
            Task::query()->whereKey($task->id),
            $user
        )->exists();
    }

    public static function applyTaskItemScope(Builder $query, ?User $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if (self::isAdminRole($user)) {
            return $query;
        }

        if ($user->role === 'ke_toan') {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(function (Builder $builder) use ($user) {
            $builder->where('assignee_id', $user->id)
                ->orWhere('reviewer_id', $user->id)
                ->orWhere('created_by', $user->id)
                ->orWhere('assigned_by', $user->id)
                ->orWhereHas('task', function (Builder $taskQuery) use ($user) {
                    self::applyTaskScope($taskQuery, $user);
                });
        });
    }

    public static function applyTaskItemListScope(Builder $query, ?User $user): Builder
    {
        return self::applyTaskItemScope($query, $user);
    }

    public static function canAccessTaskItem(?User $user, TaskItem $item): bool
    {
        if (! $user) {
            return false;
        }

        return self::applyTaskItemScope(
            TaskItem::query()->whereKey($item->id),
            $user
        )->exists();
    }

    public static function canSubmitProjectHandover(?User $user, Project $project, int $minimumProgressPercent = 90): bool
    {
        if (! $user) {
            return false;
        }

        if (! self::hasLinkedContract($project)) {
            return false;
        }

        if (in_array((string) $user->role, ['admin', 'administrator'], true)) {
            $progress = (int) ($project->progress_percent ?? 0);

            return $progress >= max(0, min(100, $minimumProgressPercent))
                && ! in_array((string) ($project->handover_status ?? ''), ['pending', 'approved'], true);
        }

        if ((int) $project->owner_id !== (int) $user->id) {
            return false;
        }

        if (! in_array((string) $user->role, ['nhan_vien', 'quan_ly'], true)) {
            return false;
        }

        $progress = (int) ($project->progress_percent ?? 0);

        return $progress >= max(0, min(100, $minimumProgressPercent))
            && ! in_array((string) ($project->handover_status ?? ''), ['pending', 'approved'], true);
    }

    public static function canReviewProjectHandover(?User $user, Project $project): bool
    {
        if (! $user) {
            return false;
        }

        if (! self::hasLinkedContract($project)) {
            return false;
        }

        if (in_array((string) $user->role, ['admin', 'administrator'], true)) {
            return true;
        }

        $collectorId = self::projectCollectorId($project);

        return $collectorId > 0 && (int) $collectorId === (int) $user->id;
    }

    public static function projectCollectorId(Project $project): int
    {
        $collectorId = $project->relationLoaded('contract')
            ? (int) optional($project->contract)->collector_user_id
            : (int) $project->contract()->value('collector_user_id');

        if ($collectorId <= 0) {
            $collectorId = (int) \App\Models\Contract::query()
                ->where('project_id', $project->id)
                ->value('collector_user_id');
        }

        return max(0, $collectorId);
    }

    public static function hasLinkedContract(Project $project): bool
    {
        if ((int) ($project->contract_id ?? 0) > 0) {
            return true;
        }

        if ($project->relationLoaded('contract') && $project->contract) {
            return true;
        }

        if ($project->contract()->exists()) {
            return true;
        }

        return \App\Models\Contract::query()
            ->where('project_id', $project->id)
            ->exists();
    }

    public static function projectOwnerId(Project $project): int
    {
        return max(0, (int) ($project->owner_id ?? 0));
    }

    public static function taskProjectOwnerId(Task $task): int
    {
        $ownerId = $task->project
            ? (int) ($task->project->owner_id ?? 0)
            : (int) $task->project()->value('owner_id');

        return max(0, $ownerId);
    }

    /**
     * NV thu hợp đồng (collector): chỉ xem vận hành dự án/công việc/đầu việc, không chỉnh sửa.
     * Chủ dự án và admin không bị giới hạn dù trùng collector.
     */
    public static function isContractCollectorOperationsReadOnly(?User $user, Project $project): bool
    {
        if (! $user) {
            return false;
        }

        if (self::isAdminRole($user)) {
            return false;
        }

        if (self::projectOwnerId($project) > 0 && self::projectOwnerId($project) === (int) $user->id) {
            return false;
        }

        if (! self::hasLinkedContract($project)) {
            return false;
        }

        $collectorId = self::projectCollectorId($project);

        return $collectorId > 0 && $collectorId === (int) $user->id;
    }

    public static function canManageProjectTasks(?User $user, Project $project): bool
    {
        if (! $user) {
            return false;
        }

        if (self::isAdminRole($user)) {
            return true;
        }

        return self::projectOwnerId($project) > 0
            && self::projectOwnerId($project) === (int) $user->id;
    }

    public static function canManageTaskItems(?User $user, Task $task): bool
    {
        if (! $user) {
            return false;
        }

        if (self::isAdminRole($user)) {
            return true;
        }

        $project = $task->project;
        if ($project && self::isContractCollectorOperationsReadOnly($user, $project)) {
            return false;
        }

        if (self::taskProjectOwnerId($task) > 0 && self::taskProjectOwnerId($task) === (int) $user->id) {
            return true;
        }

        return (int) ($task->assignee_id ?? 0) === (int) $user->id;
    }

    public static function canManageProjectFiles(?User $user, Project $project): bool
    {
        if (! $user) {
            return false;
        }

        if (self::isAdminRole($user)) {
            return true;
        }

        if (self::projectOwnerId($project) > 0 && self::projectOwnerId($project) === (int) $user->id) {
            return true;
        }

        $hasTaskAssignee = Task::query()
            ->where('project_id', $project->id)
            ->where('assignee_id', $user->id)
            ->exists();

        if ($hasTaskAssignee) {
            return true;
        }

        return TaskItem::query()
            ->where('assignee_id', $user->id)
            ->whereHas('task', function (Builder $taskQuery) use ($project) {
                $taskQuery->where('project_id', $project->id);
            })
            ->exists();
    }

    public static function canReviewTaskProgress(?User $user, Task $task): bool
    {
        if (! $user) {
            return false;
        }

        if (self::isAdminRole($user)) {
            return true;
        }

        return self::taskProjectOwnerId($task) > 0
            && self::taskProjectOwnerId($task) === (int) $user->id;
    }

    public static function canSubmitTaskItemProgress(?User $user, Task $task, TaskItem $item): bool
    {
        if (! $user) {
            return false;
        }

        if (self::isAdminRole($user)) {
            return true;
        }

        $project = $task->project;
        if ($project && self::isContractCollectorOperationsReadOnly($user, $project)) {
            return false;
        }

        if ((int) ($task->assignee_id ?? 0) === (int) $user->id) {
            return true;
        }

        return (int) ($item->assignee_id ?? 0) === (int) $user->id;
    }

    public static function resolveChatParticipantIds(Task $task): Collection
    {
        $ids = collect(
            User::query()
                ->whereIn('role', ['admin', 'administrator'])
                ->pluck('id')
                ->all()
        );

        $ownerId = $task->project ? (int) $task->project->owner_id : (int) $task->project()->value('owner_id');
        if ($ownerId > 0) {
            $ids->push($ownerId);
        }

        $ids = $ids->merge(
            $task->items()
                ->whereNotNull('assignee_id')
                ->pluck('assignee_id')
        );

        foreach ([
            $task->assignee_id,
        ] as $value) {
            if ($value) {
                $ids->push((int) $value);
            }
        }

        return $ids->filter()->unique()->values();
    }

    private static function managedDepartmentIds(User $user): Collection
    {
        return $user->role === 'quan_ly'
            ? $user->managedDepartments()->pluck('id')
            : collect();
    }

    private static function isAdminRole(User $user): bool
    {
        return in_array((string) $user->role, ['admin', 'administrator'], true);
    }
}
