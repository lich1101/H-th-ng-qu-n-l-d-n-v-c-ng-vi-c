<?php

use App\Services\ClientPhoneDuplicateService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('clients') || ! Schema::hasColumn('clients', 'phone')) {
            return;
        }

        $svc = app(ClientPhoneDuplicateService::class);

        DB::table('clients')
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($svc) {
                foreach ($rows as $row) {
                    $raw = (string) $row->phone;
                    $n = $svc->normalizeDigits($raw);
                    if ($n !== '' && $n !== $raw) {
                        DB::table('clients')->where('id', $row->id)->update(['phone' => $n]);
                    }
                }
            });
    }

    public function down(): void
    {
        // Không khôi phục định dạng cũ (có/không khoảng trắng).
    }
};
