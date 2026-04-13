<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class ProjectDashboardController extends Controller
{
    private const PACE_TOLERANCE_PERCENT = 3.0;

    private const PROJECT_STATUS_LABELS = [
        'moi_tao' => 'Mới tạo',
        'dang_trien_khai' => 'Đang triển khai',
        'cho_duyet' => 'Chờ duyệt',
        'hoan_thanh' => 'Hoàn thành',
        'tam_dung' => 'Tạm dừng',
    ];

    private const PACE_LABELS = [
        'behind' => 'Chậm tiến độ',
        'on_track' => 'Kịp tiến độ',
        'ahead' => 'Vượt tiến độ',
        'handover_completed' => 'Đã hoàn thành bàn giao',
    ];

    public function overview(Request $request): JsonResponse
    {
        $viewer = $request->user();
        if (! $viewer || ! in_array((string) $viewer->role, ['admin', 'administrator'], true)) {
            return response()->json(['message' => 'Không có quyền xem dashboard quản lý dự án.'], 403);
        }

        $staffIds = $this->parseIntArray($request->input('staff_ids', []));
        $projectStatuses = $this->parseStringArray(
            $request->input('project_statuses', []),
            array_keys(self::PROJECT_STATUS_LABELS)
        );
        $paceStatuses = $this->parseStringArray(
            $request->input('pace_statuses', []),
            array_keys(self::PACE_LABELS)
        );
        $search = trim((string) $request->input('search', ''));
        [$startDateFrom, $startDateTo] = $this->parseDateRange(
            $request->input('start_date_from'),
            $request->input('start_date_to')
        );

        $projectScopeQuery = Project::query()
            ->with([
                'owner:id,name,email,role,department_id,avatar_url',
                'owner.departmentRelation:id,name',
            ]);

        if (! empty($projectStatuses)) {
            $projectScopeQuery->whereIn('status', $projectStatuses);
        }

        if ($search !== '') {
            $projectScopeQuery->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('status', 'like', "%{$search}%")
                    ->orWhereHas('owner', function ($ownerQuery) use ($search) {
                        $ownerQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }
        $this->applyDateRangeFilter($projectScopeQuery, 'start_date', $startDateFrom, $startDateTo);

        /** @var Collection<int, Project> $projectsInScope */
        $projectsInScope = $projectScopeQuery->orderByDesc('id')->get([
            'id',
            'code',
            'name',
            'owner_id',
            'status',
            'handover_status',
            'start_date',
            'deadline',
            'progress_percent',
            'created_at',
        ]);

        $completedProjectLookup = $projectsInScope
            ->filter(function (Project $project) {
                return $this->isHandoverCompletedProject($project);
            })
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function (int $id) {
                return $id > 0;
            })
            ->flip()
            ->all();

        $projectRows = $projectsInScope
            ->when(! empty($staffIds), function (Collection $items) use ($staffIds) {
                return $items->filter(function (Project $project) use ($staffIds) {
                    return $project->owner_id && in_array((int) $project->owner_id, $staffIds, true);
                });
            })
            ->map(function (Project $project) {
                $isHandoverCompleted = $this->isHandoverCompletedProject($project);
                $isCompleted = $isHandoverCompleted
                    ? true
                    : $this->isCompleted((string) ($project->status ?? ''), (int) ($project->progress_percent ?? 0));
                $progressPercent = $isCompleted ? 100 : (int) ($project->progress_percent ?? 0);
                $pace = $isHandoverCompleted
                    ? $this->buildHandoverCompletedPace()
                    : $this->buildPaceSummary(
                        $project->start_date,
                        $project->deadline,
                        $progressPercent,
                        $project->created_at
                    );

                return [
                    'id' => (int) $project->id,
                    'code' => (string) ($project->code ?? ''),
                    'name' => (string) ($project->name ?? ''),
                    'status' => (string) ($project->status ?? ''),
                    'status_label' => self::PROJECT_STATUS_LABELS[(string) $project->status] ?? (string) ($project->status ?? '—'),
                    'owner_id' => $project->owner_id ? (int) $project->owner_id : null,
                    'owner_name' => optional($project->owner)->name ?: 'Chưa phân công',
                    'owner_email' => optional($project->owner)->email ?: '',
                    'start_date' => $project->start_date ? $project->start_date->toDateString() : null,
                    'deadline' => $project->deadline ? $project->deadline->toDateString() : null,
                    'progress_percent' => $progressPercent,
                    'pace' => $pace,
                    'is_completed' => $isCompleted,
                    'is_handover_completed' => $isHandoverCompleted,
                ];
            })
            ->values();

        if (! empty($paceStatuses)) {
            $projectRows = $projectRows->filter(function (array $row) use ($paceStatuses) {
                return in_array((string) ($row['pace']['status'] ?? ''), $paceStatuses, true);
            })->values();
        }

        $projectIdsInScope = $projectsInScope
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function (int $id) {
                return $id > 0;
            })
            ->values()
            ->all();

        $taskRows = collect();
        if (! empty($projectIdsInScope)) {
            $taskQuery = Task::query()
                ->with([
                    'assignee:id,name,email,role,department_id,avatar_url',
                    'assignee.departmentRelation:id,name',
                ])
                ->whereIn('project_id', $projectIdsInScope);

            if (! empty($staffIds)) {
                $taskQuery->whereIn('assignee_id', $staffIds);
            }

            $this->applyTaskSearchFilter($taskQuery, $search);
            $this->applyDateRangeFilter($taskQuery, 'start_at', $startDateFrom, $startDateTo);

            /** @var Collection<int, Task> $tasks */
            $tasks = $taskQuery->orderByDesc('id')->get([
                'id',
                'project_id',
                'title',
                'status',
                'assignee_id',
                'start_at',
                'deadline',
                'progress_percent',
                'created_at',
            ]);

            $taskRows = $tasks->map(function (Task $task) use ($completedProjectLookup) {
                $isHandoverCompleted = isset($completedProjectLookup[(int) $task->project_id]);
                $isCompleted = $isHandoverCompleted
                    ? true
                    : $this->isCompleted((string) ($task->status ?? ''), (int) ($task->progress_percent ?? 0));
                $progressPercent = $isCompleted ? 100 : (int) ($task->progress_percent ?? 0);
                $pace = $isHandoverCompleted
                    ? $this->buildHandoverCompletedPace()
                    : $this->buildPaceSummary(
                        $task->start_at,
                        $task->deadline,
                        $progressPercent,
                        $task->created_at
                    );

                return [
                    'id' => (int) $task->id,
                    'project_id' => (int) $task->project_id,
                    'title' => (string) ($task->title ?? ''),
                    'status' => (string) ($task->status ?? ''),
                    'assignee_id' => $task->assignee_id ? (int) $task->assignee_id : null,
                    'assignee_name' => optional($task->assignee)->name ?: 'Chưa phân công',
                    'assignee_email' => optional($task->assignee)->email ?: '',
                    'start_at' => $task->start_at ? $task->start_at->toDateString() : null,
                    'deadline' => $task->deadline ? $task->deadline->toDateString() : null,
                    'progress_percent' => $progressPercent,
                    'pace' => $pace,
                    'is_completed' => $isCompleted,
                    'is_handover_completed' => $isHandoverCompleted,
                ];
            })->values();

            if (! empty($paceStatuses)) {
                $taskRows = $taskRows->filter(function (array $row) use ($paceStatuses) {
                    return in_array((string) ($row['pace']['status'] ?? ''), $paceStatuses, true);
                })->values();
            }
        }

        $taskItemRows = collect();
        if (! empty($projectIdsInScope)) {
            $taskItemQuery = TaskItem::query()
                ->with([
                    'assignee:id,name,email,role,department_id,avatar_url',
                    'assignee.departmentRelation:id,name',
                    'task:id,project_id',
                ])
                ->whereHas('task', function ($taskQuery) use ($projectIdsInScope) {
                    $taskQuery->whereIn('project_id', $projectIdsInScope);
                });

            if (! empty($staffIds)) {
                $taskItemQuery->whereIn('assignee_id', $staffIds);
            }

            $this->applyTaskItemSearchFilter($taskItemQuery, $search);
            $this->applyDateRangeFilter($taskItemQuery, 'start_date', $startDateFrom, $startDateTo);

            /** @var Collection<int, TaskItem> $taskItems */
            $taskItems = $taskItemQuery->orderByDesc('id')->get([
                'id',
                'task_id',
                'title',
                'status',
                'assignee_id',
                'start_date',
                'deadline',
                'progress_percent',
                'created_at',
            ]);

            $taskItemRows = $taskItems->map(function (TaskItem $item) use ($completedProjectLookup) {
                $projectId = (int) optional($item->task)->project_id;
                $isHandoverCompleted = $projectId > 0 && isset($completedProjectLookup[$projectId]);
                $isCompleted = $isHandoverCompleted
                    ? true
                    : $this->isCompleted((string) ($item->status ?? ''), (int) ($item->progress_percent ?? 0));
                $progressPercent = $isCompleted ? 100 : (int) ($item->progress_percent ?? 0);
                $pace = $isHandoverCompleted
                    ? $this->buildHandoverCompletedPace()
                    : $this->buildPaceSummary(
                        $item->start_date,
                        $item->deadline,
                        $progressPercent,
                        $item->created_at
                    );

                return [
                    'id' => (int) $item->id,
                    'task_id' => (int) $item->task_id,
                    'title' => (string) ($item->title ?? ''),
                    'status' => (string) ($item->status ?? ''),
                    'assignee_id' => $item->assignee_id ? (int) $item->assignee_id : null,
                    'assignee_name' => optional($item->assignee)->name ?: 'Chưa phân công',
                    'assignee_email' => optional($item->assignee)->email ?: '',
                    'start_date' => $item->start_date ? $item->start_date->toDateString() : null,
                    'deadline' => $item->deadline ? $item->deadline->toDateString() : null,
                    'progress_percent' => $progressPercent,
                    'pace' => $pace,
                    'is_completed' => $isCompleted,
                    'is_handover_completed' => $isHandoverCompleted,
                ];
            })->values();

            if (! empty($paceStatuses)) {
                $taskItemRows = $taskItemRows->filter(function (array $row) use ($paceStatuses) {
                    return in_array((string) ($row['pace']['status'] ?? ''), $paceStatuses, true);
                })->values();
            }
        }

        $allStaffIds = collect()
            ->merge($projectRows->pluck('owner_id')->all())
            ->merge($taskRows->pluck('assignee_id')->all())
            ->merge($taskItemRows->pluck('assignee_id')->all())
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function (int $id) {
                return $id > 0;
            })
            ->unique()
            ->values();

        if (! empty($staffIds)) {
            $allStaffIds = $allStaffIds->merge($staffIds)->unique()->values();
        }

        $staffMap = User::query()
            ->with('departmentRelation:id,name')
            ->whereIn('id', $allStaffIds->all())
            ->get(['id', 'name', 'email', 'role', 'department_id', 'avatar_url'])
            ->keyBy('id');

        $staffRows = $this->buildStaffRows($staffMap, $projectRows, $taskRows, $taskItemRows);

        $overview = [
            'projects' => $this->summarizeRows($projectRows),
            'tasks' => $this->summarizeRows($taskRows),
            'task_items' => $this->summarizeRows($taskItemRows),
        ];
        $completedArchive = [
            'projects' => (int) (($overview['projects']['pace_counts']['handover_completed'] ?? 0)),
            'tasks' => (int) (($overview['tasks']['pace_counts']['handover_completed'] ?? 0)),
            'task_items' => (int) (($overview['task_items']['pace_counts']['handover_completed'] ?? 0)),
        ];

        $projectSpotlight = $projectRows
            ->filter(function (array $row) {
                return (string) ($row['pace']['status'] ?? '') !== 'handover_completed';
            })
            ->sortBy([
                ['pace.sort_order', 'asc'],
                ['pace.lag_percent', 'desc'],
                ['progress_percent', 'asc'],
            ])
            ->values()
            ->take(40)
            ->all();

        return response()->json([
            'filters' => [
                'applied' => [
                    'staff_ids' => $staffIds,
                    'project_statuses' => $projectStatuses,
                    'pace_statuses' => $paceStatuses,
                    'search' => $search,
                    'start_date_from' => $startDateFrom ? $startDateFrom->toDateString() : null,
                    'start_date_to' => $startDateTo ? $startDateTo->toDateString() : null,
                ],
                'project_status_options' => collect(self::PROJECT_STATUS_LABELS)
                    ->map(function ($label, $value) {
                        return ['value' => $value, 'label' => $label];
                    })
                    ->values()
                    ->all(),
                'pace_status_options' => collect(self::PACE_LABELS)
                    ->map(function ($label, $value) {
                        return ['value' => $value, 'label' => $label];
                    })
                    ->values()
                    ->all(),
                'staff_options' => $this->buildStaffOptions(),
            ],
            'overview' => $overview,
            'completed_archive' => $completedArchive,
            'staff_rows' => $staffRows,
            'project_spotlight' => $projectSpotlight,
            'generated_at' => now('Asia/Ho_Chi_Minh')->toIso8601String(),
        ]);
    }

    private function buildStaffRows(Collection $staffMap, Collection $projectRows, Collection $taskRows, Collection $taskItemRows): array
    {
        $rows = [];

        $ensureRow = function (int $staffId) use (&$rows, $staffMap): void {
            if (isset($rows[$staffId])) {
                return;
            }

            $isUnassigned = $staffId <= 0;
            $user = null;
            if (! $isUnassigned) {
                /** @var User|null $user */
                $user = $staffMap->get($staffId);
            }

            $rows[$staffId] = [
                'staff' => [
                    'id' => $isUnassigned ? 0 : $staffId,
                    'name' => $isUnassigned ? 'Chưa phân công' : ($user ? (string) ($user->name ?? '') : "Nhân sự #{$staffId}"),
                    'email' => $isUnassigned ? '' : ($user ? (string) ($user->email ?? '') : ''),
                    'role' => $isUnassigned ? '' : ($user ? (string) ($user->role ?? '') : ''),
                    'department_name' => $isUnassigned ? '' : ($user ? (string) optional($user->departmentRelation)->name : ''),
                    'avatar_url' => $isUnassigned ? '' : ($user ? (string) ($user->avatar_url ?? '') : ''),
                ],
                'is_unassigned' => $isUnassigned,
                'projects' => $this->emptySummary(),
                'tasks' => $this->emptySummary(),
                'task_items' => $this->emptySummary(),
                'total_entities' => 0,
            ];
        };

        foreach ($projectRows as $row) {
            $staffId = (int) ($row['owner_id'] ?? 0);
            $ensureRow($staffId);
            $this->applyRowToSummary($rows[$staffId]['projects'], $row);
        }

        foreach ($taskRows as $row) {
            $staffId = (int) ($row['assignee_id'] ?? 0);
            $ensureRow($staffId);
            $this->applyRowToSummary($rows[$staffId]['tasks'], $row);
        }

        foreach ($taskItemRows as $row) {
            $staffId = (int) ($row['assignee_id'] ?? 0);
            $ensureRow($staffId);
            $this->applyRowToSummary($rows[$staffId]['task_items'], $row);
        }

        foreach ($rows as &$row) {
            $row['projects'] = $this->finalizeSummary($row['projects']);
            $row['tasks'] = $this->finalizeSummary($row['tasks']);
            $row['task_items'] = $this->finalizeSummary($row['task_items']);
            $row['total_entities'] = (int) (
                ($row['projects']['total'] ?? 0)
                + ($row['tasks']['total'] ?? 0)
                + ($row['task_items']['total'] ?? 0)
            );
        }
        unset($row);

        return collect($rows)
            ->values()
            ->sortBy([
                ['is_unassigned', 'asc'],
                ['total_entities', 'desc'],
                ['staff.name', 'asc'],
            ])
            ->values()
            ->all();
    }

    private function summarizeRows(Collection $rows): array
    {
        $summary = $this->emptySummary();
        foreach ($rows as $row) {
            $this->applyRowToSummary($summary, $row);
        }

        return $this->finalizeSummary($summary);
    }

    private function emptySummary(): array
    {
        return [
            'total' => 0,
            'completed' => 0,
            'pace_counts' => [
                'behind' => 0,
                'on_track' => 0,
                'ahead' => 0,
                'handover_completed' => 0,
            ],
            'actual_progress_sum' => 0.0,
            'expected_progress_sum' => 0.0,
            'lag_sum' => 0.0,
        ];
    }

    private function applyRowToSummary(array &$summary, array $row): void
    {
        $summary['total'] = (int) $summary['total'] + 1;
        if (! empty($row['is_completed'])) {
            $summary['completed'] = (int) $summary['completed'] + 1;
        }

        $paceStatus = (string) ($row['pace']['status'] ?? 'on_track');
        if (! isset($summary['pace_counts'][$paceStatus])) {
            $summary['pace_counts'][$paceStatus] = 0;
        }
        $summary['pace_counts'][$paceStatus] = (int) $summary['pace_counts'][$paceStatus] + 1;

        $summary['actual_progress_sum'] = (float) $summary['actual_progress_sum'] + (float) ($row['pace']['actual_progress'] ?? 0);
        $summary['expected_progress_sum'] = (float) $summary['expected_progress_sum'] + (float) ($row['pace']['expected_progress'] ?? 0);
        $summary['lag_sum'] = (float) $summary['lag_sum'] + (float) ($row['pace']['lag_percent'] ?? 0);
    }

    private function finalizeSummary(array $summary): array
    {
        $total = max(0, (int) ($summary['total'] ?? 0));
        $completed = max(0, (int) ($summary['completed'] ?? 0));
        $actualSum = (float) ($summary['actual_progress_sum'] ?? 0);
        $expectedSum = (float) ($summary['expected_progress_sum'] ?? 0);
        $lagSum = (float) ($summary['lag_sum'] ?? 0);

        $paceCounts = $summary['pace_counts'] ?? [];
        $behind = (int) ($paceCounts['behind'] ?? 0);
        $onTrack = (int) ($paceCounts['on_track'] ?? 0);
        $ahead = (int) ($paceCounts['ahead'] ?? 0);
        $handoverCompleted = (int) ($paceCounts['handover_completed'] ?? 0);

        return [
            'total' => $total,
            'completed' => $completed,
            'completion_rate' => $total > 0 ? round(($completed / $total) * 100, 1) : 0,
            'pace_counts' => [
                'behind' => $behind,
                'on_track' => $onTrack,
                'ahead' => $ahead,
                'handover_completed' => $handoverCompleted,
            ],
            'pace_rates' => [
                'behind' => $total > 0 ? round(($behind / $total) * 100, 1) : 0,
                'on_track' => $total > 0 ? round(($onTrack / $total) * 100, 1) : 0,
                'ahead' => $total > 0 ? round(($ahead / $total) * 100, 1) : 0,
                'handover_completed' => $total > 0 ? round(($handoverCompleted / $total) * 100, 1) : 0,
            ],
            'avg_actual_progress' => $total > 0 ? round($actualSum / $total, 1) : 0,
            'avg_expected_progress' => $total > 0 ? round($expectedSum / $total, 1) : 0,
            'avg_lag_percent' => $total > 0 ? round($lagSum / $total, 1) : 0,
        ];
    }

    private function isHandoverCompletedProject(Project $project): bool
    {
        $handoverStatus = mb_strtolower(trim((string) ($project->handover_status ?? '')));
        return $handoverStatus === 'approved';
    }

    private function buildHandoverCompletedPace(): array
    {
        return [
            'status' => 'handover_completed',
            'label' => self::PACE_LABELS['handover_completed'],
            'actual_progress' => 100.0,
            'expected_progress' => 100.0,
            'lag_percent' => 0.0,
            'ahead_percent' => 0.0,
            'delta_percent' => 0.0,
            'is_late' => false,
            'sort_order' => 3,
        ];
    }

    private function parseDateRange($fromInput, $toInput): array
    {
        $from = $this->parseDateToDay($fromInput);
        $to = $this->parseDateToDay($toInput);

        if ($from && $to && $from->greaterThan($to)) {
            return [$to, $from];
        }

        return [$from, $to];
    }

    private function applyDateRangeFilter($query, string $column, ?Carbon $from, ?Carbon $to): void
    {
        if ($from) {
            $query->whereDate($column, '>=', $from->toDateString());
        }
        if ($to) {
            $query->whereDate($column, '<=', $to->toDateString());
        }
    }

    private function applyTaskSearchFilter($query, string $search): void
    {
        if ($search === '') {
            return;
        }

        $query->where(function ($builder) use ($search) {
            $builder->where('title', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%")
                ->orWhereHas('project', function ($projectQuery) use ($search) {
                    $projectQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('code', 'like', "%{$search}%")
                        ->orWhere('status', 'like', "%{$search}%");
                })
                ->orWhereHas('assignee', function ($assigneeQuery) use ($search) {
                    $assigneeQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
        });
    }

    private function applyTaskItemSearchFilter($query, string $search): void
    {
        if ($search === '') {
            return;
        }

        $query->where(function ($builder) use ($search) {
            $builder->where('title', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%")
                ->orWhereHas('task', function ($taskQuery) use ($search) {
                    $taskQuery->where('title', 'like', "%{$search}%")
                        ->orWhereHas('project', function ($projectQuery) use ($search) {
                            $projectQuery->where('name', 'like', "%{$search}%")
                                ->orWhere('code', 'like', "%{$search}%")
                                ->orWhere('status', 'like', "%{$search}%");
                        });
                })
                ->orWhereHas('assignee', function ($assigneeQuery) use ($search) {
                    $assigneeQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
        });
    }

    private function buildPaceSummary($startValue, $deadlineValue, int $actualProgress, $createdAt = null): array
    {
        $timezone = 'Asia/Ho_Chi_Minh';
        $now = Carbon::now($timezone);
        $actual = max(0, min(100, $actualProgress));

        $start = $this->parseDateToDay($startValue)
            ?: ($this->parseDateToDay($createdAt) ?: $now->copy()->startOfDay());
        $startAt = $start->copy()->startOfDay();
        $deadlineDay = $this->parseDateToDay($deadlineValue);

        // Nếu thiếu deadline thì không đủ dữ liệu để so với kỳ vọng theo timeline.
        // Trường hợp này giữ expected = actual để trạng thái trung tính, tránh gắn nhầm "chậm".
        if (! $deadlineDay) {
            return [
                'status' => 'on_track',
                'label' => self::PACE_LABELS['on_track'],
                'actual_progress' => (float) $actual,
                'expected_progress' => (float) $actual,
                'lag_percent' => 0.0,
                'ahead_percent' => 0.0,
                'delta_percent' => 0.0,
                'is_late' => false,
                'sort_order' => 1,
            ];
        }

        $deadlineAt = $deadlineDay->copy()->endOfDay();
        if ($deadlineAt->lessThanOrEqualTo($startAt)) {
            $deadlineAt = $startAt->copy()->endOfDay();
        }

        $totalSeconds = max(1, $startAt->diffInSeconds($deadlineAt));
        $expected = 0.0;
        if ($now->lessThanOrEqualTo($startAt)) {
            $expected = 0.0;
        } elseif ($now->greaterThanOrEqualTo($deadlineAt)) {
            $expected = 100.0;
        } else {
            $elapsedSeconds = max(0, $startAt->diffInSeconds($now, false));
            $expected = ($elapsedSeconds / $totalSeconds) * 100;
        }
        $expected = max(0.0, min(100.0, round($expected, 1)));

        $delta = round((float) $actual - $expected, 1);
        $lag = max(0.0, round($expected - (float) $actual, 1));
        $ahead = max(0.0, round((float) $actual - $expected, 1));

        $pace = 'on_track';
        $deadlinePassed = $now->greaterThan($deadlineAt);
        if ($deadlinePassed && $actual < 100) {
            $pace = 'behind';
        } elseif ($delta < -self::PACE_TOLERANCE_PERCENT) {
            $pace = 'behind';
        } elseif ($delta > self::PACE_TOLERANCE_PERCENT) {
            $pace = 'ahead';
        }

        return [
            'status' => $pace,
            'label' => self::PACE_LABELS[$pace] ?? self::PACE_LABELS['on_track'],
            'actual_progress' => (float) $actual,
            'expected_progress' => $expected,
            'lag_percent' => $lag,
            'ahead_percent' => $ahead,
            'delta_percent' => $delta,
            'is_late' => $pace === 'behind',
            'sort_order' => $pace === 'behind' ? 0 : ($pace === 'on_track' ? 1 : 2),
        ];
    }

    private function parseDateToDay($value): ?Carbon
    {
        if ($value instanceof Carbon) {
            return $value->copy()->setTimezone('Asia/Ho_Chi_Minh')->startOfDay();
        }

        if ($value instanceof \DateTimeInterface) {
            return Carbon::instance($value)->setTimezone('Asia/Ho_Chi_Minh')->startOfDay();
        }

        if (is_string($value) && trim($value) !== '') {
            try {
                return Carbon::parse($value, 'Asia/Ho_Chi_Minh')->startOfDay();
            } catch (\Throwable $e) {
                return null;
            }
        }

        return null;
    }

    private function isCompleted(string $status, int $progressPercent): bool
    {
        if ($progressPercent >= 100) {
            return true;
        }

        $normalized = mb_strtolower(trim($status));
        $normalized = str_replace([' ', '-'], '_', $normalized);

        return in_array($normalized, [
            'done',
            'xong',
            'hoan_thanh',
            'hoàn_thành',
            'da_hoan_thanh',
            'đã_hoàn_thành',
            'completed',
            'complete',
            'success',
        ], true);
    }

    private function parseIntArray($input): array
    {
        $values = collect(is_array($input) ? $input : explode(',', (string) $input))
            ->map(function ($value) {
                return (int) $value;
            })
            ->filter(function (int $value) {
                return $value > 0;
            })
            ->unique()
            ->values()
            ->all();

        return $values;
    }

    private function parseStringArray($input, array $allowedValues): array
    {
        $allowedLookup = collect($allowedValues)
            ->mapWithKeys(function ($value) {
                return [(string) $value => true];
            })
            ->all();

        return collect(is_array($input) ? $input : explode(',', (string) $input))
            ->map(function ($value) {
                return trim((string) $value);
            })
            ->filter(function (string $value) use ($allowedLookup) {
                return $value !== '' && isset($allowedLookup[$value]);
            })
            ->unique()
            ->values()
            ->all();
    }

    private function buildStaffOptions(): array
    {
        return User::query()
            ->with('departmentRelation:id,name')
            ->select(['id', 'name', 'email', 'role', 'department_id', 'avatar_url'])
            ->where('is_active', true)
            ->whereIn('role', ['admin', 'administrator', 'quan_ly', 'nhan_vien'])
            ->orderBy('name')
            ->get()
            ->map(function (User $user) {
                return [
                    'id' => (int) $user->id,
                    'label' => (string) ($user->name ?? "Nhân sự #{$user->id}"),
                    'meta' => (string) ($user->email ?? ''),
                    'role' => (string) ($user->role ?? ''),
                    'department_name' => (string) optional($user->departmentRelation)->name,
                    'avatar_url' => (string) ($user->avatar_url ?? ''),
                ];
            })
            ->values()
            ->all();
    }
}
