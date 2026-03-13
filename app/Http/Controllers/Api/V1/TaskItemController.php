<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use App\Services\TaskProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskItemController extends Controller
{
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
            'deadline' => ['nullable', 'date'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'reviewer_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $this->assertAssigneeInDepartment($request->user(), $task, $validated['assignee_id'] ?? null);

        $item = $task->items()->create([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'priority' => $validated['priority'] ?? 'medium',
            'status' => $validated['status'] ?? 'todo',
            'progress_percent' => $validated['progress_percent'] ?? 0,
            'deadline' => $validated['deadline'] ?? null,
            'assignee_id' => $validated['assignee_id'] ?? null,
            'created_by' => $request->user()->id,
            'assigned_by' => $request->user()->id,
            'reviewer_id' => $validated['reviewer_id'] ?? $request->user()->id,
        ]);

        TaskProgressService::recalc($task);

        return response()->json($item->load(['assignee', 'reviewer']), 201);
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
}
