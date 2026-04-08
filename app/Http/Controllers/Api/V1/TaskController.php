<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\ProjectScope;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\ProjectProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Task::query()
            ->with(['project', 'project.owner', 'assignee', 'reviewer', 'department'])
            ->withCount(['comments', 'attachments', 'items'])
            ->withCount([
                'updates as pending_updates_count' => function ($builder) {
                    $builder->where('review_status', 'pending');
                },
            ]);

        if ($request->boolean('chat_scope')) {
            ProjectScope::applyTaskChatScope($query, $user);
        } elseif ($request->filled('project_id')) {
            ProjectScope::applyTaskScope($query, $user);
        } else {
            ProjectScope::applyTaskListScope($query, $user);
        }

        if ($request->filled('project_id')) {
            $query->where('project_id', (int) $request->input('project_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('department_id')) {
            $query->where('department_id', (int) $request->input('department_id'));
        }

        $assigneeFilterIds = $this->resolveAssigneeFilterIds($request);
        if (! empty($assigneeFilterIds)) {
            $query->whereIn('assignee_id', $assigneeFilterIds);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('project', function ($projectQuery) use ($search) {
                        $projectQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%");
                    })
                    ->orWhereHas('assignee', function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('reviewer', function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('department', function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('start_from')) {
            $query->whereDate('start_at', '>=', $request->input('start_from'));
        }
        if ($request->filled('start_to')) {
            $query->whereDate('start_at', '<=', $request->input('start_to'));
        }
        if ($request->filled('deadline_from')) {
            $query->whereDate('deadline', '>=', $request->input('deadline_from'));
        }
        if ($request->filled('deadline_to')) {
            $query->whereDate('deadline', '<=', $request->input('deadline_to'));
        }

        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 15))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules(false));
        $project = Project::find($validated['project_id']);
        if (! $project) {
            return response()->json([
                'message' => 'Dự án không tồn tại, không thể tạo công việc.',
            ], 422);
        }
        if (! ProjectScope::canManageProjectTasks($request->user(), $project)) {
            return response()->json([
                'message' => 'Chỉ admin hoặc nhân sự phụ trách dự án mới được tạo công việc.',
            ], 403);
        }
        $this->applyDepartmentRules($request, $validated);
        $validated['created_by'] = $request->user()->id;
        $validated['assigned_by'] = $validated['assigned_by'] ?? $request->user()->id;
        $this->applyOneWayAssignment($validated);
        
        $currentWeight = Task::where('project_id', $validated['project_id'])->sum('weight_percent');
        $newWeight = isset($validated['weight_percent']) ? max(1, min(100, (int) $validated['weight_percent'])) : 100;

        if ($currentWeight + $newWeight > 100) {
            return response()->json(['message' => 'Tổng tỷ trọng các công việc trong dự án không được vượt quá 100%.'], 422);
        }
        $validated['weight_percent'] = $newWeight;

        $task = Task::create($validated);

        if ($task->project) {
            try {
                ProjectProgressService::recalc($task->project);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        $this->notifyTaskAssignee($task, true);

        return response()->json(
            $task->load(['project', 'project.owner', 'assignee', 'reviewer', 'department'])->loadCount(['comments', 'attachments']),
            201
        );
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem công việc.'], 403);
        }
        return response()->json(
            $task->load(['project', 'project.owner', 'assignee', 'reviewer', 'department'])->loadCount(['comments', 'attachments'])
        );
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền cập nhật công việc.'], 403);
        }
        $validated = $request->validate($this->rules(true));
        $canManageTask = $task->project
            ? ProjectScope::canManageProjectTasks($request->user(), $task->project)
            : false;
        if ($request->user()->role === 'nhan_vien' && ! $canManageTask) {
            $validated = array_intersect_key($validated, array_flip([
                'acknowledged_at',
            ]));
        }
        if (! empty($validated)) {
            $this->applyDepartmentRules($request, $validated, $task);
        }
        if (isset($validated['project_id'])) {
            $project = Project::find($validated['project_id']);
            if (! $project) {
                return response()->json([
                    'message' => 'Dự án không tồn tại, không thể chuyển công việc.',
                ], 422);
            }
        }

        if (isset($validated['weight_percent'])) {
            $projectId = $validated['project_id'] ?? $task->project_id;
            $currentWeight = Task::where('project_id', $projectId)
                ->where('id', '!=', $task->id)
                ->sum('weight_percent');
                
            $newWeight = max(1, min(100, (int) $validated['weight_percent']));
            if ($currentWeight + $newWeight > 100) {
                return response()->json(['message' => 'Tổng tỷ trọng các công việc trong dự án không được vượt quá 100%.'], 422);
            }
            $validated['weight_percent'] = $newWeight;
        }

        if (isset($validated['status']) && $validated['status'] === 'done') {
            $validated['completed_at'] = now();
        }

        $oldProject = $task->project;
        $oldAssigneeId = (int) ($task->assignee_id ?? 0);
        $assigneeProvided = array_key_exists('assignee_id', $validated);
        if ($assigneeProvided && (int) ($validated['assignee_id'] ?? 0) !== $oldAssigneeId) {
            $validated['assigned_by'] = $request->user()->id;
        }
        $this->applyOneWayAssignment($validated, $task);
        $task->update($validated);

        if ($oldProject) {
            try {
                ProjectProgressService::recalc($oldProject);
            } catch (\Throwable $e) {
                report($e);
            }
        }
        if ($task->project && (! $oldProject || (int) $oldProject->id !== (int) $task->project->id)) {
            try {
                ProjectProgressService::recalc($task->project);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        $newAssigneeId = (int) ($task->assignee_id ?? 0);
        if ($newAssigneeId > 0 && $newAssigneeId !== $oldAssigneeId) {
            $this->notifyTaskAssignee($task, false);
        }

        return response()->json(
            $task->load(['project', 'project.owner', 'assignee', 'reviewer', 'department'])->loadCount(['comments', 'attachments'])
        );
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        if (! $task->project || ! ProjectScope::canManageProjectTasks($request->user(), $task->project)) {
            return response()->json(['message' => 'Không có quyền xóa công việc.'], 403);
        }
        if (! ProjectScope::canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xóa công việc.'], 403);
        }
        $project = $task->project;
        $task->delete();
        if ($project) {
            try {
                ProjectProgressService::recalc($project);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return response()->json([
            'message' => 'Task deleted.',
        ]);
    }

    private function rules(bool $isUpdate = false): array
    {
        return [
            'project_id' => [$isUpdate ? 'sometimes' : 'required', 'integer', 'exists:projects,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'title' => [$isUpdate ? 'sometimes' : 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'priority' => [$isUpdate ? 'sometimes' : 'required', 'string', 'max:20'],
            'status' => [$isUpdate ? 'sometimes' : 'required', 'string', 'in:todo,doing,done,blocked'],
            'start_at' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'completed_at' => ['nullable', 'date'],
            'weight_percent' => ['nullable', 'integer', 'min:1', 'max:100'],
            'assigned_by' => ['nullable', 'integer', 'exists:users,id'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'reviewer_id' => ['nullable', 'integer', 'exists:users,id'],
            'require_acknowledgement' => ['nullable', 'boolean'],
            'acknowledged_at' => ['nullable', 'date'],
        ];
    }

    private function applyDepartmentRules(Request $request, array &$validated, ?Task $task = null): void
    {
        $user = $request->user();
        if (! $user) {
            return;
        }

        if (isset($validated['assignee_id'])) {
            $this->assertAssignableStaffRole($validated['assignee_id'], 'Nhân sự phụ trách công việc');
            $assignee = User::find($validated['assignee_id']);
            if ($assignee && empty($validated['department_id'])) {
                $validated['department_id'] = $assignee->department_id;
            }
        }

        if ($user->role !== 'quan_ly') {
            return;
        }

        $deptIds = $user->managedDepartments()->pluck('id');
        $departmentId = $validated['department_id'] ?? ($task ? $task->department_id : null);
        if ($departmentId && ! $deptIds->contains($departmentId)) {
            abort(response()->json(['message' => 'Bạn không có quyền giao việc cho phòng ban này.'], 403));
        }

        if (isset($validated['assignee_id'])) {
            $assignee = User::find($validated['assignee_id']);
            if ($assignee && $assignee->department_id && ! $deptIds->contains($assignee->department_id)) {
                abort(response()->json(['message' => 'Nhân sự không thuộc phòng ban bạn quản lý.'], 403));
            }
        }

    }

    private function assertAssignableStaffRole($assigneeId, string $label): void
    {
        $assigneeId = (int) ($assigneeId ?? 0);
        if ($assigneeId <= 0) {
            return;
        }

        $assignee = User::query()->select(['id', 'role'])->find($assigneeId);
        if (! $assignee) {
            return;
        }

        if (in_array((string) $assignee->role, ['admin', 'administrator', 'ke_toan'], true)) {
            abort(response()->json([
                'message' => "{$label} không được chọn role admin/administrator/kế toán.",
            ], 422));
        }
    }

    private function applyOneWayAssignment(array &$validated, ?Task $task = null): void
    {
        $assigneeProvided = array_key_exists('assignee_id', $validated);

        if (! $assigneeProvided) {
            $validated['require_acknowledgement'] = false;
            if (! $task) {
                $validated['acknowledged_at'] = ! empty($validated['assignee_id']) ? now() : null;
                return;
            }
            $currentAssigneeId = (int) ($task->assignee_id ?? 0);
            if ($currentAssigneeId <= 0) {
                $validated['acknowledged_at'] = null;
            } elseif (! empty($task->acknowledged_at)) {
                $validated['acknowledged_at'] = $task->acknowledged_at;
            } else {
                $validated['acknowledged_at'] = now();
            }
            return;
        }

        $assigneeId = (int) ($validated['assignee_id'] ?? 0);
        $currentAssigneeId = $task ? (int) ($task->assignee_id ?? 0) : 0;

        if ($task && $assigneeId === $currentAssigneeId) {
            $validated['require_acknowledgement'] = false;
            if ($assigneeId <= 0) {
                $validated['acknowledged_at'] = null;
            } elseif (! empty($task->acknowledged_at)) {
                $validated['acknowledged_at'] = $task->acknowledged_at;
            } else {
                $validated['acknowledged_at'] = now();
            }
            return;
        }

        $validated['require_acknowledgement'] = false;
        $validated['acknowledged_at'] = $assigneeId > 0 ? now() : null;
    }

    private function notifyTaskAssignee(Task $task, bool $isInitialAssignment): void
    {
        $assigneeId = (int) ($task->assignee_id ?? 0);
        if ($assigneeId <= 0) {
            return;
        }

        try {
            app(NotificationService::class)->notifyUsersAfterResponse(
                [$assigneeId],
                $isInitialAssignment
                    ? 'Có công việc mới được phân công'
                    : 'Bạn được điều chuyển phụ trách công việc',
                'Công việc: '.$task->title,
                [
                    'type' => 'task_assigned',
                    'task_id' => (int) $task->id,
                    'is_reassignment' => ! $isInitialAssignment,
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
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
