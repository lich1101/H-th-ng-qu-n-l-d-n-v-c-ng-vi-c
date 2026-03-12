<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::query()
            ->with(['project', 'assignee', 'reviewer'])
            ->withCount(['comments', 'attachments']);

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
        $validated = $request->validate($this->rules());
        $validated['created_by'] = $request->user()->id;
        $validated['assigned_by'] = $validated['assigned_by'] ?? $request->user()->id;

        $task = Task::create($validated);

        return response()->json(
            $task->load(['project', 'assignee', 'reviewer'])->loadCount(['comments', 'attachments']),
            201
        );
    }

    public function show(Task $task): JsonResponse
    {
        return response()->json(
            $task->load(['project', 'assignee', 'reviewer'])->loadCount(['comments', 'attachments'])
        );
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $validated = $request->validate($this->rules());

        if (isset($validated['progress_percent'])) {
            $validated['progress_percent'] = max(0, min(100, (int) $validated['progress_percent']));
        }

        if (isset($validated['status']) && $validated['status'] === 'hoan_tat_ban_giao') {
            $validated['completed_at'] = now();
        }

        $task->update($validated);

        return response()->json(
            $task->load(['project', 'assignee', 'reviewer'])->loadCount(['comments', 'attachments'])
        );
    }

    public function destroy(Task $task): JsonResponse
    {
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
            'status' => ['required', 'string', 'max:50'],
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
}
