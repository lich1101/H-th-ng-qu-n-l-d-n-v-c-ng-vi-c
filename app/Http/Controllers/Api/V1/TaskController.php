<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\Department;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Builder;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::query()
            ->with(['project', 'assignee', 'reviewer', 'department'])
            ->withCount(['comments', 'attachments', 'items'])
            ->withCount([
                'updates as pending_updates_count' => function ($builder) {
                    $builder->where('review_status', 'pending');
                },
            ]);

        $this->applyScope($query, $request->user());

        if ($request->filled('project_id')) {
            $query->where('project_id', (int) $request->input('project_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('department_id')) {
            $query->where('department_id', (int) $request->input('department_id'));
        }

        if ($request->filled('assignee_id')) {
            $query->where('assignee_id', (int) $request->input('assignee_id'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('project', function ($projectQuery) use ($search) {
                        $projectQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%");
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
        if (! in_array($request->user()->role, ['admin', 'quan_ly'], true)) {
            return response()->json(['message' => 'Không có quyền tạo công việc.'], 403);
        }
        $validated = $request->validate($this->rules(false));
        $project = Project::find($validated['project_id']);
        if (! $project || empty($project->contract_id)) {
            return response()->json([
                'message' => 'Dự án chưa có hợp đồng, không thể tạo công việc.',
            ], 422);
        }
        $this->applyDepartmentRules($request, $validated);
        $validated['created_by'] = $request->user()->id;
        $validated['assigned_by'] = $validated['assigned_by'] ?? $request->user()->id;

        $task = Task::create($validated);

        if ($request->user()->role === 'admin' && ! empty($task->department_id)) {
            $managerId = Department::query()
                ->where('id', $task->department_id)
                ->value('manager_id');
            if ($managerId) {
                try {
                    app(NotificationService::class)->notifyUsers(
                        [$managerId],
                        'Có công việc mới được phân công',
                        'Công việc: '.$task->title,
                        [
                            'type' => 'task_assigned',
                            'task_id' => $task->id,
                        ]
                    );
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        return response()->json(
            $task->load(['project', 'assignee', 'reviewer', 'department'])->loadCount(['comments', 'attachments']),
            201
        );
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        if (! $this->canAccess($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem công việc.'], 403);
        }
        return response()->json(
            $task->load(['project', 'assignee', 'reviewer', 'department'])->loadCount(['comments', 'attachments'])
        );
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        if (! $this->canAccess($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền cập nhật công việc.'], 403);
        }
        $validated = $request->validate($this->rules(true));
        if ($request->user()->role === 'nhan_vien') {
            $validated = array_intersect_key($validated, array_flip([
                'acknowledged_at',
            ]));
        }
        if (! empty($validated)) {
            $this->applyDepartmentRules($request, $validated, $task);
        }
        if (isset($validated['project_id'])) {
            $project = Project::find($validated['project_id']);
            if (! $project || empty($project->contract_id)) {
                return response()->json([
                    'message' => 'Dự án chưa có hợp đồng, không thể chuyển công việc.',
                ], 422);
            }
        }

        if (isset($validated['progress_percent'])) {
            $validated['progress_percent'] = max(0, min(100, (int) $validated['progress_percent']));
        }

        if (isset($validated['status']) && $validated['status'] === 'done') {
            $validated['completed_at'] = now();
        }

        $task->update($validated);

        return response()->json(
            $task->load(['project', 'assignee', 'reviewer', 'department'])->loadCount(['comments', 'attachments'])
        );
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'quan_ly'], true)) {
            return response()->json(['message' => 'Không có quyền xóa công việc.'], 403);
        }
        if (! $this->canAccess($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xóa công việc.'], 403);
        }
        $task->delete();

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
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'assigned_by' => ['nullable', 'integer', 'exists:users,id'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'reviewer_id' => ['nullable', 'integer', 'exists:users,id'],
            'require_acknowledgement' => ['nullable', 'boolean'],
            'acknowledged_at' => ['nullable', 'date'],
        ];
    }

    private function applyScope(Builder $query, User $user): void
    {
        if (in_array($user->role, ['admin'], true)) {
            return;
        }
        if ($user->role === 'ke_toan') {
            $query->whereRaw('1 = 0');
            return;
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            $query->where(function ($builder) use ($deptIds, $user) {
                $builder->whereHas('assignee', function ($assigneeQuery) use ($deptIds) {
                    $assigneeQuery->whereIn('department_id', $deptIds);
                })->orWhereIn('department_id', $deptIds)
                    ->orWhere('assigned_by', $user->id)
                    ->orWhere('created_by', $user->id);
            });
            return;
        }

        $query->where(function ($builder) use ($user) {
            $builder->where('assignee_id', $user->id)
                ->orWhereHas('items', function ($itemQuery) use ($user) {
                    $itemQuery->where('assignee_id', $user->id);
                });
        });
    }

    private function canAccess(User $user, Task $task): bool
    {
        if ($user->role === 'admin') {
            return true;
        }
        if ($user->role === 'ke_toan') {
            return false;
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            if ($task->department_id && $deptIds->contains($task->department_id)) {
                return true;
            }
            if ($task->assignee && $deptIds->contains($task->assignee->department_id)) {
                return true;
            }
            return (int) $task->created_by === (int) $user->id
                || (int) $task->assigned_by === (int) $user->id;
        }

        return $task->items()->where('assignee_id', $user->id)->exists()
            || (int) $task->assignee_id === (int) $user->id;
    }

    private function applyDepartmentRules(Request $request, array &$validated, ?Task $task = null): void
    {
        $user = $request->user();
        if (! $user) {
            return;
        }

        if (isset($validated['assignee_id'])) {
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

        if (empty($validated['reviewer_id'])) {
            $validated['reviewer_id'] = $user->id;
        }
    }
}
