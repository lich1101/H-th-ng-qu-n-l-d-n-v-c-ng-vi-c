<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractCost;
use App\Models\ContractPayment;
use App\Models\LeadType;
use App\Models\Project;
use App\Models\RevenueTier;
use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

class ImportController extends Controller
{
    public function importClients(Request $request): JsonResponse
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly', 'nhan_vien']);
        $file = $this->validateFile($request);

        $rows = $this->loadRows($file->getRealPath());
        if (count($rows) < 2) {
            return response()->json(['message' => 'File không có dữ liệu.'], 422);
        }

        $headerMap = $this->buildHeaderMap(array_shift($rows), $this->clientHeaderMap());
        $report = $this->initReport();

        foreach ($rows as $index => $row) {
            $rowNumber = $index + 2;
            $data = $this->mapRow($row, $headerMap);
            if (empty($data['name'])) {
                $report['skipped']++;
                $report['errors'][] = ['row' => $rowNumber, 'message' => 'Thiếu tên khách hàng.'];
                continue;
            }

            try {
                DB::beginTransaction();
                $client = $this->findClientByIdentity($data['name'], $data['phone'] ?? null, $data['email'] ?? null);
                $payload = [
                    'name' => $data['name'],
                    'company' => $data['company'] ?? null,
                    'email' => $data['email'] ?? null,
                    'phone' => $data['phone'] ?? null,
                    'notes' => $data['notes'] ?? null,
                    'lead_source' => $data['lead_source'] ?? null,
                    'lead_channel' => $data['lead_channel'] ?? null,
                    'lead_message' => $data['lead_message'] ?? null,
                ];

                if (! empty($data['lead_type'])) {
                    $leadTypeId = LeadType::query()
                        ->where('name', 'like', '%' . $data['lead_type'] . '%')
                        ->value('id');
                    if ($leadTypeId) {
                        $payload['lead_type_id'] = $leadTypeId;
                    }
                }

                if ($client) {
                    $client->update(array_filter($payload, function ($value) {
                        return $value !== null && $value !== '';
                    }));
                    $report['updated']++;
                } else {
                    if (empty($payload['lead_type_id'])) {
                        $payload['lead_type_id'] = LeadType::query()
                            ->where('name', 'Khách hàng tiềm năng')
                            ->value('id');
                    }
                    $client = Client::create($payload);
                    $report['created']++;
                }

                DB::commit();
            } catch (\Throwable $e) {
                DB::rollBack();
                $report['skipped']++;
                $report['errors'][] = ['row' => $rowNumber, 'message' => 'Lỗi xử lý: ' . $e->getMessage()];
            }
        }

        return response()->json($this->finalizeReport($report));
    }

    public function importContracts(Request $request): JsonResponse
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly', 'nhan_vien', 'ke_toan']);
        $file = $this->validateFile($request);

        $rows = $this->loadRows($file->getRealPath());
        if (count($rows) < 2) {
            return response()->json(['message' => 'File không có dữ liệu.'], 422);
        }

        $headerMap = $this->buildHeaderMap(array_shift($rows), $this->contractHeaderMap());
        $report = $this->initReport();

        foreach ($rows as $index => $row) {
            $rowNumber = $index + 2;
            $data = $this->mapRow($row, $headerMap);

            if (empty($data['title'])) {
                $report['skipped']++;
                $report['errors'][] = ['row' => $rowNumber, 'message' => 'Thiếu tiêu đề hợp đồng.'];
                continue;
            }
            if (empty($data['client_name'])) {
                $report['skipped']++;
                $report['errors'][] = ['row' => $rowNumber, 'message' => 'Thiếu tên khách hàng.'];
                continue;
            }

            try {
                DB::beginTransaction();

                $client = Client::query()->where('name', $data['client_name'])->first();
                if (! $client) {
                    $client = Client::create([
                        'name' => $data['client_name'],
                        'lead_type_id' => LeadType::query()
                            ->where('name', 'Khách hàng tiềm năng')
                            ->value('id'),
                    ]);
                }

                $status = $this->normalizeContractStatus($data['status'] ?? 'draft');
                $approval = $this->resolveApproval($request->user());

                $contract = Contract::create([
                    'code' => $data['code'] ?: $this->generateContractCode(),
                    'title' => $data['title'],
                    'client_id' => $client->id,
                    'project_id' => $this->resolveProjectId($data),
                    'value' => $this->parseNumber($data['value'] ?? null),
                    'payment_times' => (int) ($data['payment_times'] ?? 1) ?: 1,
                    'status' => $status,
                    'signed_at' => $this->parseDate($data['signed_at'] ?? null),
                    'start_date' => $this->parseDate($data['start_date'] ?? null),
                    'end_date' => $this->parseDate($data['end_date'] ?? null),
                    'notes' => $data['notes'] ?? null,
                    'created_by' => $request->user()->id,
                    'approval_status' => $approval['approval_status'],
                    'approved_by' => $approval['approved_by'],
                    'approved_at' => $approval['approved_at'],
                ]);

                $paidAmount = $this->parseNumber($data['paid_amount'] ?? null);
                if ($paidAmount !== null) {
                    ContractPayment::create([
                        'contract_id' => $contract->id,
                        'amount' => $paidAmount,
                        'paid_at' => $this->parseDate($data['paid_at'] ?? null),
                        'method' => $data['payment_method'] ?? null,
                        'note' => $data['payment_note'] ?? null,
                        'created_by' => $request->user()->id,
                    ]);
                }

                $costAmount = $this->parseNumber($data['cost_amount'] ?? null);
                if ($costAmount !== null) {
                    ContractCost::create([
                        'contract_id' => $contract->id,
                        'amount' => $costAmount,
                        'cost_type' => $data['cost_type'] ?? null,
                        'cost_date' => $this->parseDate($data['cost_date'] ?? null),
                        'note' => $data['cost_note'] ?? null,
                        'created_by' => $request->user()->id,
                    ]);
                }

                $contract->refreshFinancials();

                if ($contract->approval_status === 'approved') {
                    $contract->load('client');
                    if ($contract->client) {
                        $this->syncClientRevenue($contract->client);
                    }
                }

                DB::commit();
                $report['created']++;
            } catch (\Throwable $e) {
                DB::rollBack();
                $report['skipped']++;
                $report['errors'][] = ['row' => $rowNumber, 'message' => 'Lỗi xử lý: ' . $e->getMessage()];
            }
        }

        return response()->json($this->finalizeReport($report));
    }

    public function importTasks(Request $request): JsonResponse
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly']);
        $file = $this->validateFile($request);

        $rows = $this->loadRows($file->getRealPath());
        if (count($rows) < 2) {
            return response()->json(['message' => 'File không có dữ liệu.'], 422);
        }

        $headerMap = $this->buildHeaderMap(array_shift($rows), $this->taskHeaderMap());
        $report = $this->initReport();

        foreach ($rows as $index => $row) {
            $rowNumber = $index + 2;
            $data = $this->mapRow($row, $headerMap);

            if (empty($data['title'])) {
                $report['skipped']++;
                $report['errors'][] = ['row' => $rowNumber, 'message' => 'Thiếu tiêu đề công việc.'];
                continue;
            }

            $projectId = $this->resolveTaskProject($data, $request->user());
            if (! $projectId) {
                $report['skipped']++;
                $report['errors'][] = ['row' => $rowNumber, 'message' => 'Không xác định được dự án cho công việc.'];
                continue;
            }

            try {
                DB::beginTransaction();
                $assigneeId = $this->resolveUserId($data['assignee'] ?? null);
                Task::create([
                    'project_id' => $projectId,
                    'title' => $data['title'],
                    'description' => $data['description'] ?? null,
                    'priority' => $this->normalizeTaskPriority($data['priority'] ?? 'medium'),
                    'status' => $this->normalizeTaskStatus($data['status'] ?? 'todo'),
                    'start_at' => $this->parseDateTime($data['start_at'] ?? null),
                    'deadline' => $this->parseDateTime($data['deadline'] ?? null),
                    'progress_percent' => (int) ($this->parseNumber($data['progress'] ?? 0) ?? 0),
                    'created_by' => $request->user()->id,
                    'assigned_by' => $request->user()->id,
                    'assignee_id' => $assigneeId,
                    'require_acknowledgement' => true,
                ]);
                DB::commit();
                $report['created']++;
            } catch (\Throwable $e) {
                DB::rollBack();
                $report['skipped']++;
                $report['errors'][] = ['row' => $rowNumber, 'message' => 'Lỗi xử lý: ' . $e->getMessage()];
            }
        }

        return response()->json($this->finalizeReport($report));
    }

    private function authorizeRoles(Request $request, array $roles): void
    {
        if (! in_array($request->user()->role, $roles, true)) {
            abort(403, 'Không có quyền import dữ liệu.');
        }
    }

    private function validateFile(Request $request)
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:xls,xlsx,csv'],
        ]);
        return $validated['file'];
    }

    private function loadRows(string $path): array
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);
        return array_values($rows);
    }

    private function buildHeaderMap(array $headerRow, array $patterns): array
    {
        $map = [];
        foreach ($headerRow as $col => $value) {
            $key = $this->normalizeHeader((string) $value);
            if ($key === '') {
                continue;
            }
            foreach ($patterns as $pattern => $field) {
                if (str_contains($key, $pattern)) {
                    $map[$col] = $field;
                    break;
                }
            }
        }
        return $map;
    }

    private function mapRow(array $row, array $headerMap): array
    {
        $data = [];
        foreach ($headerMap as $col => $field) {
            $value = $row[$col] ?? null;
            if (is_string($value)) {
                $value = trim($value);
            }
            if ($value !== null && $value !== '') {
                $data[$field] = $value;
            }
        }
        return $data;
    }

    private function normalizeHeader(string $value): string
    {
        $ascii = Str::ascii($value);
        $ascii = Str::lower($ascii);
        return preg_replace('/[^a-z0-9]/', '', $ascii) ?? '';
    }

    private function parseNumber($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (float) $value;
        }
        $clean = preg_replace('/[^0-9\.\-]/', '', str_replace(',', '', (string) $value));
        if ($clean === '' || $clean === null) {
            return null;
        }
        return (float) $clean;
    }

    private function parseDate($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            if (is_numeric($value)) {
                return ExcelDate::excelToDateTimeObject($value)->format('Y-m-d');
            }
            return Carbon::parse($value)->format('Y-m-d');
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function parseDateTime($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            if (is_numeric($value)) {
                return ExcelDate::excelToDateTimeObject($value)->format('Y-m-d H:i:s');
            }
            return Carbon::parse($value)->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function resolveProjectId(array $data): ?int
    {
        if (! empty($data['project_id'])) {
            return (int) $data['project_id'];
        }
        if (! empty($data['project_name'])) {
            $project = Project::query()->where('name', $data['project_name'])->first();
            return $project ? $project->id : null;
        }
        return null;
    }

    private function resolveTaskProject(array $data, User $user): ?int
    {
        if (! empty($data['project_id'])) {
            return (int) $data['project_id'];
        }
        if (! empty($data['project_name'])) {
            $project = Project::query()->where('name', $data['project_name'])->first();
            if ($project) {
                return $project->id;
            }
            $serviceType = $this->normalizeServiceType($data['service_type'] ?? '');
            if (! $serviceType) {
                return null;
            }
            $code = $this->generateProjectCode();
            $project = Project::create([
                'code' => $code,
                'name' => $data['project_name'],
                'service_type' => $serviceType,
                'status' => 'moi_tao',
                'created_by' => $user->id,
            ]);
            return $project->id;
        }
        return null;
    }

    private function resolveUserId(?string $value): ?int
    {
        if (! $value) {
            return null;
        }
        $user = User::query()
            ->where('email', $value)
            ->orWhere('name', 'like', '%' . $value . '%')
            ->first();
        return $user ? $user->id : null;
    }

    private function normalizeContractStatus(string $value): string
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($value))) ?? '';
        if (str_contains($key, 'thanhcong') || str_contains($key, 'success')) return 'success';
        if (str_contains($key, 'danghieuluc') || str_contains($key, 'active')) return 'active';
        if (str_contains($key, 'daky') || str_contains($key, 'signed')) return 'signed';
        if (str_contains($key, 'hethan') || str_contains($key, 'expired')) return 'expired';
        if (str_contains($key, 'huy') || str_contains($key, 'cancel')) return 'cancelled';
        return 'draft';
    }

    private function normalizeTaskStatus(string $value): string
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($value))) ?? '';
        if (str_contains($key, 'doing') || str_contains($key, 'danglam')) return 'doing';
        if (str_contains($key, 'done') || str_contains($key, 'hoanthanh')) return 'done';
        if (str_contains($key, 'blocked') || str_contains($key, 'bichan')) return 'blocked';
        return 'todo';
    }

    private function normalizeTaskPriority(string $value): string
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($value))) ?? '';
        if (str_contains($key, 'urgent') || str_contains($key, 'khancap')) return 'urgent';
        if (str_contains($key, 'high') || str_contains($key, 'cao')) return 'high';
        if (str_contains($key, 'low') || str_contains($key, 'thap')) return 'low';
        return 'medium';
    }

    private function normalizeServiceType(string $value): ?string
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($value))) ?? '';
        if ($key === '') {
            return null;
        }
        if (str_contains($key, 'backlink')) return 'backlinks';
        if (str_contains($key, 'chamsoc') || str_contains($key, 'websitecare')) return 'cham_soc_website_tong_the';
        if (str_contains($key, 'viet') || str_contains($key, 'content')) return 'viet_content';
        if (str_contains($key, 'audit')) return 'audit_content';
        return null;
    }

    private function clientHeaderMap(): array
    {
        return [
            'tenkhachhang' => 'name',
            'khachhang' => 'name',
            'customer' => 'name',
            'name' => 'name',
            'congty' => 'company',
            'company' => 'company',
            'sodienthoai' => 'phone',
            'sdt' => 'phone',
            'dienthoai' => 'phone',
            'phone' => 'phone',
            'email' => 'email',
            'trangthai' => 'lead_type',
            'leadtype' => 'lead_type',
            'nguon' => 'lead_source',
            'source' => 'lead_source',
            'kenh' => 'lead_channel',
            'channel' => 'lead_channel',
            'ghichu' => 'notes',
            'note' => 'notes',
        ];
    }

    private function contractHeaderMap(): array
    {
        return [
            'mahopdong' => 'code',
            'sohopdong' => 'code',
            'code' => 'code',
            'tenhopdong' => 'title',
            'hopdong' => 'title',
            'title' => 'title',
            'khachhang' => 'client_name',
            'tenkhachhang' => 'client_name',
            'customer' => 'client_name',
            'giatri' => 'value',
            'tonggiatri' => 'value',
            'doanhthu' => 'value',
            'amount' => 'value',
            'value' => 'value',
            'trangthai' => 'status',
            'status' => 'status',
            'ngayky' => 'signed_at',
            'ngaybatdau' => 'start_date',
            'ngayketthuc' => 'end_date',
            'hethan' => 'end_date',
            'solanthanhtoan' => 'payment_times',
            'lanthanhtoan' => 'payment_times',
            'dathu' => 'paid_amount',
            'thanhtoan' => 'paid_amount',
            'paid' => 'paid_amount',
            'ngaythu' => 'paid_at',
            'ngaythanhtoan' => 'paid_at',
            'phuongthuc' => 'payment_method',
            'method' => 'payment_method',
            'ghichuthanhtoan' => 'payment_note',
            'chiphi' => 'cost_amount',
            'cost' => 'cost_amount',
            'loaichiphi' => 'cost_type',
            'ngaychi' => 'cost_date',
            'ghichuchi' => 'cost_note',
            'ghichu' => 'notes',
            'note' => 'notes',
            'duan' => 'project_name',
            'project' => 'project_name',
            'projectid' => 'project_id',
        ];
    }

    private function taskHeaderMap(): array
    {
        return [
            'tencongviec' => 'title',
            'congviec' => 'title',
            'title' => 'title',
            'mota' => 'description',
            'noidung' => 'description',
            'description' => 'description',
            'duan' => 'project_name',
            'project' => 'project_name',
            'projectid' => 'project_id',
            'dichvu' => 'service_type',
            'loaidichvu' => 'service_type',
            'servicetype' => 'service_type',
            'deadline' => 'deadline',
            'hanchot' => 'deadline',
            'batdau' => 'start_at',
            'start' => 'start_at',
            'trangthai' => 'status',
            'status' => 'status',
            'uutien' => 'priority',
            'priority' => 'priority',
            'nguoi' => 'assignee',
            'phutrach' => 'assignee',
            'assignee' => 'assignee',
            'tiendo' => 'progress',
            'progress' => 'progress',
        ];
    }

    private function initReport(): array
    {
        return [
            'created' => 0,
            'updated' => 0,
            'skipped' => 0,
            'errors' => [],
        ];
    }

    private function finalizeReport(array $report): array
    {
        $report['total'] = $report['created'] + $report['updated'] + $report['skipped'];
        return $report;
    }

    private function findClientByIdentity(string $name, ?string $phone, ?string $email): ?Client
    {
        $query = Client::query()->where('name', $name);
        if ($phone) {
            $query->orWhere('phone', $phone);
        }
        if ($email) {
            $query->orWhere('email', $email);
        }
        return $query->first();
    }

    private function resolveApproval(User $user): array
    {
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return [
                'approval_status' => 'approved',
                'approved_by' => $user->id,
                'approved_at' => now(),
            ];
        }

        return [
            'approval_status' => 'pending',
            'approved_by' => null,
            'approved_at' => null,
        ];
    }

    private function generateContractCode(): string
    {
        $date = now()->format('Ymd');
        for ($i = 0; $i < 5; $i++) {
            $random = Str::upper(Str::random(4));
            $code = "CTR-{$date}-{$random}";
            if (! Contract::where('code', $code)->exists()) {
                return $code;
            }
        }

        return 'CTR-' . $date . '-' . strtoupper(Str::random(6));
    }

    private function generateProjectCode(): string
    {
        $date = now()->format('Ymd');
        return 'PRJ-' . $date . '-' . strtoupper(Str::random(4));
    }

    private function syncClientRevenue(Client $client): void
    {
        $totalRevenue = (float) Contract::query()
            ->where('client_id', $client->id)
            ->where('approval_status', 'approved')
            ->sum('value');

        $tier = null;
        if ($totalRevenue > 0) {
            $tier = RevenueTier::query()
                ->orderByDesc('min_amount')
                ->get()
                ->first(function ($item) use ($totalRevenue) {
                    return $totalRevenue >= (float) $item->min_amount;
                });

            if (! $tier) {
                $tier = RevenueTier::query()
                    ->where('min_amount', '>', 0)
                    ->orderBy('min_amount')
                    ->first();
            }
        }

        $client->update([
            'total_revenue' => $totalRevenue,
            'has_purchased' => $totalRevenue > 0,
            'revenue_tier_id' => $tier ? $tier->id : null,
        ]);
    }
}
