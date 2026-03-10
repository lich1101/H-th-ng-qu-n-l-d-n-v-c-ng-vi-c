<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskAttachmentController extends Controller
{
    public function index(Task $task, Request $request): JsonResponse
    {
        return response()->json(
            $task->attachments()
                ->latest()
                ->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Task $task, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', 'max:30'],
            'title' => ['nullable', 'string', 'max:255'],
            'file_path' => ['nullable', 'string', 'max:255'],
            'external_url' => ['nullable', 'url', 'max:500'],
            'version' => ['nullable', 'integer', 'min:1'],
            'is_handover' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string'],
        ]);

        if (empty($validated['file_path']) && empty($validated['external_url'])) {
            return response()->json([
                'message' => 'file_path or external_url is required.',
            ], 422);
        }

        $attachment = $task->attachments()->create([
            'uploaded_by' => $request->user()->id,
            'type' => $validated['type'],
            'title' => $validated['title'] ?? null,
            'file_path' => $validated['file_path'] ?? null,
            'external_url' => $validated['external_url'] ?? null,
            'version' => $validated['version'] ?? 1,
            'is_handover' => $validated['is_handover'] ?? false,
            'note' => $validated['note'] ?? null,
        ]);

        return response()->json($attachment, 201);
    }

    public function destroy(Task $task, TaskAttachment $attachment, Request $request): JsonResponse
    {
        if ($attachment->task_id !== $task->id) {
            return response()->json(['message' => 'Attachment does not belong to task.'], 422);
        }

        $user = $request->user();
        if (! $user || ! in_array($user->role, ['admin', 'truong_phong_san_xuat'], true) && $attachment->uploaded_by !== $user->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $attachment->delete();

        return response()->json(['message' => 'Attachment deleted.']);
    }
}
