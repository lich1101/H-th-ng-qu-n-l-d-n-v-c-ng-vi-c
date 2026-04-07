<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractCareNote;
use App\Models\ContractItem;
use App\Models\Product;
use App\Models\Project;
use App\Models\RevenueTier;
use App\Models\User;
use App\Services\DataTransfers\ClientFinancialSyncService;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ContractController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Contract::query()
            ->with([
                'client',
                'client.careStaffUsers:id',
                'project',
                'opportunity',
                'creator:id,name,email,avatar_url',
                'approver:id,name,email,avatar_url',
                'collector:id,name,email,avatar_url',
                'handoverReceiver:id,name,email,avatar_url',
                'careStaffUsers:id,name,email,avatar_url,department_id',
            ])
            ->withCount('items')
            ->withSum('items as items_total_value', 'total_price')
            ->withCount('payments')
            ->withSum('payments as payments_total', 'amount')
            ->withSum('costs as costs_total', 'amount');
        if ($request->boolean('with_items')) {
            $query->with('items');
        }
        CrmScope::applyContractScope($query, $request->user());

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('client_id')) {
            $query->where('client_id', (int) $request->input('client_id'));
        }
        $staffFilterIds = $this->resolveStaffFilterIds($request);
        if (! empty($staffFilterIds)) {
            $query->where(function (Builder $builder) use ($staffFilterIds) {
                $builder->whereIn('collector_user_id', $staffFilterIds)
                    ->orWhereIn('created_by', $staffFilterIds)
                    ->orWhereIn('handover_received_by', $staffFilterIds)
                    ->orWhereHas('careStaffUsers', function (Builder $careStaffQuery) use ($staffFilterIds) {
                        $careStaffQuery->whereIn('users.id', $staffFilterIds);
                    })
                    ->orWhereHas('client', function (Builder $clientQuery) use ($staffFilterIds) {
                        $clientQuery->whereIn('assigned_staff_id', $staffFilterIds)
                            ->orWhereIn('sales_owner_id', $staffFilterIds)
                            ->orWhereHas('careStaffUsers', function (Builder $careStaffQuery) use ($staffFilterIds) {
                                $careStaffQuery->whereIn('users.id', $staffFilterIds);
                            });
                    });
            });
        }
        if ($request->filled('approval_status')) {
            $query->where('approval_status', (string) $request->input('approval_status'));
        }
        if ($request->filled('handover_receive_status')) {
            $query->where('handover_receive_status', (string) $request->input('handover_receive_status'));
        }
        if ($request->filled('has_project')) {
            $hasProject = $request->input('has_project');
            if ($hasProject === 'yes') {
                $query->whereNotNull('project_id');
            } elseif ($hasProject === 'no') {
                $query->whereNull('project_id');
            }
        }
        if ($request->boolean('available_only')) {
            $projectId = (int) $request->input('project_id', 0);
            $query->where(function ($builder) use ($projectId) {
                $builder->whereNull('project_id');
                if ($projectId > 0) {
                    $builder->orWhere('project_id', $projectId);
                }
            });
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($builder) use ($search) {
                $builder->where('code', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%")
                    ->orWhere('approval_note', 'like', "%{$search}%")
                    ->orWhereHas('client', function ($clientQuery) use ($search) {
                        $clientQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    });
            });
        }

        $sortBy = (string) $request->input('sort_by', 'signed_at');
        $sortDir = $this->normalizeSortDirection((string) $request->input('sort_dir', 'desc'));
        $this->applyContractSorting($query, $sortBy, $sortDir);

        /** @var \Illuminate\Pagination\LengthAwarePaginator $contracts */
        $contracts = $query
            ->paginate((int) $request->input('per_page', 15));
        $contracts->setCollection($contracts->getCollection()->transform(function (Contract $contract) use ($request) {
            return $this->appendContractPermissions($contract, $request->user());
        }));

        return response()->json($contracts);
    }

    public function show(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canViewContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem hợp đồng.'], 403);
        }

        $this->loadContractDetail($contract);

        return response()->json(
            $this->appendContractPermissions($contract, $request->user())
        );
    }

    private function normalizeSortDirection(string $direction): string
    {
        return strtolower($direction) === 'asc' ? 'asc' : 'desc';
    }

    private function applyContractSorting(Builder $query, string $sortBy, string $sortDir): void
    {
        $direction = $this->normalizeSortDirection($sortDir);
        $rawDirection = strtoupper($direction);

        switch ($sortBy) {
            case 'code':
                $query->orderBy('contracts.code', $direction);
                break;
            case 'title':
                $query->orderBy('contracts.title', $direction);
                break;
            case 'client_name':
                $query->orderBy(
                    Client::query()
                        ->select('name')
                        ->whereColumn('clients.id', 'contracts.client_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'client_phone':
                $query->orderBy(
                    Client::query()
                        ->select('phone')
                        ->whereColumn('clients.id', 'contracts.client_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'signed_at':
                $query->orderByRaw('CASE WHEN contracts.signed_at IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('contracts.signed_at', $direction);
                break;
            case 'end_date':
                $query->orderByRaw('CASE WHEN contracts.end_date IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('contracts.end_date', $direction);
                break;
            case 'notes':
                $query->orderBy('contracts.notes', $direction);
                break;
            case 'collector_name':
                $query->orderBy(
                    User::query()
                        ->select('name')
                        ->whereColumn('users.id', 'contracts.collector_user_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'value':
                $query->orderBy('contracts.value', $direction);
                break;
            case 'payments_total':
                $query->orderBy('payments_total', $direction);
                break;
            case 'debt_outstanding':
                $query->orderByRaw('(COALESCE(contracts.value, 0) - COALESCE(payments_total, 0)) ' . $rawDirection);
                break;
            case 'costs_total':
                $query->orderBy('costs_total', $direction);
                break;
            case 'payments_count':
                $query->orderBy('payments_count', $direction);
                break;
            case 'status':
                $query->orderBy('contracts.status', $direction);
                break;
            case 'approval_status':
                $query->orderBy('contracts.approval_status', $direction);
                break;
            case 'handover_receive_status':
                $query->orderBy('contracts.handover_receive_status', $direction);
                break;
            default:
                $query->orderByRaw('CASE WHEN contracts.signed_at IS NULL THEN 1 ELSE 0 END')
                    ->orderByDesc('contracts.signed_at');
                $direction = 'desc';
                break;
        }

        $query->orderBy('contracts.id', $direction);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules(null, true));
        $careStaffIds = $this->extractCareStaffIds($validated);
        $client = Client::query()->find((int) $validated['client_id']);
        if (! $client) {
            return response()->json(['message' => 'Khách hàng không tồn tại.'], 422);
        }
        if (! $this->canManageContractClient($request->user(), $client)) {
            return response()->json(['message' => 'Nhân viên chăm sóc chỉ có quyền xem hợp đồng, không được tạo/cập nhật/xóa.'], 403);
        }
        if ($error = $this->validateAssignableCareStaffIds($request->user(), $careStaffIds)) {
            return response()->json(['message' => $error], 422);
        }
        $validated['code'] = $this->generateContractCode();
        $validated['created_by'] = $request->user()->id;
        unset($validated['project_id']);

        $items = $this->normalizeItems($request->input('items', []));
        if (! empty($items)) {
            $validated['value'] = $this->sumItems($items);
        }

        $validated['collector_user_id'] = $this->resolveCollectorUserId($request, $validated);
        $validated = array_merge($validated, $this->resolveApproval($request));

        $contract = Contract::create($validated);
        $this->syncCareStaff($contract, $careStaffIds, $request->user());

        if (! empty($items)) {
            $this->syncItems($contract, $items);
        }

        $contract->refreshFinancials();

        if ($contract->approval_status === 'approved') {
            $this->syncClientRevenue($contract->client);
        }

        if (($contract->approval_status ?? '') === 'pending') {
            $accountantIds = \App\Support\ContractApproverIds::query(
                (int) $request->user()->id
            );
            if (! empty($accountantIds)) {
                try {
                    app(NotificationService::class)->notifyUsersAfterResponse(
                        $accountantIds,
                        'Hợp đồng mới cần duyệt',
                        'Hợp đồng: '.$contract->title,
                        [
                            'type' => 'contract_approval',
                            'category' => 'contract_approval',
                            'contract_id' => $contract->id,
                            'approval_target' => 'contract',
                        ]
                    );
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        $this->loadContractDetail($contract);

        return response()->json($this->appendContractPermissions($contract, $request->user()), 201);
    }

    public function update(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canManageContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền cập nhật hợp đồng.'], 403);
        }
        $validated = $request->validate($this->rules($contract->id, true));
        $careStaffIds = $this->extractCareStaffIds($validated);
        $client = Client::query()->find((int) $validated['client_id']);
        if (! $client) {
            return response()->json(['message' => 'Khách hàng không tồn tại.'], 422);
        }
        if (! $this->canManageContractClient($request->user(), $client, $contract)) {
            return response()->json(['message' => 'Nhân viên chăm sóc chỉ có quyền xem hợp đồng, không được tạo/cập nhật/xóa.'], 403);
        }
        if ($error = $this->validateAssignableCareStaffIds($request->user(), $careStaffIds)) {
            return response()->json(['message' => $error], 422);
        }
        $items = $this->normalizeItems($request->input('items', []));
        if (! empty($items)) {
            $validated['value'] = $this->sumItems($items);
        }

        $validated['collector_user_id'] = $this->resolveCollectorUserId($request, $validated, $contract);

        if (! $this->canApprove($request->user())) {
            unset($validated['approval_status'], $validated['approved_by'], $validated['approved_at'], $validated['approval_note']);
        } elseif (isset($validated['approval_status'])) {
            if ($validated['approval_status'] === 'approved') {
                $validated['approved_by'] = $request->user()->id;
                $validated['approved_at'] = now();
            } else {
                $validated['approved_by'] = null;
                $validated['approved_at'] = null;
            }
        }

        $contract->update($validated);
        $this->syncCareStaff($contract, $careStaffIds, $request->user());

        if (! empty($items)) {
            $this->syncItems($contract, $items);
        }

        $contract->refreshFinancials();

        $contract->refresh();
        if ($contract->client) {
            $this->syncClientRevenue($contract->client);
        }

        $this->loadContractDetail($contract);

        return response()->json($this->appendContractPermissions($contract, $request->user()));
    }

    public function approve(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canApprove($request->user())) {
            return response()->json(['message' => 'Không có quyền duyệt hợp đồng.'], 403);
        }

        $validated = $request->validate([
            'approval_note' => ['nullable', 'string'],
        ]);

        $contract->update([
            'approval_status' => 'approved',
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'approval_note' => $validated['approval_note'] ?? $contract->approval_note,
        ]);

        if ($contract->client) {
            $this->syncClientRevenue($contract->client);
        }

        return response()->json($contract->load(['client', 'project', 'opportunity', 'creator', 'approver', 'collector', 'items']));
    }

    public function destroy(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canManageContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xóa hợp đồng.'], 403);
        }
        if ($contract->project_id) {
            Project::where('id', $contract->project_id)
                ->where('contract_id', $contract->id)
                ->update(['contract_id' => null]);
        }

        $client = $contract->client;
        $contract->delete();

        if ($client) {
            $this->syncClientRevenue($client);
        }

        return response()->json(['message' => 'Contract deleted.']);
    }

    public function storeCareNote(Request $request, Contract $contract): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewContract($user, $contract)) {
            return response()->json(['message' => 'Không có quyền xem hợp đồng.'], 403);
        }
        if (! $this->canAddCareNote($user, $contract)) {
            return response()->json(['message' => 'Không có quyền thêm cập nhật chăm sóc cho hợp đồng này.'], 403);
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'detail' => ['required', 'string', 'max:12000'],
        ]);

        $note = ContractCareNote::query()->create([
            'contract_id' => $contract->id,
            'user_id' => $user->id,
            'title' => trim((string) $validated['title']),
            'detail' => trim((string) $validated['detail']),
        ]);

        return response()->json([
            'message' => 'Đã thêm ghi chú chăm sóc hợp đồng.',
            'note' => [
                'id' => $note->id,
                'title' => $note->title,
                'detail' => $note->detail,
                'created_at' => optional($note->created_at)->toIso8601String(),
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'avatar_url' => $user->avatar_url,
                ],
            ],
        ], 201);
    }

    private function rules(?int $contractId = null, bool $withOptional = false): array
    {
        $rules = [
            'title' => ['required', 'string', 'max:255'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'opportunity_id' => ['nullable', 'integer', 'exists:opportunities,id'],
            'value' => ['nullable', 'numeric', 'min:0'],
            'payment_times' => ['nullable', 'integer', 'min:1', 'max:120'],
            'revenue' => ['nullable', 'numeric', 'min:0'],
            'debt' => ['nullable', 'numeric', 'min:0'],
            'cash_flow' => ['nullable', 'numeric'],
            'status' => ['required', 'string', 'in:draft,signed,success,active,expired,cancelled'],
            'approval_status' => ['nullable', 'string', 'in:pending,approved,rejected'],
            'signed_at' => ['nullable', 'date'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'approval_note' => ['nullable', 'string'],
            'collector_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'care_staff_ids' => ['nullable', 'array'],
            'care_staff_ids.*' => ['integer', 'exists:users,id'],
            'create_and_approve' => ['nullable', 'boolean'],
        ];
        return $rules;
    }

    private function canApprove($user): bool
    {
        return $user && in_array($user->role, ['admin', 'ke_toan'], true);
    }

    private function resolveApproval(Request $request): array
    {
        $user = $request->user();
        if ($this->canApprove($user) && $request->boolean('create_and_approve')) {
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

    private function resolveCollectorUserId(Request $request, array $validated, ?Contract $contract = null): ?int
    {
        $user = $request->user();
        $requestedCollectorId = isset($validated['collector_user_id'])
            ? (int) $validated['collector_user_id']
            : null;

        if (! $user) {
            return $requestedCollectorId;
        }

        if ($user->role === 'nhan_vien') {
            return (int) $user->id;
        }

        if ($user->role === 'quan_ly') {
            $allowedIds = $this->allowedCollectorIdsForManager($user);

            if ($requestedCollectorId && in_array($requestedCollectorId, $allowedIds, true)) {
                return $requestedCollectorId;
            }

            if ($contract && $contract->collector_user_id && in_array((int) $contract->collector_user_id, $allowedIds, true)) {
                return (int) $contract->collector_user_id;
            }

            return (int) $user->id;
        }

        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            $allowedIds = $this->allowedCollectorIdsForAdminAndAccounting();

            if ($requestedCollectorId && in_array($requestedCollectorId, $allowedIds, true)) {
                return $requestedCollectorId;
            }

            if ($contract && $contract->collector_user_id && in_array((int) $contract->collector_user_id, $allowedIds, true)) {
                return (int) $contract->collector_user_id;
            }

            return null;
        }

        return $requestedCollectorId ?: ($contract ? (int) $contract->collector_user_id : null);
    }

    private function allowedCollectorIdsForManager(User $user): array
    {
        return User::query()
            ->where('is_active', true)
            ->where(function (Builder $builder) use ($user) {
                $builder->where('id', $user->id)
                    ->orWhere(function (Builder $employeeBuilder) use ($user) {
                        $employeeBuilder->where('role', 'nhan_vien')
                            ->whereIn('department_id', $user->managedDepartments()->pluck('id'));
                    });
            })
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function allowedCollectorIdsForAdminAndAccounting(): array
    {
        return User::query()
            ->where('is_active', true)
            ->whereNotIn('role', ['admin', 'administrator', 'ke_toan'])
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function allowedCareStaffIdsForManager(User $user): array
    {
        return User::query()
            ->where('is_active', true)
            ->where('role', 'nhan_vien')
            ->whereIn('department_id', $user->managedDepartments()->pluck('id'))
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function allowedCareStaffIdsForAdminAndAccounting(): array
    {
        return User::query()
            ->where('is_active', true)
            ->where('role', 'nhan_vien')
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();
    }

    private function extractCareStaffIds(array &$validated): array
    {
        $ids = collect($validated['care_staff_ids'] ?? [])
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();

        unset($validated['care_staff_ids']);

        return $ids;
    }

    private function validateAssignableCareStaffIds(User $user, array $careStaffIds): ?string
    {
        if (empty($careStaffIds)) {
            return null;
        }

        if ($user->role === 'quan_ly') {
            $allowedIds = $this->allowedCareStaffIdsForManager($user);
        } elseif (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            $allowedIds = $this->allowedCareStaffIdsForAdminAndAccounting();
        } else {
            return 'Không có quyền gán nhân viên chăm sóc cho hợp đồng.';
        }

        $invalidIds = array_values(array_diff($careStaffIds, $allowedIds));

        return empty($invalidIds)
            ? null
            : 'Danh sách nhân viên chăm sóc không hợp lệ hoặc vượt phạm vi được phép gán.';
    }

    private function syncCareStaff(Contract $contract, array $careStaffIds, User $user): void
    {
        $payload = [];
        foreach ($careStaffIds as $staffId) {
            $payload[(int) $staffId] = ['assigned_by' => $user->id];
        }

        $contract->careStaffUsers()->sync($payload);
    }

    private function normalizeItems(array $items): array
    {
        if (empty($items)) {
            return [];
        }
        $items = array_values(array_filter($items, function ($item) {
            return is_array($item) && (! empty($item['product_id']) || ! empty($item['product_name']));
        }));
        if (empty($items)) {
            return [];
        }

        $productIds = collect($items)
            ->pluck('product_id')
            ->filter()
            ->unique()
            ->values()
            ->all();
        $products = $productIds
            ? Product::whereIn('id', $productIds)->get()->keyBy('id')
            : collect();

        return collect($items)->map(function ($item) use ($products) {
            $product = null;
            if (! empty($item['product_id'])) {
                $product = $products->get((int) $item['product_id']);
            }
            $name = $item['product_name'] ?? ($product ? $product->name : 'Sản phẩm');
            $unit = $item['unit'] ?? ($product ? $product->unit : null);
            $unitPrice = isset($item['unit_price'])
                ? $this->parseNumericInput($item['unit_price'])
                : ($product ? $this->parseNumericInput($product->unit_price) : 0);
            $quantity = max(1, (int) round($this->parseNumericInput($item['quantity'] ?? 1)));
            $total = $unitPrice * $quantity;

            return [
                'product_id' => $product ? $product->id : null,
                'product_name' => $name,
                'unit' => $unit,
                'unit_price' => $unitPrice,
                'quantity' => $quantity,
                'total_price' => $total,
                'note' => $item['note'] ?? null,
            ];
        })->values()->all();
    }

    private function parseNumericInput($value): float
    {
        if ($value === null || $value === '') {
            return 0.0;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        $raw = preg_replace('/\s+/u', '', (string) $value);
        $raw = preg_replace('/(₫|đ|VNĐ|VND)/iu', '', $raw);

        $hasComma = strpos($raw, ',') !== false;
        $hasDot = strpos($raw, '.') !== false;

        if ($hasComma && $hasDot) {
            $raw = str_replace('.', '', $raw);
            $raw = str_replace(',', '.', $raw);
        } elseif ($hasComma) {
            $parts = explode(',', $raw);
            $raw = count($parts) > 2 || (count($parts) === 2 && strlen($parts[1]) === 3)
                ? str_replace(',', '', $raw)
                : str_replace(',', '.', $raw);
        } elseif ($hasDot) {
            $parts = explode('.', $raw);
            if (count($parts) > 2 || (count($parts) === 2 && strlen($parts[1]) === 3)) {
                $raw = str_replace('.', '', $raw);
            }
        }

        $raw = preg_replace('/[^0-9.\-]/', '', $raw);

        return is_numeric($raw) ? (float) $raw : 0.0;
    }

    private function sumItems(array $items): float
    {
        return (float) collect($items)->sum(function ($item) {
            return (float) ($item['total_price'] ?? 0);
        });
    }

    private function syncItems(Contract $contract, array $items): void
    {
        $contract->items()->delete();
        foreach ($items as $item) {
            $contract->items()->create($item);
        }
    }

    private function syncClientRevenue(Client $client): void
    {
        app(ClientFinancialSyncService::class)->sync($client);
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

    private function resolveStaffFilterIds(Request $request): array
    {
        $raw = $request->input('staff_ids', []);
        if (is_string($raw)) {
            $raw = preg_split('/[\s,;|]+/', $raw) ?: [];
        }
        if (! is_array($raw)) {
            $raw = [];
        }

        $legacyRaw = $request->input('collector_user_ids', []);
        if (is_string($legacyRaw)) {
            $legacyRaw = preg_split('/[\s,;|]+/', $legacyRaw) ?: [];
        }
        if (is_array($legacyRaw)) {
            $raw = array_merge($raw, $legacyRaw);
        }

        if ($request->filled('collector_user_id')) {
            $raw[] = $request->input('collector_user_id');
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

    private function appendContractPermissions(Contract $contract, User $user): Contract
    {
        $contract->setAttribute('can_view', $this->canViewContract($user, $contract));
        $contract->setAttribute('can_manage', $this->canManageContract($user, $contract));
        $contract->setAttribute('can_delete', $this->canManageContract($user, $contract));
        $contract->setAttribute('can_add_care_note', $this->canAddCareNote($user, $contract));
        $contract->setAttribute('can_review_finance_request', $this->canApprove($user));
        $contract->setAttribute('can_manage_finance', $this->canApprove($user));
        $contract->setAttribute('can_submit_finance_request', $this->canViewContract($user, $contract));
        
        $canCreateProject = in_array((string) $user->role, ['admin', 'administrator'], true)
            || (int) ($contract->collector_user_id ?? 0) === (int) $user->id 
            || (int) ($contract->created_by ?? 0) === (int) $user->id;
        $contract->setAttribute('can_create_project', $canCreateProject);

        return $contract;
    }

    private function canViewContract(User $user, Contract $contract): bool
    {
        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return true;
        }

        if ($this->isManagerOfContractDepartment($user, $contract)) {
            return true;
        }

        if ($user->role !== 'nhan_vien') {
            return false;
        }

        return $this->isStaffLinkedToContract($user, $contract, true, true);
    }

    private function canManageContract(User $user, Contract $contract): bool
    {
        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return true;
        }

        if ($this->isManagerOfContractDepartment($user, $contract)) {
            return true;
        }

        return false;
    }

    private function canManageContractClient(User $user, Client $client, ?Contract $contract = null): bool
    {
        if (in_array($user->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            if (CrmScope::canManagerAccessClient($user, $client)) {
                return true;
            }

            return $contract ? $this->isManagerOfContractDepartment($user, $contract) : false;
        }

        if ($user->role === 'nhan_vien') {
            return $this->isEmployeeLinkedToClient($user, $client);
        }

        return false;
    }

    private function isManagerOfContractDepartment(User $user, Contract $contract): bool
    {
        return CrmScope::canManagerAccessContract($user, $contract);
    }

    private function canAddCareNote(?User $user, Contract $contract): bool
    {
        if (! $user) {
            return false;
        }

        if ($this->canManageContract($user, $contract)) {
            return true;
        }

        if ($user->role !== 'nhan_vien') {
            return false;
        }

        return $this->isStaffLinkedToContract($user, $contract, true, true);
    }

    private function isStaffLinkedToContract(User $user, Contract $contract, bool $includeClientCareStaff, bool $includeContractCareStaff): bool
    {
        if ((int) $contract->created_by === (int) $user->id) {
            return true;
        }
        if ((int) $contract->collector_user_id === (int) $user->id) {
            return true;
        }
        if ($includeContractCareStaff && $this->isContractCareStaff($user, $contract)) {
            return true;
        }

        $contract->loadMissing('client');
        $client = $contract->client;

        if (! $client) {
            return false;
        }

        if ((int) $client->assigned_staff_id === (int) $user->id) {
            return true;
        }
        if ((int) $client->sales_owner_id === (int) $user->id) {
            return true;
        }

        return $includeClientCareStaff && $this->isCareStaff($user, $client);
    }

    private function isEmployeeLinkedToClient(User $user, Client $client): bool
    {
        if ((int) ($client->assigned_staff_id ?? 0) === (int) $user->id) {
            return true;
        }

        if ((int) ($client->sales_owner_id ?? 0) === (int) $user->id) {
            return true;
        }

        return $this->isCareStaff($user, $client);
    }

    private function isCareStaff(User $user, Client $client): bool
    {
        if ($client->relationLoaded('careStaffUsers')) {
            return $client->careStaffUsers->contains(function ($staff) use ($user) {
                return (int) $staff->id === (int) $user->id;
            });
        }

        return $client->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function isContractCareStaff(User $user, Contract $contract): bool
    {
        if ($contract->relationLoaded('careStaffUsers')) {
            return $contract->careStaffUsers->contains(function ($staff) use ($user) {
                return (int) $staff->id === (int) $user->id;
            });
        }

        return $contract->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function loadContractDetail(Contract $contract): void
    {
        $contract->load([
            'client',
            'client.careStaffUsers:id,name,email,avatar_url',
            'project',
            'opportunity',
            'creator:id,name,email,avatar_url',
            'approver:id,name,email,avatar_url',
            'collector:id,name,email,avatar_url',
            'handoverReceiver:id,name,email,avatar_url',
            'items',
            'payments',
            'costs',
            'financeRequests.submitter:id,name,email,avatar_url',
            'financeRequests.reviewer:id,name,email,avatar_url',
            'careStaffUsers:id,name,email,avatar_url,department_id',
            'careNotes.user:id,name,email,avatar_url',
        ]);
    }

    private function resolveAccessibleClient(Request $request, int $clientId): ?Client
    {
        $query = Client::query()->where('id', $clientId);
        CrmScope::applyClientScope($query, $request->user());

        return $query->first();
    }
}
