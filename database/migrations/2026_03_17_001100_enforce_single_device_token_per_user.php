<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Cleanup historical duplicates: keep the latest row per user.
        $rows = DB::table('user_device_tokens')
            ->select(['id', 'user_id'])
            ->orderBy('user_id')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get();

        $seenUsers = [];
        $deleteIds = [];
        foreach ($rows as $row) {
            $userId = (int) $row->user_id;
            if (! isset($seenUsers[$userId])) {
                $seenUsers[$userId] = true;
                continue;
            }
            $deleteIds[] = (int) $row->id;
        }

        foreach (array_chunk($deleteIds, 500) as $chunk) {
            DB::table('user_device_tokens')->whereIn('id', $chunk)->delete();
        }

        Schema::table('user_device_tokens', function (Blueprint $table) {
            $table->unique('user_id', 'user_device_tokens_user_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('user_device_tokens', function (Blueprint $table) {
            $table->dropUnique('user_device_tokens_user_id_unique');
        });
    }
};
