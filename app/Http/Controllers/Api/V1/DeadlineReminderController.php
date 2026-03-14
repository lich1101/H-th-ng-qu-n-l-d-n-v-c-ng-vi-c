<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DeadlineReminder;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeadlineReminderController extends Controller
{
    public function index(Task $task, Request $request): JsonResponse
    {
        return response()->json(
            $task->reminders()
                ->latest('scheduled_at')
                ->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Task $task, Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());

        $reminder = $task->reminders()->create($validated);

        return response()->json($reminder, 201);
    }

    public function update(Task $task, DeadlineReminder $reminder, Request $request): JsonResponse
    {
        if ($reminder->task_id !== $task->id) {
            return response()->json(['message' => 'Reminder does not belong to task.'], 422);
        }

        $validated = $request->validate($this->rules());
        $reminder->update($validated);

        return response()->json($reminder);
    }

    public function destroy(Task $task, DeadlineReminder $reminder): JsonResponse
    {
        if ($reminder->task_id !== $task->id) {
            return response()->json(['message' => 'Reminder does not belong to task.'], 422);
        }

        $reminder->delete();

        return response()->json(['message' => 'Reminder deleted.']);
    }

    private function rules(): array
    {
        return [
            'channel' => ['required', 'in:in_app,email,telegram,zalo,push'],
            'trigger_type' => ['required', 'in:days_3,day_1,overdue,custom'],
            'scheduled_at' => ['required', 'date'],
            'sent_at' => ['nullable', 'date'],
            'status' => ['nullable', 'in:pending,sent,cancelled'],
            'payload' => ['nullable', 'string'],
        ];
    }
}
