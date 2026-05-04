<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\ProjectScope;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\TaskItemLinearPaceService;
use App\Services\TaskProgressService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Builder;

class TaskItemController extends Controller
{
    public function globalIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = TaskItem::query()
            ->with([
                'task:id,project_id,department_id,title,assignee_id,created_by,assigned_by',
                'task.project:id,name,code,website_url',
                'assignee:id,name,email,avatar_url',
                'reviewer:id,name,email,avatar_url',
            ]);

        if ($request->filled('task_id') || $request->filled('project_id')) {
            ProjectScope::applyTaskItemScope($query, $user);
        } else {
            ProjectScope::applyTaskItemListScope($query, $user);
        }

        if ($request->filled('project_id')) {
            $projectId = (int) $request->input('project_id');
            $query->whereHas('task', function ($builder) use ($projectId) {
                $builder->where('project_id', $projectId);
            });
        }

        if ($request->filled('task_id')) {
            $query->where('task_id', (int) $request->input('task_id'));
        }

        $assigneeFilterIds = $this->resolveAssigneeFilterIds($request);
        if (! empty($assigneeFilterIds)) {
            $query->whereIn('assignee_id', $assigneeFilterIds);
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('task', function ($taskQuery) use ($search) {
                        $taskQuery->where('title', 'like', "%{$search}%")
                            ->orWhereHas('project', function ($projectQuery) use ($search) {
                                $projectQuery->where('name', 'like', "%{$search}%")
                                    ->orWhere('code', 'like', "%{$search}%");
                            });
                    })
                    ->orWhereHas('assignee', function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('reviewer', function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('start_from')) {
            $query->whereDate('start_date', '>=', $request->input('start_from'));
        }
        if ($request->filled('start_to')) {
            $query->whereDate('start_date', '<=', $request->input('start_to'));
        }
        if ($request->filled('deadline_from')) {
            $query->whereDate('deadline', '>=', $request->input('deadline_from'));
        }
        if ($request->filled('deadline_to')) {
            $query->whereDate('deadline', '<=', $request->input('deadline_to'));
        }

        $pace = (string) $request->input('pace', '');
        if (in_array($pace, ['behind', 'on_track', 'ahead'], true)) {
            $service = app(TaskItemLinearPaceService::class);
            $candidateIds = (clone $query)->orderBy('id')->pluck('id');
            if ($candidateIds->isEmpty()) {
                $query->whereRaw('1 = 0');
            } else {
                $matched = [];
                foreach ($candidateIds->chunk(400) as $chunk) {
                    $rows = TaskItem::query()
                        ->whereIn('id', $chunk)
                        ->get(['id', 'start_date', 'deadline', 'created_at', 'progress_percent']);
                    foreach ($rows as $row) {
                        if ($service->matchesPace($row, $pace)) {
                            $matched[] = $row->id;
                        }
                    }
                }
                if ($matched === []) {
                    $query->whereRaw('1 = 0');
                } else {
                    $query->whereIn('id', $matched);
                }
            }
        }

        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 30))
        );
    }

    public function show(int $id, Request $request): JsonResponse
    {
        $item = TaskItem::with([
            'task:id,project_id,department_id,title,assignee_id,created_by,assigned_by,status,progress_percent,weight_percent,deadline',
            'task.project:id,name,code,owner_id,website_url',
            'task.project.owner:id,name,email',
            'task.department:id,name,manager_id',
            'assignee:id,name,email,avatar_url',
            'reviewer:id,name,email,avatar_url',
        ])->find($id);

        if (! $item) {
            return response()->json(['message' => 'Không tìm thấy đầu việc.'], 404);
        }

        $task = $item->task;
        if ($task && ! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem đầu việc.'], 403);
        }

        return response()->json($item);
    }

    public function index(Task $task, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem đầu việc.'], 403);
        }

        return response()->json(
            $task->items()
                ->with(['assignee', 'reviewer'])
                ->orderByDesc('id')
                ->paginate((int) $request->input('per_page', 30))
        );
    }

    public function store(Task $task, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền tạo đầu việc.'], 403);
        }
        if (! ProjectScope::canManageTaskItems($request->user(), $task)) {
            return response()->json([
                'message' => 'Chỉ admin, phụ trách dự án hoặc phụ trách công việc mới được tạo đầu việc.',
            ], 403);
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'priority' => ['nullable', 'string', 'max:20'],
            'status' => ['nullable', 'string', 'in:todo,doing,done,blocked'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'weight_percent' => ['nullable', 'integer', 'min:1', 'max:100'],
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $currentTotalWeight = $task->items()->sum('weight_percent');
        $newWeight = isset($validated['weight_percent']) ? (int) $validated['weight_percent'] : 100;
        if ($currentTotalWeight + $newWeight > 100) {
            return response()->json(['message' => 'Tổng tỷ trọng của các đầu việc không được vượt quá 100%.'], 422);
        }

        $this->assertAssignableAssignee($validated['assignee_id'] ?? null);
        $this->applyDefaultTaskItemDates($validated, $task);

        $this->assertTaskItemDatesWithinTask(
            $task,
            $validated['start_date'] ?? null,
            $validated['deadline'] ?? null
        );

        try {
            $item = $task->items()->create([
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'priority' => $validated['priority'] ?? 'medium',
                'status' => $validated['status'] ?? 'todo',
                'progress_percent' => $validated['progress_percent'] ?? 0,
                'weight_percent' => isset($validated['weight_percent']) ? (int) $validated['weight_percent'] : 100,
                'start_date' => $validated['start_date'] ?? null,
                'deadline' => $validated['deadline'] ?? null,
                'assignee_id' => $validated['assignee_id'] ?? null,
                'created_by' => $request->user()->id,
                'assigned_by' => $request->user()->id,
                'reviewer_id' => null,
            ]);
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'message' => 'Không tạo được đầu việc. Vui lòng kiểm tra cấu hình hệ thống.',
            ], 500);
        }

        $warnings = [];

        try {
            TaskProgressService::recalc($task);
        } catch (\Throwable $e) {
            report($e);
            $warnings[] = 'progress';
        }

        if (! empty($item->assignee_id)) {
            if (! $this->notifyTaskItemAssignee($task, $item, true)) {
                $warnings[] = 'push';
            }
        }

        $payload = $item->load(['assignee', 'reviewer'])->toArray();
        if (! empty($warnings)) {
            $payload['warnings'] = $warnings;
        }

        return response()->json($payload, 201);
    }

    public function update(Task $task, TaskItem $item, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền cập nhật đầu việc.'], 403);
        }
        if (! ProjectScope::canManageTaskItems($request->user(), $task)) {
            return response()->json([
                'message' => 'Chỉ admin, phụ trách dự án hoặc phụ trách công việc mới được cập nhật đầu việc.',
            ], 403);
        }
        if ($item->task_id !== $task->id) {
            return response()->json(['message' => 'Đầu việc không thuộc công việc.'], 422);
        }

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'priority' => ['nullable', 'string', 'max:20'],
            'status' => ['nullable', 'string', 'in:todo,doing,done,blocked'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'weight_percent' => ['nullable', 'integer', 'min:1', 'max:100'],
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        if (array_key_exists('weight_percent', $validated)) {
            $currentTotalWeight = $task->items()->where('id', '!=', $item->id)->sum('weight_percent');
            $newWeight = (int) $validated['weight_percent'];
            if ($currentTotalWeight + $newWeight > 100) {
                return response()->json(['message' => 'Tổng tỷ trọng của các đầu việc không được vượt quá 100%.'], 422);
            }
        }

        if (isset($validated['assignee_id'])) {
            $this->assertAssignableAssignee($validated['assignee_id']);
        }

        $nextStart = array_key_exists('start_date', $validated) ? $validated['start_date'] : $item->start_date;
        $nextDeadline = array_key_exists('deadline', $validated) ? $validated['deadline'] : $item->deadline;
        $this->assertTaskItemDatesWithinTask($task, $nextStart, $nextDeadline);

        $oldAssigneeId = (int) ($item->assignee_id ?? 0);
        $assigneeProvided = array_key_exists('assignee_id', $validated);
        $nextAssigneeId = $assigneeProvided
            ? (int) ($validated['assignee_id'] ?? 0)
            : $oldAssigneeId;

        $updatePayload = [
            'title' => $validated['title'] ?? $item->title,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $item->description,
            'priority' => $validated['priority'] ?? $item->priority,
            'status' => $validated['status'] ?? $item->status,
            'progress_percent' => $validated['progress_percent'] ?? $item->progress_percent,
            'weight_percent' => array_key_exists('weight_percent', $validated) ? (int) $validated['weight_percent'] : $item->weight_percent,
            'start_date' => $validated['start_date'] ?? $item->start_date,
            'deadline' => $validated['deadline'] ?? $item->deadline,
            'assignee_id' => array_key_exists('assignee_id', $validated) ? $validated['assignee_id'] : $item->assignee_id,
        ];
        if ($assigneeProvided && $nextAssigneeId !== $oldAssigneeId) {
            $updatePayload['assigned_by'] = $request->user()->id;
        }

        $item->update($updatePayload);

        TaskProgressService::recalc($task);

        if ($assigneeProvided && $nextAssigneeId > 0 && $nextAssigneeId !== $oldAssigneeId) {
            $this->notifyTaskItemAssignee($task, $item, false);
        }

        return response()->json($item->fresh()->load(['assignee', 'reviewer']));
    }

    public function destroy(Task $task, TaskItem $item, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xoá đầu việc.'], 403);
        }
        if (! ProjectScope::canManageTaskItems($request->user(), $task)) {
            return response()->json([
                'message' => 'Chỉ admin, phụ trách dự án hoặc phụ trách công việc mới được xoá đầu việc.',
            ], 403);
        }
        if ($item->task_id !== $task->id) {
            return response()->json(['message' => 'Đầu việc không thuộc công việc.'], 422);
        }

        $item->delete();
        TaskProgressService::recalc($task);
        return response()->json(['message' => 'Đã xoá đầu việc.']);
    }

    /**
     * Ngày bắt đầu và hạn đầu việc không được sau mốc kết thúc ưu tiên.
     */
    private function assertTaskItemDatesWithinTask(Task $task, $startDate, $itemDeadline): void
    {
        $max = $this->taskTimelineEnd($task);
        if (! $max) {
            return;
        }
        $labels = [
            'Ngày bắt đầu đầu việc' => $startDate,
            'Hạn đầu việc' => $itemDeadline,
        ];
        foreach ($labels as $label => $raw) {
            if ($raw === null || $raw === '') {
                continue;
            }
            $d = Carbon::parse($raw)->startOfDay();
            if ($d->gt($max)) {
                abort(response()->json([
                    'message' => "{$label} không được sau mốc kết thúc công việc/hợp đồng/dự án ({$max->format('d/m/Y')}).",
                ], 422));
            }
        }
    }

    private function applyDefaultTaskItemDates(array &$validated, Task $task): void
    {
        if (empty($validated['start_date'])) {
            $start = $this->taskTimelineStart($task);
            if ($start) {
                $validated['start_date'] = $start->toDateString();
            }
        }

        if (empty($validated['deadline'])) {
            $end = $this->taskTimelineEnd($task);
            if ($end) {
                $validated['deadline'] = $end->toDateString();
            }
        }
    }

    private function taskTimelineStart(Task $task): ?Carbon
    {
        $projectStart = $this->projectTimelineStart($this->taskProject($task));
        if ($projectStart) {
            return $projectStart;
        }

        if ($task->start_at) {
            return Carbon::parse($task->start_at)->startOfDay();
        }

        return null;
    }

    private function taskTimelineEnd(Task $task): ?Carbon
    {
        $projectEnd = $this->projectTimelineEnd($this->taskProject($task));
        if ($projectEnd) {
            return $projectEnd;
        }

        if ($task->deadline) {
            return Carbon::parse($task->deadline)->startOfDay();
        }

        return null;
    }

    private function taskProject(Task $task): ?Project
    {
        $task->loadMissing(['project.contract', 'project.linkedContract']);

        return $task->project;
    }

    private function projectTimelineStart(?Project $project): ?Carbon
    {
        if (! $project) {
            return null;
        }

        $project->loadMissing(['contract', 'linkedContract']);
        $contract = $project->contract ?: $project->linkedContract;
        $raw = $contract?->start_date ?: $project->start_date;

        return $raw ? Carbon::parse($raw)->startOfDay() : null;
    }

    private function projectTimelineEnd(?Project $project): ?Carbon
    {
        if (! $project) {
            return null;
        }

        $project->loadMissing(['contract', 'linkedContract']);
        $contract = $project->contract ?: $project->linkedContract;
        $raw = $contract?->end_date ?: $project->deadline;

        return $raw ? Carbon::parse($raw)->startOfDay() : null;
    }

    private function assertAssignableAssignee(?int $assigneeId): void
    {
        if (! $assigneeId) {
            return;
        }
        $assignee = User::find($assigneeId);
        if (! $assignee) {
            return;
        }
        if (in_array((string) $assignee->role, ['admin', 'administrator', 'ke_toan'], true)) {
            abort(response()->json(['message' => 'Nhân sự phụ trách đầu việc không được chọn role admin/administrator/kế toán.'], 422));
        }
    }

    private function notifyTaskItemAssignee(Task $task, TaskItem $item, bool $isInitialAssignment): bool
    {
        $assigneeId = (int) ($item->assignee_id ?? 0);
        if ($assigneeId <= 0) {
            return true;
        }

        try {
            app(NotificationService::class)->notifyUsersAfterResponse(
                [$assigneeId],
                $isInitialAssignment
                    ? 'Bạn có đầu việc mới'
                    : 'Bạn được điều chuyển phụ trách đầu việc',
                'Đầu việc: '.$item->title,
                [
                    'type' => 'task_item_assigned',
                    'task_id' => (int) $task->id,
                    'task_item_id' => (int) $item->id,
                    'is_reassignment' => ! $isInitialAssignment,
                ]
            );
        } catch (\Throwable $e) {
            report($e);
            return false;
        }

        return true;
    }

    private function resolveAssigneeFilterIds(Request $request): array
    {
        $raw = $request->input('assignee_ids', []);
        if (is_string($raw)) {
            $raw = preg_split('/[\s,;|]+/', $raw) ?: [];
        }
        if (! is_array($raw)) {
            $raw = [];
        }

        if ($request->filled('assignee_id')) {
            $raw[] = $request->input('assignee_id');
        }

        return collect($raw)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();
    }

}
