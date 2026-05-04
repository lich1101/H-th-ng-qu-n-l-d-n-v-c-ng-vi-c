<?php

namespace App\Services;

use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\DataTransferJob;
use App\Models\Department;
use App\Models\User;
use App\Services\ClientPhoneDuplicateService;
use App\Services\ContractLifecycleStatusService;
use App\Services\StaffFilterOptionsService;
use Illuminate\Database\Eloquent\Builder;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;

/**
 * Xây query + ghi XLSX xuất khách hàng. Phạm vi: toàn bộ bản ghi (CRM + kho số), chỉ gọi với user admin/administrator.
 * Các bộ lọc tùy chọn (tìm kiếm, nhân sự, …) vẫn áp dụng trên tập đó.
 */
class CrmClientExportService
{
    /** @var \Illuminate\Support\Collection<int, int>|null */
    private $crmNhanVienFilterStaffIds = null;

    public const EXPORT_HEADERS = [
        'Tên khách hàng',
        'Nguồn khách',
        'Loại khách hàng',
        'Email',
        'Điện thoại',
        'Ghi chú',
        'Tình trạng',
        'Người quản lý',
        'Cấp',
        'Công nợ',
        'Nguồn khách hàng',
        'Ngày tạo',
        'Người theo dõi',
        'Quy mô công ty',
        'Danh mục sản phẩm',
        'Doanh số lũy kế',
    ];

    public function buildExportQuery(User $viewer, array $input): Builder
    {
        $query = Client::query()
            ->with(['leadType', 'salesOwner', 'assignedStaff']);

        // Chỉ admin/administrator được gọi export (API). Không dùng applyClientScope
        // vì scope đó loại khách kho số — xuất phải gồm cả CRM thường và kho số.
        if (! in_array((string) ($viewer->role ?? ''), ['admin', 'administrator'], true)) {
            $query->whereRaw('1 = 0');
        }

        if (! empty($input['ids']) && is_array($input['ids'])) {
            $ids = array_values(array_unique(array_filter(array_map('intval', $input['ids']), function (int $id) {
                return $id > 0;
            })));
            if ($ids !== []) {
                $query->whereIn('clients.id', $ids);
            }
        }

        if (! empty($input['search'])) {
            $search = (string) $input['search'];
            $phoneSvc = app(ClientPhoneDuplicateService::class);
            $query->where(function ($builder) use ($search, $phoneSvc) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('company', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%")
                    ->orWhere('external_code', 'like', "%{$search}%")
                    ->orWhere('lead_message', 'like', "%{$search}%")
                    ->orWhere('customer_status_label', 'like', "%{$search}%")
                    ->orWhere('customer_level', 'like', "%{$search}%")
                    ->orWhere('company_size', 'like', "%{$search}%")
                    ->orWhere('product_categories', 'like', "%{$search}%");
                $phoneSvc->orWherePhoneDigitsLikeSearch($builder, $search);
            });
        }

        if (! empty($input['type'])) {
            if ($input['type'] === 'potential') {
                $query->whereDoesntHave('contracts', function ($q) {
                    $statusSql = app(ContractLifecycleStatusService::class)->sqlExpression('contracts');
                    $q->whereRaw("({$statusSql}) in ('success', 'active')");
                });
            }
            if ($input['type'] === 'active') {
                $query->whereHas('contracts', function ($q) {
                    $statusSql = app(ContractLifecycleStatusService::class)->sqlExpression('contracts');
                    $q->whereRaw("({$statusSql}) in ('success', 'active')");
                });
            }
        }

        if (isset($input['lead_type_id']) && $input['lead_type_id'] !== null && $input['lead_type_id'] !== '') {
            $query->where('lead_type_id', (int) $input['lead_type_id']);
        }

        if (isset($input['revenue_tier_id']) && $input['revenue_tier_id'] !== null && $input['revenue_tier_id'] !== '') {
            $query->where('revenue_tier_id', (int) $input['revenue_tier_id']);
        }

        if (isset($input['assigned_department_id']) && $input['assigned_department_id'] !== null && $input['assigned_department_id'] !== '') {
            $departmentId = (int) $input['assigned_department_id'];
            if (! $this->canViewerFilterByDepartment($viewer, $departmentId)) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where(function ($builder) use ($departmentId) {
                    $builder->where('assigned_department_id', $departmentId)
                        ->orWhereHas('assignedStaff', function ($staffQuery) use ($departmentId) {
                            $staffQuery->where('department_id', $departmentId);
                        });
                });
            }
        }

        $staffFilterIds = $this->resolveAssignedStaffFilterIdsFromInput($input);
        if ($staffFilterIds !== []) {
            $canUseStaffFilter = collect($staffFilterIds)->every(function (int $staffId) use ($viewer) {
                return $this->canViewerFilterByStaff($viewer, $staffId);
            });
            if (! $canUseStaffFilter) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where(function ($builder) use ($staffFilterIds) {
                    $builder->whereIn('assigned_staff_id', $staffFilterIds)
                        ->orWhere(function ($q) use ($staffFilterIds) {
                            $q->whereNull('assigned_staff_id')
                                ->whereIn('sales_owner_id', $staffFilterIds);
                        });
                });
            }
        }

        if (filter_var($input['lead_only'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $query->whereNotNull('lead_type_id');
        }

        if (! empty($input['created_from'])) {
            $query->whereDate('clients.created_at', '>=', (string) $input['created_from']);
        }

        if (! empty($input['created_to'])) {
            $query->whereDate('clients.created_at', '<=', (string) $input['created_to']);
        }

        $query->select('clients.*');

        return $query->orderBy('clients.id');
    }

    public function runExportJob(DataTransferJob $job, User $viewer): void
    {
        $filters = is_array($job->report) ? ($job->report['filters'] ?? []) : [];
        $progressReport = is_array($job->report) ? $job->report : [];

        $query = $this->buildExportQuery($viewer, $filters);
        $total = (int) $query->clone()->count();

        $job->forceFill([
            'total_rows' => $total,
            'processed_rows' => 0,
        ])->save();

        $relative = 'exports/clients/job-' . $job->id . '.xlsx';
        $full = storage_path('app/' . $relative);
        if (! is_dir(dirname($full))) {
            mkdir(dirname($full), 0755, true);
        }

        $processed = 0;

        $writer = new Writer();
        $writer->openToFile($full);
        try {
            $writer->getCurrentSheet()->setName('Khach hang');
            $writer->addRow(Row::fromValues(self::EXPORT_HEADERS));

            foreach ($query->clone()->lazyById(200) as $client) {
                $writer->addRow(Row::fromValues($this->clientToExportRow($client)));
                $processed++;

                if ($processed % 50 === 0 || $processed === $total) {
                    $job->forceFill([
                        'processed_rows' => $processed,
                        'report' => array_merge($progressReport, [
                            'filters' => $filters,
                            'exported_rows' => $processed,
                        ]),
                    ])->save();
                }
            }
        } finally {
            $writer->close();
        }

        $job->forceFill([
            'status' => 'completed',
            'file_path' => $relative,
            'original_name' => 'khach-hang-export.xlsx',
            'processed_rows' => $processed,
            'successful_rows' => $processed,
            'failed_rows' => 0,
            'finished_at' => now(),
            'error_message' => null,
            'report' => array_merge($progressReport, [
                'filters' => $filters,
                'exported_rows' => $processed,
            ]),
        ])->save();
    }

    private function clientToExportRow(Client $client): array
    {
        $created = $client->created_at;
        $createdStr = $created ? $created->timezone(config('app.timezone'))->format('d/m/Y') : '';

        return [
            (string) $client->name,
            (string) ($client->lead_source ?? ''),
            (string) ($client->leadType?->name ?? ''),
            (string) ($client->email ?? ''),
            (string) ($client->phone ?? ''),
            (string) ($client->notes ?? ''),
            (string) ($client->customer_status_label ?? ''),
            (string) ($client->salesOwner?->name ?? ''),
            (string) ($client->customer_level ?? ''),
            $this->formatMoney($client->legacy_debt_amount),
            (string) ($client->lead_channel ?? ''),
            $createdStr,
            (string) ($client->assignedStaff?->name ?? ''),
            (string) ($client->company_size ?? ''),
            (string) ($client->product_categories ?? ''),
            $this->formatMoney($client->total_revenue),
        ];
    }

    private function formatMoney($value): string
    {
        if ($value === null || $value === '') {
            return '';
        }

        $n = (float) $value;
        if (abs($n - round($n)) < 0.00001) {
            return (string) (int) round($n);
        }

        return (string) $n;
    }

    private function resolveAssignedStaffFilterIdsFromInput(array $input): array
    {
        $raw = $input['assigned_staff_ids'] ?? [];
        if (is_string($raw)) {
            $trimmed = trim($raw);
            $raw = $trimmed === '' ? [] : (preg_split('/[\s,;|]+/', $trimmed) ?: []);
        }
        if (! is_array($raw)) {
            $raw = [];
        }

        if (! empty($input['assigned_staff_id'])) {
            $raw[] = $input['assigned_staff_id'];
        }

        return collect($raw)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();
    }

    private function canViewerFilterByDepartment(User $viewer, int $departmentId): bool
    {
        if ($departmentId <= 0) {
            return false;
        }

        if (CrmScope::hasGlobalScope($viewer)) {
            return Department::query()->where('id', $departmentId)->exists();
        }

        if ($viewer->role === 'quan_ly') {
            return CrmScope::managedDepartmentIds($viewer)->contains($departmentId);
        }

        if ($viewer->role === 'nhan_vien') {
            return (int) ($viewer->department_id ?? 0) === $departmentId;
        }

        return false;
    }

    private function canViewerFilterByStaff(User $viewer, int $staffId): bool
    {
        if ($staffId <= 0) {
            return false;
        }

        if (CrmScope::hasGlobalScope($viewer)) {
            return User::query()->where('id', $staffId)->exists();
        }

        if ($viewer->role === 'quan_ly') {
            return CrmScope::managerVisibleUserIds($viewer)->contains(function ($id) use ($staffId) {
                return (int) $id === $staffId;
            });
        }

        if ($viewer->role === 'nhan_vien') {
            if ($this->crmNhanVienFilterStaffIds === null) {
                $this->crmNhanVienFilterStaffIds = app(StaffFilterOptionsService::class)
                    ->forCrmClients($viewer)
                    ->pluck('id')
                    ->map(function ($id) {
                        return (int) $id;
                    })
                    ->unique()
                    ->values();
            }

            return $this->crmNhanVienFilterStaffIds->contains($staffId);
        }

        return false;
    }
}
