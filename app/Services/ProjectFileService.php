<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectFile;
use App\Models\TaskComment;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProjectFileService
{
    public function basePath(Project $project): string
    {
        return 'project_files/'.$project->id;
    }

    public function ensureFolder(
        Project $project,
        string $name,
        int $userId,
        ?ProjectFile $parent = null
    ): ProjectFile {
        $folderName = trim($name);
        $query = ProjectFile::query()
            ->where('project_id', $project->id)
            ->where('is_folder', true)
            ->where('name', $folderName);

        if ($parent) {
            $query->where('parent_id', $parent->id);
        } else {
            $query->whereNull('parent_id');
        }

        $existing = $query->first();
        if ($existing) {
            if ($existing->is_deleted) {
                $existing->update([
                    'is_deleted' => false,
                    'deleted_at' => null,
                    'updated_by' => $userId,
                ]);
            }

            $this->ensureDirectoryExists($existing->path);

            return $existing->fresh();
        }

        $basePath = $parent ? $parent->path : $this->basePath($project);
        $path = rtrim($basePath, '/').'/'.$folderName;
        $this->ensureDirectoryExists($path);

        return ProjectFile::create([
            'project_id' => $project->id,
            'parent_id' => $parent ? $parent->id : null,
            'name' => $folderName,
            'path' => $path,
            'is_folder' => true,
            'created_by' => $userId,
            'updated_by' => $userId,
        ]);
    }

    public function upload(
        Project $project,
        UploadedFile $uploadedFile,
        int $userId,
        ?ProjectFile $parent = null,
        ?string $label = null
    ): ProjectFile {
        $basePath = $parent ? $parent->path : $this->basePath($project);
        $this->ensureDirectoryExists($basePath);

        $name = $this->buildStoredName($uploadedFile, $label);
        $name = $this->ensureUniqueName($basePath, $name);
        $storedPath = $uploadedFile->storeAs($basePath, $name, 'public');

        return ProjectFile::create([
            'project_id' => $project->id,
            'parent_id' => $parent ? $parent->id : null,
            'name' => $name,
            'path' => $storedPath,
            'mime_type' => $uploadedFile->getClientMimeType(),
            'size' => $uploadedFile->getSize() ?? 0,
            'is_folder' => false,
            'created_by' => $userId,
            'updated_by' => $userId,
        ]);
    }

    public function rename(ProjectFile $file, string $newName, int $userId): ProjectFile
    {
        $cleanName = trim($newName);
        if (! $file->is_folder) {
            $currentExtension = pathinfo($file->name, PATHINFO_EXTENSION);
            $nextExtension = pathinfo($cleanName, PATHINFO_EXTENSION);
            if ($currentExtension !== '' && $nextExtension === '') {
                $cleanName .= '.'.$currentExtension;
            }
        }

        $parentPath = $file->parent ? $file->parent->path : 'project_files/'.$file->project_id;
        $candidateName = $this->ensureUniqueName($parentPath, $cleanName, $file->path);
        $newPath = rtrim($parentPath, '/').'/'.$candidateName;
        $oldPath = $file->path;

        if (! empty($oldPath) && $oldPath !== $newPath) {
            $this->moveStoragePath($oldPath, $newPath);
        }

        $file->update([
            'name' => $candidateName,
            'path' => $newPath,
            'updated_by' => $userId,
        ]);

        if ($file->is_folder) {
            $this->updateChildPaths($file, $oldPath, $newPath, $userId);
        } else {
            $this->syncTaskCommentAttachmentPath($oldPath, $newPath);
        }

        return $file->fresh();
    }

    public function duplicate(ProjectFile $file, int $userId): ProjectFile
    {
        return $this->duplicateIntoParent($file, $file->parent, $userId);
    }

    public function publicUrl(?string $path): ?string
    {
        if (empty($path)) {
            return null;
        }

        return Storage::url($path);
    }

    public function deleteByPublicUrl(?string $url): void
    {
        $path = $this->relativePathFromUrl($url);
        if (! $path) {
            return;
        }

        $file = ProjectFile::query()
            ->where('path', $path)
            ->where('is_folder', false)
            ->first();

        if (! $file) {
            return;
        }

        Storage::disk('public')->delete($file->path);
        $file->delete();
    }

    private function duplicateIntoParent(ProjectFile $source, ?ProjectFile $parent, int $userId): ProjectFile
    {
        $basePath = $parent ? $parent->path : 'project_files/'.$source->project_id;
        $copyName = $this->copyName($source->name, $source->is_folder);
        $copyName = $this->ensureUniqueName($basePath, $copyName);
        $copyPath = rtrim($basePath, '/').'/'.$copyName;

        if ($source->is_folder) {
            $this->ensureDirectoryExists($copyPath);
        } else {
            $this->ensureDirectoryExists($basePath);
            Storage::disk('public')->copy($source->path, $copyPath);
        }

        $copy = ProjectFile::create([
            'project_id' => $source->project_id,
            'parent_id' => $parent ? $parent->id : null,
            'name' => $copyName,
            'path' => $copyPath,
            'mime_type' => $source->mime_type,
            'size' => $source->size,
            'is_folder' => $source->is_folder,
            'created_by' => $userId,
            'updated_by' => $userId,
        ]);

        if ($source->is_folder) {
            $children = ProjectFile::query()
                ->where('parent_id', $source->id)
                ->orderByDesc('is_folder')
                ->orderBy('name')
                ->get();

            foreach ($children as $child) {
                $this->duplicateIntoParent($child, $copy, $userId);
            }
        }

        return $copy;
    }

    private function buildStoredName(UploadedFile $uploadedFile, ?string $label = null): string
    {
        $base = $label ?: pathinfo($uploadedFile->getClientOriginalName(), PATHINFO_FILENAME);
        $base = Str::slug((string) $base, '_');
        if ($base === '') {
            $base = 'tep_tin';
        }

        $extension = $uploadedFile->getClientOriginalExtension();
        if ($extension === '') {
            $extension = $uploadedFile->extension() ?? '';
        }

        $extension = strtolower($extension);
        $timestamp = now()->format('Ymd_His');

        return $extension === ''
            ? $base.'_'.$timestamp
            : $base.'_'.$timestamp.'.'.$extension;
    }

    private function ensureUniqueName(string $basePath, string $name, ?string $ignorePath = null): string
    {
        $candidate = $name;
        $counter = 2;
        $disk = Storage::disk('public');

        while (true) {
            $candidatePath = rtrim($basePath, '/').'/'.$candidate;
            $exists = $disk->exists($candidatePath);
            if ((! $exists || $candidatePath === $ignorePath)) {
                return $candidate;
            }

            $extension = pathinfo($name, PATHINFO_EXTENSION);
            $filename = pathinfo($name, PATHINFO_FILENAME);
            $candidate = $extension === ''
                ? $filename.'_'.$counter
                : $filename.'_'.$counter.'.'.$extension;
            $counter++;
        }
    }

    private function copyName(string $name, bool $isFolder): string
    {
        if ($isFolder) {
            return $name.' copy';
        }

        $extension = pathinfo($name, PATHINFO_EXTENSION);
        $filename = pathinfo($name, PATHINFO_FILENAME);

        return $extension === ''
            ? $filename.' copy'
            : $filename.' copy'.'.'.$extension;
    }

    private function ensureDirectoryExists(?string $path): void
    {
        if (empty($path)) {
            return;
        }

        Storage::disk('public')->makeDirectory($path);
    }

    private function moveStoragePath(string $oldPath, string $newPath): void
    {
        $disk = Storage::disk('public');
        $oldAbsolutePath = $disk->path($oldPath);
        $newAbsolutePath = $disk->path($newPath);
        $directory = dirname($newAbsolutePath);

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        if (file_exists($oldAbsolutePath)) {
            rename($oldAbsolutePath, $newAbsolutePath);
        }
    }

    private function updateChildPaths(ProjectFile $folder, string $oldPrefix, string $newPrefix, int $userId): void
    {
        $children = ProjectFile::query()
            ->where('project_id', $folder->project_id)
            ->whereNotNull('path')
            ->where('path', 'like', $oldPrefix.'/%')
            ->orderBy('path')
            ->get();

        foreach ($children as $child) {
            $oldPath = $child->path;
            $nextPath = $newPrefix.Str::after($oldPath, $oldPrefix);
            $child->update([
                'path' => $nextPath,
                'updated_by' => $userId,
            ]);

            if (! $child->is_folder) {
                $this->syncTaskCommentAttachmentPath($oldPath, $nextPath);
            }
        }
    }

    private function syncTaskCommentAttachmentPath(string $oldPath, string $newPath): void
    {
        TaskComment::query()
            ->where('attachment_path', Storage::url($oldPath))
            ->update(['attachment_path' => Storage::url($newPath)]);
    }

    private function relativePathFromUrl(?string $url): ?string
    {
        if (empty($url)) {
            return null;
        }

        $path = parse_url($url, PHP_URL_PATH) ?: $url;
        if (! str_starts_with($path, '/storage/')) {
            return null;
        }

        return ltrim(Str::after($path, '/storage/'), '/');
    }
}
