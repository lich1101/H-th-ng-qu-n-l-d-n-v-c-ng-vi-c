<?php

namespace App\Services\DataTransfers;

use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractItem;
use App\Models\ContractPayment;
use App\Models\DataTransferJob;
use App\Models\Department;
use App\Models\LeadType;
use App\Models\Product;
use App\Models\Project;
use App\Models\RevenueTier;
use App\Models\Task;
use App\Models\User;
use App\Services\ProjectProgressService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class ImportExecutionService
{
    protected array $userCacheByEmail = [];
    protected array $userCacheByName = [];
    protected array $users = [];
    protected array $departmentCacheByName = [];
    protected array $leadTypeCacheByName = [];
    protected array $productCacheByCode = [];
    protected array $productCacheByName = [];

    public function __construct(
        protected ClientFinancialSyncService $clientFinancialSyncService
    ) {
    }

    public function estimateRows(string $path): int
    {
        $spreadsheet = $this->loadSpreadsheet($path);
        /** @var Worksheet|null $sheet */
        $sheet = $spreadsheet->getSheet(0);
        if (! $sheet) {
            return 0;
        }

        return max(0, ((int) $sheet->getHighestDataRow()) - 1);
    }

    public function runImportJob(DataTransferJob $job): array
    {
        $this->prepareImportRuntime();
        $user = User::query()->findOrFail($job->user_id);
        $path = storage_path('app/' . ltrim((string) $job->file_path, '/'));

        return match ($job->module) {
            'clients' => $this->importClientsFromPath($path, $user, $job),
            'contracts' => $this->importContractsFromPath($path, $user, $job),
            'tasks' => $this->importTasksFromPath($path, $user, $job),
            'users' => $this->importUsersFromPath($path, $user, $job),
            default => throw new \RuntimeException('Module import chưa được hỗ trợ: ' . $job->module),
        };
    }

    public function importClientsFromPath(string $path, User $user, ?DataTransferJob $job = null): array
    {
        $report = $this->initReport();
        $processed = 0;

        $this->iterateMappedRows($path, $this->clientHeaderMap(), function (array $data, int $rowNumber) use (&$report, &$processed, $user, $job) {
            $processed++;

            if (empty($data['name'])) {
                $this->skipRow($report, $rowNumber, 'Thiếu tên khách hàng.');
                $this->syncJobProgress($job, $processed, $report);
                return;
            }

            try {
                DB::beginTransaction();

                $statusLabel = $data['customer_status_label'] ?? null;
                $leadTypeId = $this->resolveLeadTypeId($statusLabel ?: ($data['lead_type_name'] ?? null));

                $salesOwnerRaw = $data['manager_name'] ?? null;
                $salesOwnerId = $this->resolveUserId($salesOwnerRaw);
                if ($this->hasText($salesOwnerRaw) && ! $salesOwnerId) {
                    $this->pushWarning($report, $rowNumber, 'Không tìm thấy người quản lý "' . trim((string) $salesOwnerRaw) . '", hệ thống để trống.');
                }

                $assignedStaffRaw = $data['watcher_name'] ?? null;
                $assignedStaffId = $this->resolveUserId($assignedStaffRaw);
                if ($this->hasText($assignedStaffRaw) && ! $assignedStaffId) {
                    $this->pushWarning($report, $rowNumber, 'Không tìm thấy người theo dõi "' . trim((string) $assignedStaffRaw) . '", hệ thống để trống.');
                }
                if (! $assignedStaffId) {
                    $assignedStaffId = $salesOwnerId;
                }

                if ($user->role === 'nhan_vien') {
                    $assignedStaffId = (int) $user->id;
                    $salesOwnerId = (int) $user->id;
                }

                $assignedDepartmentId = $assignedStaffId ? $this->getUserDepartmentId($assignedStaffId) : null;

                $createdAtRaw = $data['created_at'] ?? null;
                $createdAt = $this->parseDateTime($createdAtRaw);
                if ($this->hasText($createdAtRaw) && ! $createdAt) {
                    $this->pushWarning($report, $rowNumber, 'Ngày tạo không hợp lệ, hệ thống để trống.');
                }

                $normalizedPhone = $this->normalizePhoneForStorage($data['phone'] ?? null);
                if ($this->hasText($data['phone'] ?? null) && ! $normalizedPhone) {
                    $this->pushWarning($report, $rowNumber, 'Số điện thoại không hợp lệ, hệ thống để trống.');
                }

                $payload = [
                    'name' => $data['name'],
                    'external_code' => $data['external_code'] ?? null,
                    'company' => $data['company'] ?? null,
                    'email' => $this->normalizeEmailForStorage($data['email'] ?? null),
                    'phone' => $normalizedPhone,
                    'notes' => $data['notes'] ?? null,
                    'lead_type_id' => $leadTypeId,
                    'sales_owner_id' => $salesOwnerId,
                    'assigned_staff_id' => $assignedStaffId,
                    'assigned_department_id' => $assignedDepartmentId,
                    'lead_source' => $data['lead_source'] ?? null,
                    'lead_channel' => $data['lead_channel'] ?? null,
                    'lead_message' => $data['lead_message'] ?? null,
                    'customer_status_label' => $statusLabel,
                    'customer_level' => $data['customer_level'] ?? null,
                    'company_size' => $data['company_size'] ?? null,
                    'product_categories' => $data['product_categories'] ?? null,
                ];

                $client = $this->findClientByIdentity(
                    $data['name'],
                    $normalizedPhone,
                    $payload['email'] ?? null,
                    $data['external_code'] ?? null
                );

                if ($client) {
                    $client->update($this->filterNullValues($payload));
                    if ($createdAt && empty($client->created_at)) {
                        $client->timestamps = false;
                        $client->created_at = $createdAt;
                        $client->save();
                        $client->timestamps = true;
                    }
                    $report['updated']++;
                } else {
                    if (empty($payload['lead_type_id'])) {
                        $payload['lead_type_id'] = $this->resolveLeadTypeId('Khách hàng tiềm năng');
                    }
                    $client = Client::create($this->filterNullValues($payload));
                    if ($createdAt) {
                        $client->timestamps = false;
                        $client->created_at = $createdAt;
                        $client->updated_at = $createdAt;
                        $client->save();
                        $client->timestamps = true;
                    }
                    $report['created']++;
                }

                $careStaffIds = array_values(array_filter([
                    $assignedStaffId ? (int) $assignedStaffId : null,
                    $salesOwnerId ? (int) $salesOwnerId : null,
                ]));
                $this->syncClientCareStaffFromImport($client, $careStaffIds, (int) $user->id);
                $this->clientFinancialSyncService->sync($client->fresh());

                DB::commit();
            } catch (\Throwable $e) {
                DB::rollBack();
                $this->skipRow($report, $rowNumber, 'Lỗi xử lý: ' . $e->getMessage());
            }

            $this->syncJobProgress($job, $processed, $report);
        });

        $this->syncJobProgress($job, $processed, $report, true);

        return $this->finalizeReport($report);
    }

    public function importTasksFromPath(string $path, User $user, ?DataTransferJob $job = null): array
    {
        $report = $this->initReport();
        $processed = 0;
        $touchedProjectIds = [];

        $this->iterateMappedRows($path, $this->taskHeaderMap(), function (array $data, int $rowNumber) use (&$report, &$processed, &$touchedProjectIds, $user, $job) {
            $processed++;

            if (empty($data['title'])) {
                $this->skipRow($report, $rowNumber, 'Thiếu tên công việc.');
                $this->syncJobProgress($job, $processed, $report);
                return;
            }

            try {
                DB::beginTransaction();

                $client = $this->resolveOrCreateClientForTask($data, $user);
                $project = $this->resolveProjectForTaskImport($data, $client, $user);
                if (! $project) {
                    $this->skipRow($report, $rowNumber, 'Không xác định được dự án cho công việc.');
                    DB::rollBack();
                    $this->syncJobProgress($job, $processed, $report);
                    return;
                }

                $description = $data['description'] ?? null;
                if (! empty($data['comments'])) {
                    $description = trim((string) $description);
                    $description = trim($description . ($description !== '' ? "\n\n" : '') . 'Ghi chú import: ' . $data['comments']);
                }

                $assigneeRaw = $data['assignee'] ?? null;
                $assigneeId = $this->resolveUserId($assigneeRaw);
                if ($this->hasText($assigneeRaw) && ! $assigneeId) {
                    $this->pushWarning($report, $rowNumber, 'Không tìm thấy người thực hiện "' . trim((string) $assigneeRaw) . '", hệ thống để trống.');
                }

                $identity = Task::query()
                    ->where('project_id', $project->id)
                    ->where('title', $data['title']);

                if (! empty($data['start_at'])) {
                    $parsedStart = $this->parseDateTime($data['start_at']);
                    if ($parsedStart) {
                        $identity->whereDate('start_at', Carbon::parse($parsedStart)->format('Y-m-d'));
                    }
                }

                $task = $identity->first();
                $startAt = $this->parseDateTime($data['start_at'] ?? null);
                if ($this->hasText($data['start_at'] ?? null) && ! $startAt) {
                    $this->pushWarning($report, $rowNumber, 'Ngày bắt đầu công việc không hợp lệ, hệ thống để trống.');
                }

                $deadline = $this->parseDateTime($data['deadline'] ?? null);
                if ($this->hasText($data['deadline'] ?? null) && ! $deadline) {
                    $this->pushWarning($report, $rowNumber, 'Deadline công việc không hợp lệ, hệ thống để trống.');
                }

                $payload = [
                    'project_id' => $project->id,
                    'department_id' => $assigneeId ? $this->getUserDepartmentId($assigneeId) : null,
                    'title' => $data['title'],
                    'description' => $description,
                    'priority' => $this->normalizeTaskPriority($data['priority'] ?? 'medium'),
                    'status' => $this->normalizeTaskStatus($data['status'] ?? 'todo'),
                    'start_at' => $startAt,
                    'deadline' => $deadline,
                    'created_by' => $user->id,
                    'assigned_by' => $user->id,
                    'assignee_id' => $assigneeId,
                    'require_acknowledgement' => false,
                    'acknowledged_at' => $assigneeId ? now() : null,
                    'weight_percent' => 100,
                ];

                if ($task) {
                    $task->update($this->filterNullValues($payload));
                    $report['updated']++;
                } else {
                    Task::create($payload);
                    $report['created']++;
                }

                $touchedProjectIds[$project->id] = $project->id;

                DB::commit();
            } catch (\Throwable $e) {
                DB::rollBack();
                $this->skipRow($report, $rowNumber, 'Lỗi xử lý: ' . $e->getMessage());
            }

            $this->syncJobProgress($job, $processed, $report);
        });

        if (! empty($touchedProjectIds)) {
            Project::query()
                ->whereIn('id', array_values($touchedProjectIds))
                ->get()
                ->each(function (Project $project) {
                    try {
                        ProjectProgressService::recalc($project);
                    } catch (\Throwable $e) {
                        report($e);
                    }
                });
        }

        $this->syncJobProgress($job, $processed, $report, true);

        return $this->finalizeReport($report);
    }

    public function importUsersFromPath(string $path, User $user, ?DataTransferJob $job = null): array
    {
        $report = $this->initReport();
        $processed = 0;

        $this->iterateMappedRows($path, $this->userHeaderMap(), function (array $data, int $rowNumber) use (&$report, &$processed, $job) {
            $processed++;

            if (empty($data['name'])) {
                $this->skipRow($report, $rowNumber, 'Thiếu họ tên nhân viên.');
                $this->syncJobProgress($job, $processed, $report);
                return;
            }

            if (empty($data['email'])) {
                $this->skipRow($report, $rowNumber, 'Thiếu email nhân viên.');
                $this->syncJobProgress($job, $processed, $report);
                return;
            }

            try {
                DB::beginTransaction();

                $departmentName = $data['department_name'] ?? null;
                $departmentId = $departmentName ? $this->resolveOrCreateDepartmentId($departmentName) : null;
                $password = $data['password'] ?? null;
                if (! $password) {
                    $password = ! empty($data['phone']) ? preg_replace('/\s+/', '', (string) $data['phone']) : 'clickon123';
                    $this->pushWarning($report, $rowNumber, 'Thiếu mật khẩu, hệ thống dùng mật khẩu mặc định cho dòng import này.');
                }

                $payload = [
                    'name' => $data['name'],
                    'email' => Str::lower((string) $data['email']),
                    'password' => Hash::make((string) $password),
                    'role' => $this->normalizeUserRole($data['role'] ?? null),
                    'department' => $departmentName,
                    'department_id' => $departmentId,
                    'phone' => $this->normalizePhoneForStorage($data['phone'] ?? null),
                    'workload_capacity' => $this->parseInteger($data['workload_capacity'] ?? null) ?: 100,
                    'is_active' => $this->normalizeUserActive($data['status'] ?? null),
                ];

                $user = User::query()->where('email', Str::lower((string) $data['email']))->first();
                if ($user) {
                    if (empty($data['password'])) {
                        unset($payload['password']);
                    }
                    $user->update($payload);
                    $report['updated']++;
                } else {
                    User::create($payload);
                    $report['created']++;
                }

                DB::commit();
            } catch (\Throwable $e) {
                DB::rollBack();
                $this->skipRow($report, $rowNumber, 'Lỗi xử lý: ' . $e->getMessage());
            }

            $this->syncJobProgress($job, $processed, $report);
        });

        $this->syncJobProgress($job, $processed, $report, true);

        return $this->finalizeReport($report);
    }

    public function importContractsFromPath(string $path, User $user, ?DataTransferJob $job = null): array
    {
        $report = $this->initReport();
        $processed = 0;

        $this->iterateMappedRows($path, $this->contractHeaderMap(), function (array $data, int $rowNumber) use (&$report, &$processed, $user, $job) {
            $processed++;
            $code = $data['code'] ?? null;
            $clientName = $data['client_name'] ?? null;

            if (! $code) {
                $this->skipRow($report, $rowNumber, 'Thiếu số hợp đồng.');
                $this->syncJobProgress($job, $processed, $report);
                return;
            }

            if (! $clientName) {
                $this->skipRow($report, $rowNumber, 'Thiếu tên khách hàng.');
                $this->syncJobProgress($job, $processed, $report);
                return;
            }

            try {
                DB::beginTransaction();

                $collectorNameRaw = $data['collector_name'] ?? null;
                $collectorId = $this->resolveUserId($collectorNameRaw);
                if ($this->hasText($collectorNameRaw) && ! $collectorId) {
                    $this->pushWarning($report, $rowNumber, 'Không tìm thấy người quản lý hợp đồng "' . trim((string) $collectorNameRaw) . '", hệ thống để trống.');
                }

                $client = $this->resolveOrCreateClientForContract($data, $collectorId);
                $this->syncClientCareStaffFromImport($client, [$collectorId], (int) $user->id);

                $status = $this->normalizeContractStatus($data['status'] ?? '');
                $approval = $this->resolveApproval($user);
                $valueRaw = $data['value'] ?? null;
                $value = $this->parseNumber($valueRaw);
                if ($this->hasText($valueRaw) && $value === null) {
                    $this->pushWarning($report, $rowNumber, 'Giá trị hợp đồng không hợp lệ, hệ thống để trống.');
                }

                $debtRaw = $data['debt'] ?? null;
                $debt = $this->parseNumber($debtRaw);
                if ($this->hasText($debtRaw) && $debt === null) {
                    $this->pushWarning($report, $rowNumber, 'Số tiền chưa thanh toán không hợp lệ, hệ thống để trống.');
                }

                $signedAt = $this->parseDate($data['signed_at'] ?? null);
                if ($this->hasText($data['signed_at'] ?? null) && ! $signedAt) {
                    $this->pushWarning($report, $rowNumber, 'Ngày ký không hợp lệ, hệ thống để trống.');
                }
                $startDate = $this->parseDate($data['start_date'] ?? null);
                if ($this->hasText($data['start_date'] ?? null) && ! $startDate) {
                    $this->pushWarning($report, $rowNumber, 'Ngày bắt đầu không hợp lệ, hệ thống để trống.');
                }
                $endDate = $this->parseDate($data['end_date'] ?? null);
                if ($this->hasText($data['end_date'] ?? null) && ! $endDate) {
                    $this->pushWarning($report, $rowNumber, 'Ngày kết thúc không hợp lệ, hệ thống để trống.');
                }

                $durationMonths = $this->parseInteger($data['duration_months'] ?? null);
                if ($this->hasText($data['duration_months'] ?? null) && $durationMonths === null) {
                    $this->pushWarning($report, $rowNumber, 'Số tháng không hợp lệ, hệ thống để trống.');
                }

                $importedPaidPeriods = $this->parseInteger($data['collected_periods'] ?? null);
                if ($this->hasText($data['collected_periods'] ?? null) && $importedPaidPeriods === null) {
                    $this->pushWarning($report, $rowNumber, 'Kỳ đã thu không hợp lệ, hệ thống để trống.');
                } elseif ($importedPaidPeriods !== null && $importedPaidPeriods > 480) {
                    $importedPaidPeriods = null;
                    $this->pushWarning($report, $rowNumber, 'Kỳ đã thu vượt ngưỡng hợp lệ, hệ thống để trống.');
                }

                $paidTotal = $value !== null
                    ? max(0, min($value, $value - max(0, (float) ($debt ?: 0))))
                    : null;

                $payload = [
                    'title' => $this->buildImportedContractTitle($data),
                    'contract_type' => $data['contract_type'] ?? null,
                    'client_id' => $client->id,
                    'value' => $value,
                    'status' => $status,
                    'approval_status' => $approval['approval_status'],
                    'approved_by' => $approval['approved_by'],
                    'approved_at' => $approval['approved_at'],
                    'signed_at' => $signedAt,
                    'start_date' => $startDate,
                    'end_date' => $endDate,
                    'notes' => $data['notes'] ?? null,
                    'created_by' => $user->id,
                    'collector_user_id' => $collectorId,
                    'care_schedule' => $data['care_schedule'] ?? null,
                    'duration_months' => $durationMonths,
                    'payment_cycle' => $data['payment_cycle'] ?? null,
                    'imported_paid_periods' => $importedPaidPeriods,
                ];

                $contract = Contract::query()->where('code', $code)->first();
                if ($contract) {
                    $contract->update($this->filterNullValues($payload));
                    $report['updated']++;
                } else {
                    $contract = Contract::create(array_merge($payload, [
                        'code' => $code,
                    ]));
                    $report['created']++;
                }

                $product = $this->resolveOrCreateProduct(
                    $data['product_code'] ?? null,
                    $data['product_name'] ?? null,
                    $data['unit'] ?? null,
                    $this->parseNumber($data['unit_price'] ?? null)
                );

                $quantity = $this->parseInteger($data['quantity'] ?? null);
                if ($this->hasText($data['quantity'] ?? null) && $quantity === null) {
                    $this->pushWarning($report, $rowNumber, 'Số lượng không hợp lệ, hệ thống mặc định 1.');
                }
                $quantity = $quantity ?: 1;

                $unitPrice = $this->parseNumber($data['unit_price'] ?? null);
                if ($this->hasText($data['unit_price'] ?? null) && $unitPrice === null) {
                    $this->pushWarning($report, $rowNumber, 'Đơn giá không hợp lệ, hệ thống mặc định 0.');
                }
                $unitPrice = $unitPrice ?: 0;

                $discountAmount = $this->parseNumber($data['discount_amount'] ?? null);
                if ($this->hasText($data['discount_amount'] ?? null) && $discountAmount === null) {
                    $this->pushWarning($report, $rowNumber, 'Giảm giá không hợp lệ, hệ thống mặc định 0.');
                }
                $discountAmount = $discountAmount ?: 0;

                $vatAmount = $this->parseNumber($data['vat_amount'] ?? null);
                if ($this->hasText($data['vat_amount'] ?? null) && $vatAmount === null) {
                    $this->pushWarning($report, $rowNumber, 'VAT không hợp lệ, hệ thống mặc định 0.');
                }
                $vatAmount = $vatAmount ?: 0;

                $itemTotal = $this->parseNumber($data['value'] ?? null);
                if ($itemTotal === null) {
                    $itemTotal = max(0, ($unitPrice * $quantity) - $discountAmount + $vatAmount);
                }

                if (! empty($data['product_name']) || ! empty($data['product_code'])) {
                    $itemIdentity = [
                        'contract_id' => $contract->id,
                        'product_code' => $data['product_code'] ?? null,
                        'product_name' => $data['product_name'] ?: ($product ? $product->name : 'Sản phẩm import'),
                    ];

                    ContractItem::query()->updateOrCreate(
                        $itemIdentity,
                        [
                            'product_id' => $product ? $product->id : null,
                            'unit' => $data['unit'] ?? ($product ? $product->unit : null),
                            'unit_price' => $unitPrice,
                            'quantity' => $quantity,
                            'discount_amount' => $discountAmount,
                            'vat_amount' => $vatAmount,
                            'total_price' => $itemTotal,
                            'note' => $this->composeImportedContractItemNote($data),
                        ]
                    );
                }

                $paymentNote = 'Import Excel: tổng đã thu';
                if ($paidTotal !== null && $paidTotal > 0) {
                    $paidAt = $this->parseDate($data['signed_at'] ?? $data['start_date'] ?? null);
                    $payment = ContractPayment::query()
                        ->firstOrNew([
                            'contract_id' => $contract->id,
                            'note' => $paymentNote,
                        ]);
                    $payment->fill([
                        'amount' => $paidTotal,
                        'paid_at' => $paidAt,
                        'method' => 'import_excel',
                        'created_by' => $user->id,
                    ]);
                    $payment->save();
                }

                $contract->refreshFinancials();
                if ($contract->client) {
                    $this->clientFinancialSyncService->sync($contract->client);
                }

                DB::commit();
            } catch (\Throwable $e) {
                DB::rollBack();
                $this->skipRow($report, $rowNumber, 'Lỗi xử lý: ' . $e->getMessage());
            }

            $this->syncJobProgress($job, $processed, $report);
        });

        $this->syncJobProgress($job, $processed, $report, true);

        return $this->finalizeReport($report);
    }

    private function syncJobProgress(?DataTransferJob $job, int $processed, array $report, bool $force = false): void
    {
        if (! $job) {
            return;
        }

        if (! $force && $processed % 25 !== 0) {
            return;
        }

        $job->forceFill([
            'processed_rows' => $processed,
            'successful_rows' => (int) ($report['created'] ?? 0) + (int) ($report['updated'] ?? 0),
            'failed_rows' => (int) ($report['skipped'] ?? 0),
            'report' => $this->finalizeReport($report),
        ])->save();
    }

    private function iterateMappedRows(string $path, array $patterns, callable $handler): void
    {
        $spreadsheet = $this->loadSpreadsheet($path);
        /** @var Worksheet|null $sheet */
        $sheet = $spreadsheet->getSheet(0);

        if (! $sheet) {
            throw new \RuntimeException('Không đọc được sheet đầu tiên.');
        }

        $rows = $sheet->toArray(null, true, true, false);
        if (count($rows) < 2) {
            return;
        }

        $headerRow = array_shift($rows);
        if (! is_array($headerRow)) {
            return;
        }

        $headerMap = $this->buildHeaderMap($headerRow, $patterns);
        if (empty($headerMap)) {
            throw new \RuntimeException('Không nhận diện được cột dữ liệu trong file import.');
        }

        $rowNumber = 2;
        foreach ($rows as $row) {
            if (! is_array($row)) {
                $rowNumber++;
                continue;
            }

            $data = [];
            foreach ($headerMap as $index => $field) {
                $data[$field] = $row[$index] ?? null;
            }

            $allEmpty = collect($data)->every(function ($value) {
                return trim((string) ($value ?? '')) === '';
            });

            if (! $allEmpty) {
                $handler($data, $rowNumber);
            }

            $rowNumber++;
        }
    }

    private function loadSpreadsheet(string $path)
    {
        $extension = Str::lower(pathinfo($path, PATHINFO_EXTENSION));

        if ($extension === 'csv') {
            $reader = IOFactory::createReader('Csv');
            $reader->setInputEncoding('UTF-8');
            $reader->setDelimiter(',');
            $reader->setEnclosure('"');
            $reader->setSheetIndex(0);
            return $reader->load($path);
        }

        return IOFactory::load($path);
    }

    private function buildHeaderMap(array $headerRow, array $patterns): array
    {
        $map = [];
        foreach ($headerRow as $index => $heading) {
            $normalized = $this->normalizeHeader($heading);
            if ($normalized === '') {
                continue;
            }

            foreach ($patterns as $pattern => $field) {
                if ($normalized === $pattern) {
                    $map[$index] = $field;
                    break;
                }
            }
        }

        return $map;
    }

    private function normalizeHeader($value): string
    {
        $value = Str::lower(Str::ascii(trim((string) ($value ?? ''))));
        $value = preg_replace('/[^a-z0-9]+/', '', $value);
        return $value ?: '';
    }

    private function parseNumber($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        $normalized = str_replace([' ', "\xc2\xa0"], '', trim((string) $value));
        $normalized = str_replace(['VND', 'VNĐ', 'đ', '$'], '', $normalized);

        $hasComma = str_contains($normalized, ',');
        $hasDot = str_contains($normalized, '.');

        if ($hasComma && $hasDot) {
            if (strrpos($normalized, ',') > strrpos($normalized, '.')) {
                $normalized = str_replace('.', '', $normalized);
                $normalized = str_replace(',', '.', $normalized);
            } else {
                $normalized = str_replace(',', '', $normalized);
            }
        } elseif ($hasComma) {
            $parts = explode(',', $normalized);
            $normalized = count($parts) > 2 || (count($parts) === 2 && strlen($parts[1]) === 3)
                ? str_replace(',', '', $normalized)
                : str_replace(',', '.', $normalized);
        } elseif ($hasDot) {
            $parts = explode('.', $normalized);
            if (count($parts) > 2 || (count($parts) === 2 && strlen($parts[1]) === 3)) {
                $normalized = str_replace('.', '', $normalized);
            }
        }

        $normalized = preg_replace('/[^0-9.\-]/', '', $normalized);

        return is_numeric($normalized) ? (float) $normalized : null;
    }

    private function parseInteger($value): ?int
    {
        $number = $this->parseNumber($value);
        return $number === null ? null : (int) round($number);
    }

    private function parseDate($value): ?string
    {
        $dateTime = $this->parseDateTime($value);
        return $dateTime ? Carbon::parse($dateTime)->format('Y-m-d') : null;
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

            $normalized = trim((string) $value);
            $normalized = preg_replace('/\s+-\s+/', ' ', $normalized);
            $normalized = preg_replace('/(\d{1,2})h(\d{1,2})/i', '$1:$2', $normalized);
            $normalized = preg_replace('/\s+/', ' ', $normalized);

            $formats = [
                'd/m/Y H:i',
                'd/m/Y H:i:s',
                'd/m/Y',
                'Y-m-d H:i:s',
                'Y-m-d H:i',
                'Y-m-d',
            ];

            foreach ($formats as $format) {
                try {
                    $date = Carbon::createFromFormat($format, $normalized);
                    if ($date) {
                        return $date->format('Y-m-d H:i:s');
                    }
                } catch (\Throwable) {
                }
            }

            return Carbon::parse($normalized)->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return null;
        }
    }

    private function clientHeaderMap(): array
    {
        return [
            'tenkhachhang' => 'name',
            'makhachhang' => 'external_code',
            'nguonkhachhang' => 'lead_channel',
            'nguonkhach' => 'lead_source',
            'loaikhachhang' => 'lead_type_name',
            'email' => 'email',
            'dienthoai' => 'phone',
            'sodienthoai' => 'phone',
            'sdt' => 'phone',
            'ghichu' => 'notes',
            'tinhtrang' => 'customer_status_label',
            'nguoiquanly' => 'manager_name',
            'cap' => 'customer_level',
            'congno' => 'legacy_debt_amount',
            'ngaytao' => 'created_at',
            'nguoitheodoi' => 'watcher_name',
            'quymocongty' => 'company_size',
            'danhmucsanpham' => 'product_categories',
            'doanhsoluyke' => 'total_revenue',
            'noidung' => 'lead_message',
            'company' => 'company',
        ];
    }

    private function contractHeaderMap(): array
    {
        return [
            'sohopdong' => 'code',
            'khachhang' => 'client_name',
            'makhachhang' => 'client_code',
            'loaihopdong' => 'contract_type',
            'loaikhopdong' => 'contract_type',
            'ngayky' => 'signed_at',
            'ngayketthuc' => 'end_date',
            'masanpham' => 'product_code',
            'sanpham' => 'product_name',
            'dongia' => 'unit_price',
            'soluong' => 'quantity',
            'donvitinh' => 'unit',
            'giamgia' => 'discount_amount',
            'vat' => 'vat_amount',
            'lichchamsoc' => 'care_schedule',
            'sothang' => 'duration_months',
            'kythanhtoan' => 'payment_cycle',
            'ngaybatdau' => 'start_date',
            'giatrihopdong' => 'value',
            'chuathanhtoan' => 'debt',
            'trangthai' => 'status',
            'nguoiquanly' => 'collector_name',
            'kydathu' => 'collected_periods',
            'ghichu' => 'notes',
            'dienthoai' => 'phone',
            'sodienthoai' => 'phone',
        ];
    }

    private function taskHeaderMap(): array
    {
        return [
            'tencongviec' => 'title',
            'khachhang' => 'client_name',
            'duan' => 'project_name',
            'loaidichvu' => 'service_type',
            'dichvu' => 'service_type',
            'ngaybatdau' => 'start_at',
            'deadline' => 'deadline',
            'noidung' => 'description',
            'comments' => 'comments',
            'trangthai' => 'status',
            'nguoithuchien' => 'assignee',
            'nguoiphutrach' => 'assignee',
        ];
    }

    private function userHeaderMap(): array
    {
        return [
            'hoten' => 'name',
            'tennhanvien' => 'name',
            'email' => 'email',
            'matkhau' => 'password',
            'vaitro' => 'role',
            'phongban' => 'department_name',
            'sodienthoai' => 'phone',
            'dienthoai' => 'phone',
            'tailuongcongviec' => 'workload_capacity',
            'taitrongcongviec' => 'workload_capacity',
            'trangthai' => 'status',
        ];
    }

    private function initReport(): array
    {
        return [
            'created' => 0,
            'updated' => 0,
            'skipped' => 0,
            'errors' => [],
            'warnings' => [],
        ];
    }

    private function prepareImportRuntime(): void
    {
        DB::disableQueryLog();
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }
        @ini_set('memory_limit', '1024M');
    }

    private function finalizeReport(array $report): array
    {
        $report['total'] = $report['created'] + $report['updated'] + $report['skipped'];
        return $report;
    }

    private function skipRow(array &$report, int $rowNumber, string $message): void
    {
        $report['skipped']++;
        if (count($report['errors']) < 100) {
            $report['errors'][] = [
                'row' => $rowNumber,
                'message' => $message,
            ];
        }
    }

    private function pushWarning(array &$report, int $rowNumber, string $message): void
    {
        if (count($report['warnings']) < 100) {
            $report['warnings'][] = [
                'row' => $rowNumber,
                'message' => $message,
            ];
        }
    }

    private function filterNullValues(array $payload, array $keepNull = []): array
    {
        return array_filter($payload, function ($value, $key) use ($keepNull) {
            if (in_array($key, $keepNull, true)) {
                return true;
            }

            return $value !== null && $value !== '';
        }, ARRAY_FILTER_USE_BOTH);
    }

    private function findClientByIdentity(string $name, ?string $phone, ?string $email, ?string $externalCode): ?Client
    {
        $query = Client::query();
        $name = trim($name);
        $externalCode = $externalCode ? trim((string) $externalCode) : null;
        $normalizedPhone = $this->normalizePhoneForStorage($phone);
        $normalizedEmail = $this->normalizeEmailForStorage($email);

        if ($externalCode) {
            $client = (clone $query)->where('external_code', $externalCode)->first();
            if ($client) {
                return $client;
            }
        }

        if ($normalizedPhone) {
            $client = (clone $query)->where('phone', $normalizedPhone)->first();
            if ($client) {
                return $client;
            }
        }

        if ($normalizedEmail) {
            $client = (clone $query)->where('email', $normalizedEmail)->first();
            if ($client) {
                return $client;
            }
        }

        return (clone $query)->where('name', $name)->first();
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

    private function buildImportedContractTitle(array $data): string
    {
        if (! empty($data['title'])) {
            return $data['title'];
        }

        $parts = [];
        if (! empty($data['product_name'])) {
            $parts[] = $data['product_name'];
        }
        if (! empty($data['client_name'])) {
            $parts[] = $data['client_name'];
        }
        if (empty($parts) && ! empty($data['code'])) {
            $parts[] = 'Hợp đồng ' . $data['code'];
        }

        return implode(' • ', $parts);
    }

    private function composeImportedContractItemNote(array $data): ?string
    {
        $notes = [];
        if (! empty($data['contract_type'])) {
            $notes[] = 'Loại hợp đồng: ' . $data['contract_type'];
        }
        if (! empty($data['care_schedule'])) {
            $notes[] = 'Lịch chăm sóc: ' . $data['care_schedule'];
        }
        if (! empty($data['notes'])) {
            $notes[] = 'Ghi chú: ' . $data['notes'];
        }

        return empty($notes) ? null : implode(' | ', $notes);
    }

    private function resolveLeadTypeId(?string $value): ?int
    {
        if (! $value) {
            return null;
        }

        $key = $this->normalizeHeader($value);
        if (isset($this->leadTypeCacheByName[$key])) {
            return $this->leadTypeCacheByName[$key];
        }

        $leadType = LeadType::query()->get()->first(function ($item) use ($key) {
            return $this->normalizeHeader($item->name) === $key;
        });

        if (! $leadType) {
            $leadType = LeadType::create([
                'name' => trim((string) $value),
                'color_hex' => '#94A3B8',
                'sort_order' => (int) LeadType::query()->max('sort_order') + 1,
            ]);
        }

        $this->leadTypeCacheByName[$key] = (int) $leadType->id;

        return (int) $leadType->id;
    }

    private function resolveRevenueTierId(float $totalRevenue): ?int
    {
        if ($totalRevenue <= 0) {
            return null;
        }

        $tier = RevenueTier::query()
            ->orderByDesc('min_amount')
            ->get()
            ->first(function ($item) use ($totalRevenue) {
                return $totalRevenue >= (float) $item->min_amount;
            });

        return $tier ? (int) $tier->id : null;
    }

    private function resolveUserId(?string $value): ?int
    {
        if (! $value) {
            return null;
        }

        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        $this->bootUserCache();

        $emailKey = Str::lower($value);
        if (isset($this->userCacheByEmail[$emailKey])) {
            return $this->userCacheByEmail[$emailKey];
        }

        $nameKey = $this->normalizeHeader($value);
        if (isset($this->userCacheByName[$nameKey])) {
            return $this->userCacheByName[$nameKey];
        }

        foreach ($this->users as $user) {
            $normalizedName = $this->normalizeHeader($user['name']);
            if (strpos($normalizedName, $nameKey) !== false || strpos($nameKey, $normalizedName) !== false) {
                $this->userCacheByName[$nameKey] = (int) $user['id'];
                return (int) $user['id'];
            }
        }

        return null;
    }

    private function bootUserCache(): void
    {
        if (! empty($this->users)) {
            return;
        }

        $this->users = User::query()
            ->select(['id', 'name', 'email', 'department_id'])
            ->get()
            ->map(function ($user) {
                return [
                    'id' => (int) $user->id,
                    'name' => (string) $user->name,
                    'email' => Str::lower((string) $user->email),
                    'department_id' => $user->department_id ? (int) $user->department_id : null,
                ];
            })
            ->all();

        foreach ($this->users as $user) {
            $this->userCacheByEmail[$user['email']] = (int) $user['id'];
            $this->userCacheByName[$this->normalizeHeader($user['name'])] = (int) $user['id'];
        }
    }

    private function getUserDepartmentId(?int $userId): ?int
    {
        if (! $userId) {
            return null;
        }

        $this->bootUserCache();
        foreach ($this->users as $user) {
            if ((int) $user['id'] === (int) $userId) {
                return $user['department_id'] ?: null;
            }
        }

        return null;
    }

    private function resolveOrCreateDepartmentId(string $departmentName): int
    {
        $departmentName = trim($departmentName);
        $key = $this->normalizeHeader($departmentName);

        if (isset($this->departmentCacheByName[$key])) {
            return $this->departmentCacheByName[$key];
        }

        $department = Department::query()->get()->first(function ($item) use ($key) {
            return $this->normalizeHeader($item->name) === $key;
        });

        if (! $department) {
            $department = Department::create([
                'name' => $departmentName,
                'manager_id' => null,
            ]);
        }

        $this->departmentCacheByName[$key] = (int) $department->id;

        return (int) $department->id;
    }

    private function resolveOrCreateClientForContract(array $data, ?int $collectorId): Client
    {
        $phone = $this->normalizePhoneForStorage($data['phone'] ?? null);
        $client = $this->findClientByIdentity(
            $data['client_name'],
            $phone,
            null,
            $data['client_code'] ?? null
        );

        $payload = [
            'name' => $data['client_name'],
            'external_code' => $data['client_code'] ?? null,
            'phone' => $phone,
            'assigned_staff_id' => $collectorId,
            'sales_owner_id' => $collectorId,
            'assigned_department_id' => $collectorId ? $this->getUserDepartmentId($collectorId) : null,
        ];

        if ($client) {
            $client->update($this->filterNullValues($payload));
            return $client->fresh();
        }

        $payload['lead_type_id'] = $this->resolveLeadTypeId('Khách hàng tiềm năng');

        return Client::create($payload);
    }

    private function resolveOrCreateProduct(?string $code, ?string $name, ?string $unit, ?float $unitPrice): ?Product
    {
        if (! $code && ! $name) {
            return null;
        }

        if ($code) {
            $cacheKey = Str::lower($code);
            if (isset($this->productCacheByCode[$cacheKey])) {
                return Product::find($this->productCacheByCode[$cacheKey]);
            }
        }

        if ($name) {
            $cacheKey = $this->normalizeHeader($name);
            if (isset($this->productCacheByName[$cacheKey])) {
                return Product::find($this->productCacheByName[$cacheKey]);
            }
        }

        $product = null;
        if ($code) {
            $product = Product::query()->where('code', $code)->first();
        }
        if (! $product && $name) {
            $product = Product::query()->where('name', $name)->first();
        }

        if (! $product) {
            $product = Product::create([
                'code' => $code,
                'name' => $name ?: $code,
                'unit' => $unit,
                'unit_price' => $unitPrice ?: 0,
                'is_active' => true,
            ]);
        } else {
            $product->update($this->filterNullValues([
                'name' => $name ?: $product->name,
                'unit' => $unit ?: $product->unit,
                'unit_price' => $unitPrice !== null ? $unitPrice : $product->unit_price,
            ], ['unit_price']));
        }

        if ($code) {
            $this->productCacheByCode[Str::lower($code)] = (int) $product->id;
        }
        if ($name) {
            $this->productCacheByName[$this->normalizeHeader($name)] = (int) $product->id;
        }

        return $product;
    }

    private function resolveOrCreateClientForTask(array $data, User $user): ?Client
    {
        if (empty($data['client_name'])) {
            return null;
        }

        $client = $this->findClientByIdentity($data['client_name'], null, null, null);
        if ($client) {
            return $client;
        }

        return Client::create([
            'name' => $data['client_name'],
            'lead_type_id' => $this->resolveLeadTypeId('Khách hàng tiềm năng'),
            'assigned_staff_id' => $user->role === 'nhan_vien' ? $user->id : null,
            'sales_owner_id' => $user->role === 'nhan_vien' ? $user->id : null,
            'assigned_department_id' => $user->department_id ?: null,
            'lead_source' => 'import_excel',
            'lead_channel' => 'task_import',
        ]);
    }

    private function resolveProjectForTaskImport(array $data, ?Client $client, User $user): ?Project
    {
        if (! empty($data['project_name'])) {
            $project = Project::query()->where('name', $data['project_name'])->first();
            if ($project) {
                return $project;
            }
        }

        if ($client) {
            $existing = Project::query()
                ->where('client_id', $client->id)
                ->orderByDesc('id')
                ->first();
            if ($existing) {
                return $existing;
            }
        }

        $name = ! empty($data['project_name'])
            ? $data['project_name']
            : ($client ? 'CRM Import - ' . $client->name : 'CRM Import');

        return Project::create([
            'code' => $this->generateProjectCode(),
            'name' => $name,
            'client_id' => $client ? $client->id : null,
            'service_type' => 'khac',
            'service_type_other' => ! empty($data['service_type']) ? $data['service_type'] : 'CRM Import',
            'status' => 'moi_tao',
            'handover_status' => 'chua_ban_giao',
            'created_by' => $user->id,
        ]);
    }

    private function normalizeContractStatus(string $value): string
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($value))) ?: '';

        if ($key === '') {
            return 'draft';
        }
        if (strpos($key, 'hoanthanh') !== false || strpos($key, 'success') !== false || strpos($key, 'thanhcong') !== false) {
            return 'success';
        }
        if (strpos($key, 'dangthuchien') !== false || strpos($key, 'danghieuluc') !== false || strpos($key, 'active') !== false) {
            return 'active';
        }
        if (strpos($key, 'daky') !== false || strpos($key, 'signed') !== false) {
            return 'signed';
        }
        if (strpos($key, 'hethan') !== false || strpos($key, 'expired') !== false) {
            return 'expired';
        }
        if (strpos($key, 'huy') !== false || strpos($key, 'cancel') !== false || strpos($key, 'tamdung') !== false) {
            return 'cancelled';
        }

        return 'draft';
    }

    private function normalizeTaskStatus(string $value): string
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($value))) ?: '';

        if (strpos($key, 'doing') !== false || strpos($key, 'danglam') !== false || strpos($key, 'dangthuchien') !== false) {
            return 'doing';
        }
        if (strpos($key, 'done') !== false || strpos($key, 'hoanthanh') !== false) {
            return 'done';
        }
        if (strpos($key, 'blocked') !== false || strpos($key, 'bichan') !== false || strpos($key, 'tamdung') !== false) {
            return 'blocked';
        }

        return 'todo';
    }

    private function normalizeTaskPriority(string $value): string
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($value))) ?: '';

        if (strpos($key, 'urgent') !== false || strpos($key, 'khancap') !== false) {
            return 'urgent';
        }
        if (strpos($key, 'high') !== false || strpos($key, 'cao') !== false) {
            return 'high';
        }
        if (strpos($key, 'low') !== false || strpos($key, 'thap') !== false) {
            return 'low';
        }

        return 'medium';
    }

    private function normalizeUserRole(?string $value): string
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii((string) $value))) ?: '';

        if (in_array($key, ['administrator', 'adminsystem'], true)) {
            return 'administrator';
        }
        if (in_array($key, ['admin', 'quantricongty'], true)) {
            return 'admin';
        }
        if (strpos($key, 'quanly') !== false || strpos($key, 'manager') !== false || strpos($key, 'truongphong') !== false) {
            return 'quan_ly';
        }
        if (strpos($key, 'ketoan') !== false || strpos($key, 'accountant') !== false) {
            return 'ke_toan';
        }

        return 'nhan_vien';
    }

    private function normalizeUserActive(?string $value): bool
    {
        $key = preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii((string) $value))) ?: '';

        if (in_array($key, ['0', 'inactive', 'tamkhoa', 'locked', 'disable', 'disabled'], true)) {
            return false;
        }

        return true;
    }

    private function normalizeEmailForStorage(?string $email): ?string
    {
        if (! $email) {
            return null;
        }

        $normalized = Str::lower(trim((string) $email));
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizePhoneForStorage(?string $phone): ?string
    {
        if (! $phone) {
            return null;
        }

        $normalized = trim((string) $phone);
        if ($normalized === '') {
            return null;
        }

        return $normalized;
    }

    private function hasText($value): bool
    {
        return trim((string) ($value ?? '')) !== '';
    }

    private function syncClientCareStaffFromImport(Client $client, array $userIds, int $assignedBy): void
    {
        $ids = collect($userIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return;
        }

        $syncPayload = $ids->mapWithKeys(function ($id) use ($assignedBy) {
            return [$id => ['assigned_by' => $assignedBy]];
        })->all();

        $client->careStaffUsers()->syncWithoutDetaching($syncPayload);
    }

    private function generateProjectCode(): string
    {
        $date = now()->format('Ymd');

        return 'PRJ-' . $date . '-' . strtoupper(Str::random(4));
    }
}
