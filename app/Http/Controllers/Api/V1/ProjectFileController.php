<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProjectFileController extends Controller
{
    public function index(Project $project, Request $request): JsonResponse
    {
        $parentId = $request->input('parent_id');
        $trash = $request->boolean('trash');

        $query = ProjectFile::query()
            ->where('project_id', $project->id)
            ->where('is_deleted', $trash);

        if ($parentId) {
            $query->where('parent_id', $parentId);
        } else {
            $query->whereNull('parent_id');
        }

        $items = $query->orderByDesc('is_folder')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function createFolder(Project $project, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'parent_id' => ['nullable', 'integer', 'exists:project_files,id'],
        ]);

        $parent = null;
        if (! empty($validated['parent_id'])) {
            $parent = ProjectFile::query()
                ->where('project_id', $project->id)
                ->where('id', $validated['parent_id'])
                ->first();
        }

        $basePath = $parent ? $parent->path : $this->basePath($project->id);
        $folderName = trim($validated['name']);
        $path = rtrim($basePath, '/').'/'.$folderName;

        Storage::disk('public')->makeDirectory($path);

        $folder = ProjectFile::create([
            'project_id' => $project->id,
            'parent_id' => $parent?->id,
            'name' => $folderName,
            'path' => $path,
            'is_folder' => true,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json($folder, 201);
    }

    public function upload(Project $project, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:20480'],
            'parent_id' => ['nullable', 'integer', 'exists:project_files,id'],
        ]);

        $parent = null;
        if (! empty($validated['parent_id'])) {
            $parent = ProjectFile::query()
                ->where('project_id', $project->id)
                ->where('id', $validated['parent_id'])
                ->first();
        }

        $basePath = $parent ? $parent->path : $this->basePath($project->id);
        $original = $request->file('file')->getClientOriginalName();
        $name = $this->ensureUniqueName($basePath, $original);
        $storedPath = $request->file('file')->storeAs($basePath, $name, 'public');

        $file = ProjectFile::create([
            'project_id' => $project->id,
            'parent_id' => $parent?->id,
            'name' => $name,
            'path' => $storedPath,
            'mime_type' => $request->file('file')->getClientMimeType(),
            'size' => $request->file('file')->getSize() ?? 0,
            'is_folder' => false,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json($file, 201);
    }

    public function trash(Project $project, ProjectFile $file, Request $request): JsonResponse
    {
        if ($file->project_id !== $project->id) {
            return response()->json(['message' => 'File không thuộc dự án.'], 422);
        }
        $this->markDeleted($file, true, $request->user()->id);

        return response()->json(['message' => 'Đã chuyển vào thùng rác.']);
    }

    public function restore(Project $project, ProjectFile $file, Request $request): JsonResponse
    {
        if ($file->project_id !== $project->id) {
            return response()->json(['message' => 'File không thuộc dự án.'], 422);
        }
        $this->markDeleted($file, false, $request->user()->id);

        return response()->json(['message' => 'Đã khôi phục.']);
    }

    public function destroy(Project $project, ProjectFile $file): JsonResponse
    {
        if ($file->project_id !== $project->id) {
            return response()->json(['message' => 'File không thuộc dự án.'], 422);
        }
        $this->deleteFileRecursive($file);

        return response()->json(['message' => 'Đã xóa vĩnh viễn.']);
    }

    private function basePath(int $projectId): string
    {
        return 'project_files/'.$projectId;
    }

    private function ensureUniqueName(string $basePath, string $name): string
    {
        $disk = Storage::disk('public');
        $candidate = $name;
        $counter = 1;
        while ($disk->exists($basePath.'/'.$candidate)) {
            $candidate = pathinfo($name, PATHINFO_FILENAME)
                .'_'.($counter++)
                .(pathinfo($name, PATHINFO_EXTENSION) ? '.'.pathinfo($name, PATHINFO_EXTENSION) : '');
        }
        return $candidate;
    }

    private function markDeleted(ProjectFile $file, bool $deleted, int $userId): void
    {
        $file->update([
            'is_deleted' => $deleted,
            'deleted_at' => $deleted ? now() : null,
            'updated_by' => $userId,
        ]);

        $children = ProjectFile::query()->where('parent_id', $file->id)->get();
        foreach ($children as $child) {
            $this->markDeleted($child, $deleted, $userId);
        }
    }

    private function deleteFileRecursive(ProjectFile $file): void
    {
        $children = ProjectFile::query()->where('parent_id', $file->id)->get();
        foreach ($children as $child) {
            $this->deleteFileRecursive($child);
        }

        if (! $file->is_folder && $file->path) {
            Storage::disk('public')->delete($file->path);
        }

        if ($file->is_folder && $file->path) {
            Storage::disk('public')->deleteDirectory($file->path);
        }

        $file->delete();
    }
}
