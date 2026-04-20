<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('opportunities', 'status')) {
            Schema::table('opportunities', function (Blueprint $table): void {
                $table->string('status', 32)->nullable()->after('amount');
            });
        }

        if (! $this->indexExists('opportunities', 'opportunities_client_status_idx')) {
            Schema::table('opportunities', function (Blueprint $table): void {
                $table->index(['client_id', 'status'], 'opportunities_client_status_idx');
            });
        }

        $fallbackCode = $this->firstAvailableStatusCode(['open', 'won', 'lost']) ?? 'open';
        $wonCode = $this->firstAvailableStatusCode(['won', 'success']) ?? $fallbackCode;

        DB::table('opportunities')
            ->where(function ($query) {
                $query->whereNull('status')->orWhere('status', '');
            })
            ->update(['status' => $fallbackCode]);

        DB::table('opportunities')
            ->whereExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('contracts')
                    ->whereColumn('contracts.opportunity_id', 'opportunities.id');
            })
            ->update(['status' => $wonCode]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('opportunities', 'status')) {
            if ($this->indexExists('opportunities', 'opportunities_client_status_idx')) {
                Schema::table('opportunities', function (Blueprint $table): void {
                    $table->dropIndex('opportunities_client_status_idx');
                });
            }

            Schema::table('opportunities', function (Blueprint $table): void {
                $table->dropColumn('status');
            });
        }
    }

    private function indexExists(string $table, string $indexName): bool
    {
        $database = DB::connection()->getDatabaseName();

        return DB::table('information_schema.statistics')
            ->where('table_schema', $database)
            ->where('table_name', $table)
            ->where('index_name', $indexName)
            ->exists();
    }

    private function firstAvailableStatusCode(array $preferredCodes): ?string
    {
        $available = DB::table('opportunity_statuses')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->pluck('code')
            ->map(function ($code) {
                return trim((string) $code);
            })
            ->filter()
            ->values();

        foreach ($preferredCodes as $code) {
            if ($available->contains($code)) {
                return $code;
            }
        }

        return $available->first();
    }
};

