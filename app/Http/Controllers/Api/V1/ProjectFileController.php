<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\ProjectScope;
use App\Models\Project;
use App\Models\ProjectFile;
use App\Services\ProjectFileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProjectFileController extends Controller
{
    public function index(Project $project, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem link dự án.'], 403);
        }

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

        return response()->json([
            'data' => $items,
            'permissions' => [
                'can_manage' => ProjectScope::canManageProjectFiles($request->user(), $project),
            ],
        ]);
    }

    public function createFolder(Project $project, Request $request, ProjectFileService $files): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem link dự án.'], 403);
        }
        if (! ProjectScope::canManageProjectFiles($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa link dự án.'], 403);
        }

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

        $folder = $files->ensureFolder(
            $project,
            (string) $validated['name'],
            $request->user()->id,
            $parent
        );

        return response()->json($folder, 201);
    }

    public function upload(Project $project, Request $request, ProjectFileService $files): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem link dự án.'], 403);
        }
        if (! ProjectScope::canManageProjectFiles($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa link dự án.'], 403);
        }

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:20480'],
            'parent_id' => ['nullable', 'integer', 'exists:project_files,id'],
            'label' => ['nullable', 'string', 'max:160'],
        ]);

        $parent = null;
        if (! empty($validated['parent_id'])) {
            $parent = ProjectFile::query()
                ->where('project_id', $project->id)
                ->where('id', $validated['parent_id'])
                ->first();
        }

        $file = $files->upload(
            $project,
            $request->file('file'),
            $request->user()->id,
            $parent,
            $validated['label'] ?? null
        );

        return response()->json($file, 201);
    }

    public function update(
        Project $project,
        ProjectFile $file,
        Request $request,
        ProjectFileService $files
    ): JsonResponse {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem link dự án.'], 403);
        }
        if (! ProjectScope::canManageProjectFiles($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa link dự án.'], 403);
        }

        if ($file->project_id !== $project->id) {
            return response()->json(['message' => 'File không thuộc dự án.'], 422);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:180'],
        ]);

        $renamed = $files->rename($file, (string) $validated['name'], $request->user()->id);

        return response()->json($renamed);
    }

    public function duplicate(
        Project $project,
        ProjectFile $file,
        Request $request,
        ProjectFileService $files
    ): JsonResponse {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem link dự án.'], 403);
        }
        if (! ProjectScope::canManageProjectFiles($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa link dự án.'], 403);
        }

        if ($file->project_id !== $project->id) {
            return response()->json(['message' => 'File không thuộc dự án.'], 422);
        }

        $copy = $files->duplicate($file, $request->user()->id);

        return response()->json($copy, 201);
    }

    public function trash(Project $project, ProjectFile $file, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem link dự án.'], 403);
        }
        if (! ProjectScope::canManageProjectFiles($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa link dự án.'], 403);
        }

        if ($file->project_id !== $project->id) {
            return response()->json(['message' => 'File không thuộc dự án.'], 422);
        }
        $this->markDeleted($file, true, $request->user()->id);

        return response()->json(['message' => 'Đã chuyển vào thùng rác.']);
    }

    public function restore(Project $project, ProjectFile $file, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem link dự án.'], 403);
        }
        if (! ProjectScope::canManageProjectFiles($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa link dự án.'], 403);
        }

        if ($file->project_id !== $project->id) {
            return response()->json(['message' => 'File không thuộc dự án.'], 422);
        }
        $this->markDeleted($file, false, $request->user()->id);

        return response()->json(['message' => 'Đã khôi phục.']);
    }

    public function destroy(Project $project, ProjectFile $file, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem link dự án.'], 403);
        }
        if (! ProjectScope::canManageProjectFiles($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền chỉnh sửa link dự án.'], 403);
        }

        if ($file->project_id !== $project->id) {
            return response()->json(['message' => 'File không thuộc dự án.'], 422);
        }
        $this->deleteFileRecursive($file);

        return response()->json(['message' => 'Đã xóa vĩnh viễn.']);
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
