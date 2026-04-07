<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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
use App\Jobs\ProcessImportJob;
use App\Services\ClientPhoneDuplicateService;
use App\Services\DataTransfers\ImportExecutionService;
use App\Services\ProjectProgressService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class ImportController extends Controller
{
    protected $userCacheByEmail = [];
    protected $userCacheByName = [];
    protected $users = [];
    protected $departmentCacheByName = [];
    protected $leadTypeCacheByName = [];
    protected $productCacheByCode = [];
    protected $productCacheByName = [];

    public function importClients(Request $request): JsonResponse
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly', 'nhan_vien']);
        $file = $this->validateFile($request);
        return $this->queueImport($request, $file, 'clients');
    }

    public function importContracts(Request $request): JsonResponse
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly', 'nhan_vien', 'ke_toan']);
        $file = $this->validateFile($request);
        return $this->queueImport($request, $file, 'contracts');
    }

    public function showImportJob(Request $request, DataTransferJob $dataTransferJob): JsonResponse
    {
        if ((int) $dataTransferJob->user_id !== (int) $request->user()->id && ! in_array($request->user()->role, ['admin', 'ke_toan'], true)) {
            return response()->json(['message' => 'Bạn không có quyền xem tiến trình import này.'], 403);
        }

        return response()->json($dataTransferJob->fresh());
    }

    public function importTasks(Request $request): JsonResponse
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly']);
        $file = $this->validateFile($request);
        return $this->queueImport($request, $file, 'tasks');
    }

    public function importUsers(Request $request): JsonResponse
    {
        $this->authorizeRoles($request, ['admin']);
        $file = $this->validateFile($request);
        return $this->queueImport($request, $file, 'users');
    }

    public function downloadClientsTemplate(Request $request)
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly', 'nhan_vien']);

        return $this->streamTemplate(
            'mau-import-khach-hang.csv',
            [
                'Tên khách hàng',
                'Mã khách hàng',
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
            ],
            [
                'Công ty ABC',
                'KH-001',
                'Facebook Lead',
                'Khách hàng tiềm năng',
                'abc@example.com',
                '0901234567',
                'Khách cần tư vấn gói SEO tổng thể',
                'Đang chăm sóc',
                'Hà Hương ClickOn',
                'Vàng',
                '15000000',
                'Fanpage ClickOn',
                '18/03/2026',
                'Minh Quang ClickOn',
                '50-100 nhân sự',
                'SEO tổng thể, Website Care',
                '25000000',
            ]
        );
    }

    public function downloadContractsTemplate(Request $request)
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly', 'nhan_vien', 'ke_toan']);

        return $this->streamTemplate(
            'mau-import-hop-dong.csv',
            [
                'Số hợp đồng',
                'Khách hàng',
                'Mã khách hàng',
                'Loại hợp đồng',
                'Ngày ký',
                'Ngày kết thúc',
                'Mã sản phẩm',
                'Sản phẩm',
                'Đơn giá',
                'Số lượng',
                'Đơn vị tính',
                'Giảm giá',
                'VAT',
                'Lịch chăm sóc',
                'Số tháng',
                'Kỳ thanh toán',
                'Ngày bắt đầu',
                'Giá trị hợp đồng',
                'Chưa thanh toán',
                'Trạng thái',
                'Người quản lý',
                'Kỳ đã thu',
                'Ghi chú',
                'Điện thoại',
            ],
            [
                'CTR-SEO-001',
                'Công ty ABC',
                'KH-001',
                'Dịch vụ SEO',
                '19/03/2026 - 11h11',
                '19/09/2026',
                'SEO-001',
                'SEO Tổng Thể',
                '30000000',
                '1',
                'gói',
                '0',
                '3000000',
                'Hàng tuần',
                '6',
                'Hàng tháng',
                '20/03/2026',
                '33000000',
                '15000000',
                'Đang thực hiện',
                'Hà Hương ClickOn',
                '1',
                'Khách ký gói 6 tháng',
                '0901234567',
            ]
        );
    }

    public function downloadTasksTemplate(Request $request)
    {
        $this->authorizeRoles($request, ['admin', 'quan_ly']);

        return $this->streamTemplate(
            'mau-import-cong-viec.csv',
            [
                'Tên công việc',
                'Khách hàng',
                'Dự án',
                'Loại dịch vụ',
                'Ngày bắt đầu',
                'Deadline',
                'Nội dung',
                'Comments',
                'Trạng thái',
                'Người thực hiện',
            ],
            [
                'Nhắc khách hàng Gia hạn hợp đồng (1 ngày)',
                'Công ty ABC',
                'CRM Import - Công ty ABC',
                'khac',
                '28/02/2026 - 07h30',
                '01/03/2026 - 09h00',
                'Gọi khách xác nhận nhu cầu gia hạn hợp đồng',
                'Ưu tiên gọi trong buổi sáng',
                'Cần làm',
                'Lương Chiến ClickOn',
            ]
        );
    }

    public function downloadUsersTemplate(Request $request)
    {
        $this->authorizeRoles($request, ['admin']);

        return $this->streamTemplate(
            'mau-import-nhan-vien.csv',
            [
                'Họ tên',
                'Email',
                'Mật khẩu',
                'Vai trò',
                'Phòng ban',
                'Số điện thoại',
                'Tải trọng công việc',
                'Trạng thái',
            ],
            [
                'Nguyễn Văn A',
                'nva@example.com',
                '12345678',
                'nhan_vien',
                'Phòng Sản Xuất',
                '0901234567',
                '100',
                'Đang hoạt động',
            ]
        );
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
            'file' => ['required', 'file', 'max:51200', 'mimes:xls,xlsx,csv'],
        ]);

        return $validated['file'];
    }

    private function iterateMappedRows(string $path, array $patterns, callable $handler): void
    {
        $spreadsheet = $this->loadSpreadsheet($path);

        try {
            $sheet = $spreadsheet->getActiveSheet();
            $highestColumn = $sheet->getHighestDataColumn();
            $highestRow = (int) $sheet->getHighestDataRow();

            if ($highestRow < 2) {
                throw ValidationException::withMessages([
                    'file' => 'File không có dữ liệu để import.',
                ]);
            }

            $headerRows = $sheet->rangeToArray('A1:' . $highestColumn . '1', null, true, true, true);
            $headerRow = isset($headerRows[1]) ? $headerRows[1] : [];
            $headerMap = $this->buildHeaderMap($headerRow, $patterns);

            if (empty($headerMap)) {
                throw ValidationException::withMessages([
                    'file' => 'Không nhận diện được tiêu đề cột của file import.',
                ]);
            }

            for ($rowNumber = 2; $rowNumber <= $highestRow; $rowNumber++) {
                $data = $this->mapSheetRow($sheet, $rowNumber, $headerMap);
                if ($this->isMappedRowEmpty($data)) {
                    continue;
                }
                $handler($data, $rowNumber);

                if ($rowNumber % 250 === 0) {
                    gc_collect_cycles();
                }
            }
        } finally {
            $spreadsheet->disconnectWorksheets();
            unset($spreadsheet);
        }
    }

    private function loadSpreadsheet(string $path)
    {
        if (! class_exists(IOFactory::class)) {
            throw ValidationException::withMessages([
                'file' => 'Thiếu thư viện đọc Excel trên server. Vui lòng chạy composer update phpoffice/phpspreadsheet.',
            ]);
        }

        $reader = IOFactory::createReaderForFile($path);
        if (method_exists($reader, 'setReadDataOnly')) {
            $reader->setReadDataOnly(true);
        }
        if (method_exists($reader, 'setReadEmptyCells')) {
            $reader->setReadEmptyCells(false);
        }

        return $reader->load($path);
    }

    private function buildHeaderMap(array $headerRow, array $patterns): array
    {
        $map = [];
        foreach ($headerRow as $col => $value) {
            $key = $this->normalizeHeader((string) $this->cellToString($value));
            if ($key === '') {
                continue;
            }

            if (isset($patterns[$key])) {
                $map[$col] = $patterns[$key];
                continue;
            }

            foreach ($patterns as $pattern => $field) {
                if (strpos($key, $pattern) !== false) {
                    $map[$col] = $field;
                    break;
                }
            }
        }

        return $map;
    }

    private function mapSheetRow(Worksheet $sheet, int $rowNumber, array $headerMap): array
    {
        $data = [];
        foreach ($headerMap as $column => $field) {
            $value = $sheet->getCell($column . $rowNumber)->getValue();
            $value = $this->cellToString($value);
            if ($value !== null && $value !== '') {
                $data[$field] = $value;
            }
        }

        return $data;
    }

    private function cellToString($value)
    {
        if ($value === null) {
            return null;
        }

        if (is_object($value) && method_exists($value, 'getPlainText')) {
            $value = $value->getPlainText();
        }

        if (is_string($value)) {
            $value = trim($value);
        }

        return $value;
    }

    private function isMappedRowEmpty(array $data): bool
    {
        foreach ($data as $value) {
            if ($value !== null && $value !== '') {
                return false;
            }
        }

        return true;
    }

    private function normalizeHeader(string $value): string
    {
        $ascii = Str::ascii($value);
        $ascii = Str::lower($ascii);

        return preg_replace('/[^a-z0-9]/', '', $ascii) ?: '';
    }

    private function parseNumber($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        $raw = preg_replace('/[^\d,\.\-]/', '', (string) $value);
        if ($raw === '' || $raw === null) {
            return null;
        }

        $commaCount = substr_count($raw, ',');
        $dotCount = substr_count($raw, '.');

        if ($commaCount > 0 && $dotCount > 0) {
            $lastComma = strrpos($raw, ',');
            $lastDot = strrpos($raw, '.');
            if ($lastComma > $lastDot) {
                $raw = str_replace('.', '', $raw);
                $raw = str_replace(',', '.', $raw);
            } else {
                $raw = str_replace(',', '', $raw);
            }
        } elseif ($commaCount > 0) {
            if ($commaCount === 1 && preg_match('/,\d{1,2}$/', $raw)) {
                $raw = str_replace(',', '.', $raw);
            } else {
                $raw = str_replace(',', '', $raw);
            }
        } elseif ($dotCount > 1) {
            $raw = str_replace('.', '', $raw);
        }

        return is_numeric($raw) ? (float) $raw : null;
    }

    private function parseInteger($value): ?int
    {
        $number = $this->parseNumber($value);
        if ($number === null) {
            return null;
        }

        return (int) round($number);
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
                } catch (\Throwable $e) {
                }
            }

            return Carbon::parse($normalized)->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
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

    private function queueImport(Request $request, $file, string $module): JsonResponse
    {
        /** @var ImportExecutionService $service */
        $service = app(ImportExecutionService::class);
        $storedPath = $file->store('imports/' . $module, 'local');
        $absolutePath = Storage::disk('local')->path($storedPath);
        $estimatedRows = $service->estimateRows($absolutePath);

        $job = DataTransferJob::query()->create([
            'user_id' => $request->user()->id,
            'type' => 'import',
            'module' => $module,
            'status' => 'queued',
            'disk' => 'local',
            'file_path' => $storedPath,
            'original_name' => $file->getClientOriginalName(),
            'total_rows' => $estimatedRows,
            'processed_rows' => 0,
            'successful_rows' => 0,
            'failed_rows' => 0,
        ]);

        ProcessImportJob::dispatch($job->id);

        return response()->json([
            'message' => 'Đã đưa file import vào hàng đợi xử lý.',
            'job' => $job->fresh(),
        ], 202);
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
            $phoneExpression = $this->normalizedPhoneSqlExpression('phone');
            $client = (clone $query)
                ->where(function ($builder) use ($normalizedPhone, $phoneExpression) {
                    $builder->where('phone', $normalizedPhone)
                        ->orWhereRaw($phoneExpression . ' = ?', [$normalizedPhone]);
                })
                ->first();
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

    private function generateProjectCode(): string
    {
        $date = now()->format('Ymd');

        return 'PRJ-' . $date . '-' . strtoupper(Str::random(4));
    }

    private function streamTemplate(string $filename, array $headers, array $sample)
    {
        return response()->streamDownload(function () use ($headers, $sample) {
            $handle = fopen('php://output', 'w');
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, $headers);
            fputcsv($handle, $sample);
            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
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
        }

        $client->update([
            'total_revenue' => $totalRevenue,
            'has_purchased' => $totalRevenue > 0,
            'revenue_tier_id' => $tier ? $tier->id : null,
        ]);
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
        return app(ClientPhoneDuplicateService::class)->normalizeForStorage($phone);
    }

    private function normalizedPhoneSqlExpression(string $column): string
    {
        return "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE({$column}, ' ', ''), '.', ''), '-', ''), '(', ''), ')', ''), '+', '')";
    }

    private function hasText($value): bool
    {
        return trim((string) ($value ?? '')) !== '';
    }

    private function syncClientCareStaffFromImport(Client $client, array $userIds, int $assignedBy): void
    {
        $ids = collect($userIds)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return;
        }

        $payload = $ids
            ->mapWithKeys(function ($id) use ($assignedBy) {
                return [
                    $id => ['assigned_by' => $assignedBy],
                ];
            })
            ->all();

        $client->careStaffUsers()->syncWithoutDetaching($payload);
    }
}
