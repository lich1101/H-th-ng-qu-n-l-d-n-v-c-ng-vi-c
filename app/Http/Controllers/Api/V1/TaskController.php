<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Builder;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::query()
            ->with(['project', 'assignee', 'reviewer'])
            ->withCount(['comments', 'attachments']);

        $this->applyScope($query, $request->user());

        if ($request->filled('project_id')) {
            $query->where('project_id', (int) $request->input('project_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('assignee_id')) {
            $query->where('assignee_id', (int) $request->input('assignee_id'));
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
        $validated = $request->validate($this->rules());
        $project = Project::find($validated['project_id']);
        if (! $project || empty($project->contract_id)) {
            return response()->json([
                'message' => 'Dự án chưa có hợp đồng, không thể tạo công việc.',
            ], 422);
        }
        $validated['created_by'] = $request->user()->id;
        $validated['assigned_by'] = $validated['assigned_by'] ?? $request->user()->id;

        $task = Task::create($validated);

        return response()->json(
            $task->load(['project', 'assignee', 'reviewer'])->loadCount(['comments', 'attachments']),
            201
        );
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        if (! $this->canAccess($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền xem công việc.'], 403);
        }
        return response()->json(
            $task->load(['project', 'assignee', 'reviewer'])->loadCount(['comments', 'attachments'])
        );
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        if (! $this->canAccess($request->user(), $task)) {
            return response()->json(['message' => 'Không có quyền cập nhật công việc.'], 403);
        }
        $validated = $request->validate($this->rules());
        if ($request->user()->role === 'nhan_vien') {
            $validated = array_intersect_key($validated, array_flip([
                'status',
                'progress_percent',
                'acknowledged_at',
            ]));
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
            $task->load(['project', 'assignee', 'reviewer'])->loadCount(['comments', 'attachments'])
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

    private function rules(): array
    {
        return [
            'project_id' => ['required', 'integer', 'exists:projects,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'priority' => ['required', 'string', 'max:20'],
            'status' => ['required', 'string', 'in:todo,doing,done,blocked'],
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
                })->orWhere('assigned_by', $user->id)
                    ->orWhere('created_by', $user->id);
            });
            return;
        }

        $query->where('assignee_id', $user->id);
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
            if ($task->assignee && $deptIds->contains($task->assignee->department_id)) {
                return true;
            }
            return (int) $task->created_by === (int) $user->id
                || (int) $task->assigned_by === (int) $user->id;
        }

        return (int) $task->assignee_id === (int) $user->id;
    }
}
