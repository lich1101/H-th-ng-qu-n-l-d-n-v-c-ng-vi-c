<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
            'file' => ['nullable', 'file', 'max:10240'],
            'version' => ['nullable', 'integer', 'min:1'],
            'is_handover' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string'],
        ]);

        $storedPath = null;
        if ($request->hasFile('file')) {
            $storedPath = $request->file('file')->store('task_attachments', 'public');
        }

        $externalUrl = $validated['external_url'] ?? null;
        $filePath = $validated['file_path'] ?? null;
        if ($storedPath) {
            $filePath = Storage::url($storedPath);
        }

        if (empty($filePath) && empty($externalUrl)) {
            return response()->json([
                'message' => 'file_path, external_url or file is required.',
            ], 422);
        }

        $attachment = $task->attachments()->create([
            'uploaded_by' => $request->user()->id,
            'type' => $validated['type'],
            'title' => $validated['title'] ?? null,
            'file_path' => $filePath,
            'external_url' => $externalUrl,
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
        if (! $user || ! in_array($user->role, ['admin', 'quan_ly'], true) && $attachment->uploaded_by !== $user->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $attachment->delete();

        return response()->json(['message' => 'Attachment deleted.']);
    }
}
