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

        if ($user->role === 'admin') {
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

        if ($user->role === 'admin') {
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

    public static function applyTaskItemScope(Builder $query, ?User $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->role === 'admin') {
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

        if ($user->role !== 'nhan_vien') {
            return false;
        }

        if ((int) $project->owner_id !== (int) $user->id) {
            return false;
        }

        $progress = (int) ($project->progress_percent ?? 0);

        return $progress >= max(0, min(100, $minimumProgressPercent))
            && (string) ($project->handover_status ?? '') !== 'pending';
    }

    public static function canReviewProjectHandover(?User $user, Project $project): bool
    {
        if (! $user) {
            return false;
        }

        if ($user->role === 'admin') {
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

        return max(0, $collectorId);
    }

    public static function resolveChatParticipantIds(Task $task): Collection
    {
        $ids = collect(
            User::query()
                ->where('role', 'admin')
                ->pluck('id')
                ->all()
        );

        $ownerId = $task->project ? (int) $task->project->owner_id : (int) $task->project()->value('owner_id');
        if ($ownerId > 0) {
            $ids->push($ownerId);
        }

        $collectorId = $task->project && $task->project->relationLoaded('contract')
            ? (int) optional($task->project->contract)->collector_user_id
            : (int) $task->project()->join('contracts', 'projects.contract_id', '=', 'contracts.id')
                ->where('projects.id', $task->project_id)
                ->value('contracts.collector_user_id');
        if ($collectorId > 0) {
            $ids->push($collectorId);
        }

        if ($task->department_id) {
            $managerId = Department::query()
                ->where('id', $task->department_id)
                ->value('manager_id');
            if ($managerId) {
                $ids->push((int) $managerId);
            }
        }

        $ids = $ids->merge(
            $task->items()
                ->whereNotNull('assignee_id')
                ->pluck('assignee_id')
        );

        $ids = $ids->merge(
            $task->comments()
                ->whereNotNull('user_id')
                ->pluck('user_id')
        );

        foreach ([
            $task->assignee_id,
            $task->reviewer_id,
            $task->created_by,
            $task->assigned_by,
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
}
