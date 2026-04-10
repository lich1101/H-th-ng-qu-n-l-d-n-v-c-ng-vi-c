<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\ContractFile;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class ContractFileStorageService
{
    public const MAX_BYTES = 52428800; // 50 MB

    /** @var array<int, string> */
    private const DANGEROUS_EXTENSIONS = ['exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'vbs', 'ps1'];

    public function store(Contract $contract, UploadedFile $uploadedFile, int $userId): ContractFile
    {
        $size = (int) ($uploadedFile->getSize() ?? 0);
        if ($size > self::MAX_BYTES) {
            throw new RuntimeException('File vượt quá dung lượng cho phép (tối đa 50 MB).');
        }

        $originalName = $this->sanitizeOriginalName($uploadedFile->getClientOriginalName() ?: 'file');
        $extension = $this->resolveExtension($originalName, $uploadedFile);
        $this->assertNotDangerousExtension($extension);

        $storedBase = $this->buildStoredName($contract, $extension);
        $directory = 'contract_files/'.$contract->id;
        $path = $uploadedFile->storeAs($directory, $storedBase, 'public');

        $mime = $uploadedFile->getMimeType() ?: 'application/octet-stream';

        return ContractFile::create([
            'contract_id' => $contract->id,
            'disk' => 'public',
            'path' => $path,
            'original_name' => $originalName,
            'stored_name' => $storedBase,
            'mime_type' => $mime,
            'size' => $size,
            'uploaded_by' => $userId,
        ]);
    }

    public function delete(ContractFile $file): void
    {
        if ($file->path !== '') {
            Storage::disk($file->disk)->delete($file->path);
        }
        $file->delete();
    }

    public function sanitizeOriginalName(string $name): string
    {
        $name = str_replace(["\0", "\r", "\n"], '', $name);
        $name = basename($name);
        $name = trim($name);

        return $name !== '' ? $name : 'file';
    }

    private function buildStoredName(Contract $contract, string $extension): string
    {
        $code = (string) ($contract->code ?? '');
        $slug = Str::slug($code !== '' ? $code : 'hd-'.$contract->id);
        if ($slug === '') {
            $slug = 'hd-'.$contract->id;
        }
        $ts = Carbon::now('Asia/Ho_Chi_Minh')->format('YmdHis');
        $rand = Str::lower(Str::random(6));

        $ext = $extension !== '' ? '.'.$extension : '';

        return "{$slug}_{$ts}_{$rand}{$ext}";
    }

    private function resolveExtension(string $originalName, UploadedFile $uploadedFile): string
    {
        $from = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($from !== '') {
            return $from;
        }

        $guessed = strtolower((string) $uploadedFile->guessExtension());

        return $guessed !== '' ? $guessed : '';
    }

    private function assertNotDangerousExtension(string $extension): void
    {
        $ext = strtolower($extension);
        if ($ext !== '' && in_array($ext, self::DANGEROUS_EXTENSIONS, true)) {
            throw new RuntimeException('Không cho phép tải lên loại file đính kèm thực thi này.');
        }
    }
}
