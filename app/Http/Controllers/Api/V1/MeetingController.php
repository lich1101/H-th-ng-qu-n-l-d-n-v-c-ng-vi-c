<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\MeetingAttendee;
use App\Models\ProjectMeeting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeetingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ProjectMeeting::query()->with(['attendees']);

        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('meeting_link', 'like', "%{$search}%");
            });
        }
        if ($request->filled('project_id')) {
            $query->where('project_id', (int) $request->input('project_id'));
        }
        if ($request->filled('task_id')) {
            $query->where('task_id', (int) $request->input('task_id'));
        }
        if ($request->filled('date_from')) {
            $query->whereDate('scheduled_at', '>=', (string) $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('scheduled_at', '<=', (string) $request->input('date_to'));
        }

        return response()->json(
            $query->orderBy('scheduled_at')->paginate((int) $request->input('per_page', 10))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'scheduled_at' => ['required', 'date'],
            'meeting_link' => ['nullable', 'url', 'max:500'],
            'minutes' => ['nullable', 'string'],
            'attendee_ids' => ['nullable', 'array'],
            'attendee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $meeting = ProjectMeeting::create([
            'project_id' => $validated['project_id'] ?? null,
            'task_id' => $validated['task_id'] ?? null,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'scheduled_at' => $validated['scheduled_at'],
            'meeting_link' => $validated['meeting_link'] ?? null,
            'minutes' => $validated['minutes'] ?? null,
            'created_by' => $request->user()->id,
        ]);

        if (!empty($validated['attendee_ids'])) {
            foreach ($validated['attendee_ids'] as $attendeeId) {
                MeetingAttendee::create([
                    'meeting_id' => $meeting->id,
                    'user_id' => $attendeeId,
                    'attendance_status' => 'invited',
                ]);
            }
        }

        $this->log($request, 'meeting_created', 'meeting', $meeting->id, [
            'title' => ['old' => null, 'new' => $meeting->title],
        ]);

        return response()->json($meeting->load('attendees'), 201);
    }

    public function update(Request $request, ProjectMeeting $meeting): JsonResponse
    {
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'scheduled_at' => ['required', 'date'],
            'meeting_link' => ['nullable', 'url', 'max:500'],
            'minutes' => ['nullable', 'string'],
            'attendee_ids' => ['nullable', 'array'],
            'attendee_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $before = $meeting->only(['title', 'scheduled_at', 'meeting_link']);
        $meeting->update([
            'project_id' => $validated['project_id'] ?? null,
            'task_id' => $validated['task_id'] ?? null,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'scheduled_at' => $validated['scheduled_at'],
            'meeting_link' => $validated['meeting_link'] ?? null,
            'minutes' => $validated['minutes'] ?? null,
        ]);

        if (array_key_exists('attendee_ids', $validated)) {
            $meeting->attendees()->delete();
            foreach ($validated['attendee_ids'] as $attendeeId) {
                MeetingAttendee::create([
                    'meeting_id' => $meeting->id,
                    'user_id' => $attendeeId,
                    'attendance_status' => 'invited',
                ]);
            }
        }

        $this->log($request, 'meeting_updated', 'meeting', $meeting->id, [
            'title' => ['old' => $before['title'], 'new' => $meeting->title],
            'scheduled_at' => ['old' => $before['scheduled_at'], 'new' => (string) $meeting->scheduled_at],
        ]);

        return response()->json($meeting->load('attendees'));
    }

    public function destroy(Request $request, ProjectMeeting $meeting): JsonResponse
    {
        $id = $meeting->id;
        $meeting->delete();

        $this->log($request, 'meeting_deleted', 'meeting', $id, []);

        return response()->json(['message' => 'Xóa lịch họp thành công.']);
    }

    private function log(Request $request, string $action, string $subjectType, int $subjectId, array $changes): void
    {
        ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'changes' => $changes,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);
    }
}
