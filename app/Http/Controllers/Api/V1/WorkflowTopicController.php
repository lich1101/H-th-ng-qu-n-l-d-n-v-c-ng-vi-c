<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\WorkflowTopic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WorkflowTopicController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = WorkflowTopic::query()
            ->with(['tasks.items'])
            ->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('tasks', function ($taskQuery) use ($search) {
                        $taskQuery->where('title', 'like', "%{$search}%")
                            ->orWhere('description', 'like', "%{$search}%")
                            ->orWhereHas('items', function ($itemQuery) use ($search) {
                                $itemQuery->where('title', 'like', "%{$search}%")
                                    ->orWhere('description', 'like', "%{$search}%");
                            });
                    });
            });
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        $perPage = (int) $request->input('per_page', 50);
        return response()->json($query->paginate($perPage));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);
        $this->validateWeightRules($validated);

        $topic = DB::transaction(function () use ($validated, $request) {
            $topic = WorkflowTopic::query()->create([
                'name' => trim((string) $validated['name']),
                'code' => trim((string) ($validated['code'] ?? '')) ?: null,
                'description' => trim((string) ($validated['description'] ?? '')) ?: null,
                'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
                'created_by' => (int) $request->user()->id,
            ]);

            $this->syncTasks($topic, $validated['tasks'] ?? []);
            return $topic;
        });

        return response()->json($topic->fresh(['tasks.items']), 201);
    }

    public function update(Request $request, WorkflowTopic $workflowTopic): JsonResponse
    {
        $validated = $this->validatePayload($request, (int) $workflowTopic->id);
        $this->validateWeightRules($validated);

        DB::transaction(function () use ($workflowTopic, $validated) {
            $workflowTopic->update([
                'name' => trim((string) $validated['name']),
                'code' => trim((string) ($validated['code'] ?? '')) ?: null,
                'description' => trim((string) ($validated['description'] ?? '')) ?: null,
                'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : (bool) $workflowTopic->is_active,
            ]);

            $this->syncTasks($workflowTopic, $validated['tasks'] ?? []);
        });

        return response()->json($workflowTopic->fresh(['tasks.items']));
    }

    public function destroy(WorkflowTopic $workflowTopic): JsonResponse
    {
        $workflowTopic->delete();

        return response()->json([
            'message' => 'Đã xoá barem topic.',
        ]);
    }

    private function validatePayload(Request $request, ?int $topicId = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'code' => [
                'nullable',
                'string',
                'max:80',
                Rule::unique('workflow_topics', 'code')->ignore($topicId),
            ],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
            'tasks' => ['nullable', 'array'],
            'tasks.*.id' => ['nullable', 'integer'],
            'tasks.*.title' => ['required', 'string', 'max:191'],
            'tasks.*.description' => ['nullable', 'string'],
            'tasks.*.priority' => ['nullable', 'string', 'max:20'],
            'tasks.*.status' => ['nullable', 'string', 'max:20'],
            'tasks.*.weight_percent' => ['nullable', 'integer', 'min:1', 'max:100'],
            'tasks.*.start_offset_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'tasks.*.duration_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'tasks.*.sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'tasks.*.items' => ['nullable', 'array'],
            'tasks.*.items.*.id' => ['nullable', 'integer'],
            'tasks.*.items.*.title' => ['required', 'string', 'max:191'],
            'tasks.*.items.*.description' => ['nullable', 'string'],
            'tasks.*.items.*.priority' => ['nullable', 'string', 'max:20'],
            'tasks.*.items.*.status' => ['nullable', 'string', 'max:20'],
            'tasks.*.items.*.weight_percent' => ['nullable', 'integer', 'min:1', 'max:100'],
            'tasks.*.items.*.start_offset_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'tasks.*.items.*.duration_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'tasks.*.items.*.sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ]);
    }

    private function validateWeightRules(array $validated): void
    {
        $tasks = $validated['tasks'] ?? [];
        if (empty($tasks)) {
            return;
        }

        $totalTaskWeight = 0;
        foreach ($tasks as $task) {
            $totalTaskWeight += (int) ($task['weight_percent'] ?? 1);

            $itemWeightTotal = 0;
            $items = $task['items'] ?? [];
            foreach ($items as $item) {
                $itemWeightTotal += (int) ($item['weight_percent'] ?? 1);
            }

            if ($itemWeightTotal > 100) {
                abort(response()->json([
                    'message' => sprintf('Tổng tỷ trọng đầu việc của công việc "%s" vượt quá 100%%.', (string) ($task['title'] ?? '')),
                ], 422));
            }
        }

        if ($totalTaskWeight > 100) {
            abort(response()->json([
                'message' => 'Tổng tỷ trọng công việc trong barem không được vượt quá 100%.',
            ], 422));
        }
    }

    private function syncTasks(WorkflowTopic $topic, array $tasks): void
    {
        $existingTaskIds = $topic->tasks()->pluck('id')->all();
        $keptTaskIds = [];

        foreach ($tasks as $taskIndex => $taskPayload) {
            $taskData = [
                'title' => trim((string) $taskPayload['title']),
                'description' => trim((string) ($taskPayload['description'] ?? '')) ?: null,
                'priority' => (string) ($taskPayload['priority'] ?? 'medium'),
                'status' => (string) ($taskPayload['status'] ?? 'todo'),
                'weight_percent' => (int) ($taskPayload['weight_percent'] ?? 1),
                'start_offset_days' => (int) ($taskPayload['start_offset_days'] ?? 0),
                'duration_days' => (int) ($taskPayload['duration_days'] ?? 1),
                'sort_order' => (int) ($taskPayload['sort_order'] ?? ($taskIndex + 1)),
            ];

            $taskId = (int) ($taskPayload['id'] ?? 0);
            if ($taskId > 0) {
                $task = $topic->tasks()->where('id', $taskId)->first();
                if (! $task) {
                    continue;
                }
                $task->update($taskData);
            } else {
                $task = $topic->tasks()->create($taskData);
            }

            $keptTaskIds[] = (int) $task->id;
            $this->syncItems($task, $taskPayload['items'] ?? []);
        }

        $deleteTaskIds = array_values(array_diff($existingTaskIds, $keptTaskIds));
        if (! empty($deleteTaskIds)) {
            $topic->tasks()->whereIn('id', $deleteTaskIds)->delete();
        }
    }

    private function syncItems($task, array $items): void
    {
        $existingItemIds = $task->items()->pluck('id')->all();
        $keptItemIds = [];

        foreach ($items as $itemIndex => $itemPayload) {
            $itemData = [
                'title' => trim((string) $itemPayload['title']),
                'description' => trim((string) ($itemPayload['description'] ?? '')) ?: null,
                'priority' => (string) ($itemPayload['priority'] ?? 'medium'),
                'status' => (string) ($itemPayload['status'] ?? 'todo'),
                'weight_percent' => (int) ($itemPayload['weight_percent'] ?? 1),
                'start_offset_days' => (int) ($itemPayload['start_offset_days'] ?? 0),
                'duration_days' => (int) ($itemPayload['duration_days'] ?? 1),
                'sort_order' => (int) ($itemPayload['sort_order'] ?? ($itemIndex + 1)),
            ];

            $itemId = (int) ($itemPayload['id'] ?? 0);
            if ($itemId > 0) {
                $item = $task->items()->where('id', $itemId)->first();
                if (! $item) {
                    continue;
                }
                $item->update($itemData);
            } else {
                $item = $task->items()->create($itemData);
            }

            $keptItemIds[] = (int) $item->id;
        }

        $deleteItemIds = array_values(array_diff($existingItemIds, $keptItemIds));
        if (! empty($deleteItemIds)) {
            $task->items()->whereIn('id', $deleteItemIds)->delete();
        }
    }
}

