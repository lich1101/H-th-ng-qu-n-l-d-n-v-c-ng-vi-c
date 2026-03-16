<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\TaskProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Builder;

class TaskItemController extends Controller
{
    public function globalIndex(Request $request): JsonResponse
    {
        $query = TaskItem::query()
            ->with([
                'task:id,project_id,department_id,title,assignee_id,created_by,assigned_by',
                'task.project:id,name,code',
                'assignee:id,name,email,avatar_url',
                'reviewer:id,name,email,avatar_url',
            ]);

        $this->applyItemScope($query, $request->user());

        if ($request->filled('project_id')) {
            $projectId = (int) $request->input('project_id');
            $query->whereHas('task', function ($builder) use ($projectId) {
                $builder->where('project_id', $projectId);
            });
        }

        if ($request->filled('task_id')) {
            $query->where('task_id', (int) $request->input('task_id'));
        }

        if ($request->filled('assignee_id')) {
            $query->where('assignee_id', (int) $request->input('assignee_id'));
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
                        $taskQuery->where('title', 'like', "%{$search}%");
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

        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 30))
        );
    }

    public function index(Task $task, Request $request): JsonResponse
    {
        if (! $this->canAccessTask($request->user(), $task)) {
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
        if (! in_array($request->user()->role, ['admin', 'quan_ly'], true)) {
            return response()->json(['message' => 'Không có quyền tạo đầu việc.'], 403);
        }
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền tạo đầu việc.'], 403);
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'priority' => ['nullable', 'string', 'max:20'],
            'status' => ['nullable', 'string', 'in:todo,doing,done,blocked'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'reviewer_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $this->assertAssigneeInDepartment($request->user(), $task, $validated['assignee_id'] ?? null);

        try {
            $item = $task->items()->create([
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'priority' => $validated['priority'] ?? 'medium',
                'status' => $validated['status'] ?? 'todo',
                'progress_percent' => $validated['progress_percent'] ?? 0,
                'start_date' => $validated['start_date'] ?? null,
                'deadline' => $validated['deadline'] ?? null,
                'assignee_id' => $validated['assignee_id'] ?? null,
                'created_by' => $request->user()->id,
                'assigned_by' => $request->user()->id,
                'reviewer_id' => $validated['reviewer_id'] ?? $request->user()->id,
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
            try {
                app(NotificationService::class)->notifyUsersAfterResponse(
                    [$item->assignee_id],
                    'Bạn có đầu việc mới',
                    'Đầu việc: '.$item->title,
                    [
                        'type' => 'task_item_assigned',
                        'task_id' => $task->id,
                        'task_item_id' => $item->id,
                    ]
                );
            } catch (\Throwable $e) {
                report($e);
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
        if (! in_array($request->user()->role, ['admin', 'quan_ly'], true)) {
            return response()->json(['message' => 'Không có quyền cập nhật đầu việc.'], 403);
        }
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền cập nhật đầu việc.'], 403);
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
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'reviewer_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        if (isset($validated['assignee_id'])) {
            $this->assertAssigneeInDepartment($request->user(), $task, $validated['assignee_id']);
        }

        $item->update([
            'title' => $validated['title'] ?? $item->title,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $item->description,
            'priority' => $validated['priority'] ?? $item->priority,
            'status' => $validated['status'] ?? $item->status,
            'progress_percent' => $validated['progress_percent'] ?? $item->progress_percent,
            'start_date' => $validated['start_date'] ?? $item->start_date,
            'deadline' => $validated['deadline'] ?? $item->deadline,
            'assignee_id' => array_key_exists('assignee_id', $validated) ? $validated['assignee_id'] : $item->assignee_id,
            'reviewer_id' => array_key_exists('reviewer_id', $validated) ? $validated['reviewer_id'] : $item->reviewer_id,
        ]);

        TaskProgressService::recalc($task);

        return response()->json($item->fresh()->load(['assignee', 'reviewer']));
    }

    public function destroy(Task $task, TaskItem $item, Request $request): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'quan_ly'], true)) {
            return response()->json(['message' => 'Không có quyền xoá đầu việc.'], 403);
        }
        if (! $this->canAccessTask($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xoá đầu việc.'], 403);
        }
        if ($item->task_id !== $task->id) {
            return response()->json(['message' => 'Đầu việc không thuộc công việc.'], 422);
        }

        $item->delete();
        TaskProgressService::recalc($task);
        return response()->json(['message' => 'Đã xoá đầu việc.']);
    }

    private function canAccessTask(?User $user, Task $task): bool
    {
        if (! $user) {
            return false;
        }
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

    private function assertAssigneeInDepartment(User $user, Task $task, ?int $assigneeId): void
    {
        if (! $assigneeId) {
            return;
        }
        $assignee = User::find($assigneeId);
        if (! $assignee) {
            return;
        }
        if ($task->department_id && $assignee->department_id
            && (int) $assignee->department_id !== (int) $task->department_id) {
            abort(response()->json(['message' => 'Nhân sự không thuộc phòng ban của công việc.'], 422));
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            if ($assignee->department_id && ! $deptIds->contains($assignee->department_id)) {
                abort(response()->json(['message' => 'Nhân sự không thuộc phòng ban bạn quản lý.'], 403));
            }
        }
    }

    private function applyItemScope(Builder $query, ?User $user): void
    {
        if (! $user) {
            $query->whereRaw('1 = 0');
            return;
        }

        if ($user->role === 'admin') {
            return;
        }

        if ($user->role === 'ke_toan') {
            $query->whereRaw('1 = 0');
            return;
        }

        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            $query->where(function ($builder) use ($deptIds, $user) {
                $builder->whereHas('task', function ($taskQuery) use ($deptIds, $user) {
                    $taskQuery->whereIn('department_id', $deptIds)
                        ->orWhereHas('assignee', function ($assigneeQuery) use ($deptIds) {
                            $assigneeQuery->whereIn('department_id', $deptIds);
                        })
                        ->orWhere('created_by', $user->id)
                        ->orWhere('assigned_by', $user->id);
                });
            });
            return;
        }

        $query->where(function ($builder) use ($user) {
            $builder->where('assignee_id', $user->id)
                ->orWhereHas('task', function ($taskQuery) use ($user) {
                    $taskQuery->where('assignee_id', $user->id);
                });
        });
    }
}
