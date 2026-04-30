<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\ClientStaffTransferRequest;
use App\Models\CustomerPayment;
use App\Models\Department;
use App\Models\LeadType;
use App\Models\RevenueTier;
use App\Models\User;
use App\Services\ClientAutoRotationService;
use App\Services\ClientPhoneDuplicateService;
use App\Services\ContractLifecycleStatusService;
use App\Services\ClientStaffTransferService;
use App\Services\LeadNotificationService;
use App\Services\NotificationService;
use App\Services\StaffFilterOptionsService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class CRMController extends Controller
{
    /** @var \Illuminate\Support\Collection<int, int>|null Bộ id nhân sự được phép lọc CRM (nhan_vien), khớp /staff-filter-options?context=crm_clients */
    private $crmNhanVienFilterStaffIds = null;

    public function clients(Request $request): JsonResponse
    {
        $clientRelations = [
            'leadType',
            'salesOwner',
            'revenueTier',
            'assignedDepartment',
            'assignedStaff',
            'facebookPage',
        ];
        if ($this->supportsClientCareStaff()) {
            $clientRelations[] = 'careStaffUsers:id,name,email';
        }

        $query = Client::query()
            ->with($clientRelations)
            ->withCount(['opportunities', 'contracts']);
        if ($request->boolean('assigned_only')) {
            CrmScope::applyClientScopeAssignedOnly($query, $request->user());
        } else {
            CrmScope::applyClientScope($query, $request->user());
        }

        if ($request->filled('ids')) {
            $rawIds = $request->input('ids');
            $ids = is_array($rawIds)
                ? $rawIds
                : preg_split('/[\s,]+/', (string) $rawIds, -1, PREG_SPLIT_NO_EMPTY);
            $ids = array_values(array_unique(array_filter(array_map('intval', $ids), function (int $id) {
                return $id > 0;
            })));
            if (! empty($ids)) {
                $query->whereIn('clients.id', $ids);
            }
        }

        if ($request->filled('search')) {
            $search = (string) $request->input('search');
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
        if ($request->filled('type')) {
            if ($request->input('type') === 'potential') {
                $query->whereDoesntHave('contracts', function ($q) {
                    $statusSql = app(ContractLifecycleStatusService::class)->sqlExpression('contracts');
                    $q->whereRaw("({$statusSql}) in ('success', 'active')");
                });
            }
            if ($request->input('type') === 'active') {
                $query->whereHas('contracts', function ($q) {
                    $statusSql = app(ContractLifecycleStatusService::class)->sqlExpression('contracts');
                    $q->whereRaw("({$statusSql}) in ('success', 'active')");
                });
            }
        }
        if ($request->filled('lead_type_id')) {
            $query->where('lead_type_id', (int) $request->input('lead_type_id'));
        }
        if ($request->filled('revenue_tier_id')) {
            $query->where('revenue_tier_id', (int) $request->input('revenue_tier_id'));
        }
        $viewer = $request->user();
        if ($request->filled('assigned_department_id')) {
            $departmentId = (int) $request->input('assigned_department_id');
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
        $staffFilterIds = $this->resolveAssignedStaffFilterIds($request);
        if (! empty($staffFilterIds)) {
            $canUseStaffFilter = collect($staffFilterIds)->every(function (int $staffId) use ($viewer) {
                return $this->canViewerFilterByStaff($viewer, $staffId);
            });
            if (! $canUseStaffFilter) {
                $query->whereRaw('1 = 0');
            } else {
                // Khớp cột «Phụ trách» trên UI: assigned_staff, hoặc sales_owner khi chưa gán phụ trách — không lọc theo chăm sóc.
                $query->where(function ($builder) use ($staffFilterIds) {
                    $builder->whereIn('assigned_staff_id', $staffFilterIds)
                        ->orWhere(function ($q) use ($staffFilterIds) {
                            $q->whereNull('assigned_staff_id')
                                ->whereIn('sales_owner_id', $staffFilterIds);
                        });
                });
            }
        }
        if ($request->boolean('lead_only')) {
            $query->whereNotNull('lead_type_id');
        }
        if ($request->filled('created_from')) {
            $query->whereDate('clients.created_at', '>=', (string) $request->input('created_from'));
        }
        if ($request->filled('created_to')) {
            $query->whereDate('clients.created_at', '<=', (string) $request->input('created_to'));
        }
        $lastActivitySources = ['clients.updated_at'];
        if (
            Schema::hasTable('client_care_notes')
            && Schema::hasColumn('client_care_notes', 'client_id')
            && Schema::hasColumn('client_care_notes', 'created_at')
        ) {
            $lastActivitySources[] = '(SELECT MAX(client_care_notes.created_at) FROM client_care_notes WHERE client_care_notes.client_id = clients.id)';
        }
        if (
            Schema::hasTable('opportunities')
            && Schema::hasColumn('opportunities', 'client_id')
            && Schema::hasColumn('opportunities', 'updated_at')
        ) {
            $lastActivitySources[] = '(SELECT MAX(opportunities.updated_at) FROM opportunities WHERE opportunities.client_id = clients.id)';
        }
        if (
            Schema::hasTable('contracts')
            && Schema::hasColumn('contracts', 'client_id')
            && Schema::hasColumn('contracts', 'updated_at')
        ) {
            $lastActivitySources[] = '(SELECT MAX(contracts.updated_at) FROM contracts WHERE contracts.client_id = clients.id)';
        }

        $lastActivityExpression = 'GREATEST('
            . implode(', ', array_map(function ($part) {
                return "COALESCE({$part}, clients.updated_at)";
            }, $lastActivitySources))
            . ')';

        $query->select('clients.*')
            ->selectRaw("{$lastActivityExpression} as last_activity_at");

        $sortBy = (string) $request->input('sort_by', 'last_activity_at');
        $sortDir = $this->normalizeSortDirection((string) $request->input('sort_dir', 'desc'));
        $this->applyClientSorting($query, $sortBy, $sortDir, $lastActivityExpression);

        $paginator = $query->paginate((int) $request->input('per_page', 10));
        $rows = $paginator->getCollection();
        if ($rows->isNotEmpty()) {
            $transferService = app(ClientStaffTransferService::class);
            $clientIds = $rows->pluck('id')->map(function ($id) {
                return (int) $id;
            })->all();
            $pendingByClientId = ClientStaffTransferRequest::query()
                ->whereIn('client_id', $clientIds)
                ->where('status', ClientStaffTransferService::STATUS_PENDING)
                ->with([
                    'fromStaff:id,name,email',
                    'toStaff:id,name,email',
                    'requestedBy:id,name',
                    'client:id,name',
                ])
                ->get()
                ->keyBy(function (ClientStaffTransferRequest $t) {
                    return (int) $t->client_id;
                });
            $rows->transform(function (Client $client) use ($transferService, $pendingByClientId) {
                $t = $pendingByClientId->get((int) $client->id);
                $client->setAttribute(
                    'pending_staff_transfer',
                    $t ? $transferService->transferToArray($t) : null
                );
                $this->appendClientPermissions($client, request()->user(), $transferService);

                return $client;
            });
        }

        return response()->json($paginator);
    }

    public function rotationPool(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewRotationPool($user)) {
            return response()->json(['message' => 'Không có quyền xem kho số.'], 403);
        }

        $query = Client::query()
            ->onlyRotationPool()
            ->select(['id', 'name', 'rotation_pool_entered_at'])
            ->withCount([
                'opportunities',
                'careNotes as care_notes_count' => fn ($careNotesQuery) => $careNotesQuery->reorder(),
            ])
            ->orderByDesc('rotation_pool_entered_at')
            ->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where('name', 'like', "%{$search}%");
        }

        $paginator = $query->paginate(
            min(100, max(1, (int) $request->input('per_page', 12)))
        );
        $paginator->setCollection(
            $paginator->getCollection()->map(function (Client $client) {
                return [
                    'id' => (int) $client->id,
                    'name' => (string) ($client->name ?: 'Khách hàng'),
                    'opportunities_count' => (int) ($client->opportunities_count ?? 0),
                    'care_notes_count' => (int) ($client->care_notes_count ?? 0),
                ];
            })
        );

        return response()->json($paginator);
    }

    public function storeRotationPoolClient(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canManageRotationPool($user)) {
            return response()->json(['message' => 'Không có quyền thêm khách hàng vào kho số.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'external_code' => ['nullable', 'string', 'max:120'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'lead_type_id' => ['nullable', 'integer', 'exists:lead_types,id'],
            'lead_source' => ['nullable', 'string', 'max:100'],
            'lead_channel' => ['nullable', 'string', 'max:50'],
            'lead_message' => ['nullable', 'string'],
        ]);

        if (empty($validated['lead_type_id'])) {
            $validated['lead_type_id'] = $this->resolveDefaultLeadTypeId();
        }

        $phoneDup = ! empty($validated['phone'])
            ? app(ClientPhoneDuplicateService::class)->findExistingByPhone($validated['phone'])
            : null;
        if ($phoneDup) {
            return response()->json([
                'message' => 'Khách hàng với số điện thoại này đã tồn tại. Không thể thêm trùng vào kho số.',
                'existing_client' => [
                    'id' => (int) $phoneDup->id,
                    'name' => $phoneDup->name,
                    'is_in_rotation_pool' => (bool) ($phoneDup->is_in_rotation_pool ?? false),
                ],
            ], 422);
        }

        $now = now('Asia/Ho_Chi_Minh');
        $payload = [
            'name' => trim((string) $validated['name']),
            'external_code' => trim((string) ($validated['external_code'] ?? '')) ?: null,
            'company' => trim((string) ($validated['company'] ?? '')) ?: null,
            'email' => trim((string) ($validated['email'] ?? '')) ?: null,
            'phone' => trim((string) ($validated['phone'] ?? '')) ?: null,
            'notes' => array_key_exists('notes', $validated) ? $validated['notes'] : null,
            'lead_type_id' => $validated['lead_type_id'] ?? null,
            'lead_source' => trim((string) ($validated['lead_source'] ?? '')) ?: 'Kho số nhập tay',
            'lead_channel' => trim((string) ($validated['lead_channel'] ?? '')) ?: 'CRM Pool',
            'lead_message' => array_key_exists('lead_message', $validated) ? $validated['lead_message'] : null,
            'assigned_staff_id' => null,
            'assigned_department_id' => null,
            'sales_owner_id' => null,
            'is_in_rotation_pool' => true,
            'rotation_pool_entered_at' => $now->toDateTimeString(),
            'rotation_pool_reason' => 'manual_pool_entry',
            'care_rotation_reset_at' => $now->toDateTimeString(),
        ];

        $client = Client::create($payload);
        $this->syncClientCareStaff($client, [], (int) $user->id);

        return response()->json([
            'message' => 'Đã thêm khách hàng vào kho số.',
            'client' => [
                'id' => (int) $client->id,
                'name' => (string) ($client->name ?: 'Khách hàng'),
            ],
        ], 201);
    }

    /**
     * Chi tiết 1 khách (cùng cấu trúc quan hệ như danh sách) — dùng khi mở form sửa để không thiếu trường.
     */
    public function showClient(Request $request, Client $client): JsonResponse
    {
        $user = $request->user();
        $transferService = app(ClientStaffTransferService::class);
        $pending = $transferService->pendingForClient((int) $client->id);

        if ($client->inRotationPool()) {
            return response()->json([
                'message' => 'Khách hàng đang ở kho số. Hãy nhận khách để xem chi tiết đầy đủ.',
            ], 403);
        }

        if ($this->canAccessClient($user, $client)) {
            $clientRelations = [
                'leadType',
                'salesOwner',
                'revenueTier',
                'assignedDepartment',
                'assignedStaff',
                'facebookPage',
            ];
            if ($this->supportsClientCareStaff()) {
                $clientRelations[] = 'careStaffUsers:id,name,email';
            }

            $client->load($clientRelations);
            $client->loadCount(['opportunities', 'contracts']);

            $payload = $client->toArray();
            $payload['crm_access_mode'] = 'full';
            if ($pending) {
                $payload['pending_staff_transfer'] = $transferService->transferToArray($pending);
            }
            if ($pending && $transferService->viewerMustOnlyRespondTransfer($user, $client)) {
                $payload['crm_access_mode'] = 'transfer_receiver_pending';
            }
            $payload = $this->appendClientPermissionsToArray($payload, $client, $user, $transferService);

            return response()->json($payload);
        }

        if ($pending && (int) $pending->to_staff_id === (int) $user->id) {
            return response()->json([
                'id' => $client->id,
                'name' => $client->name,
                'company' => $client->company,
                'phone' => $client->phone,
                'email' => $client->email,
                'assigned_staff_id' => $client->assigned_staff_id,
                'assigned_department_id' => $client->assigned_department_id,
                'sales_owner_id' => $client->sales_owner_id,
                'crm_access_mode' => 'transfer_receiver_pending',
                'pending_staff_transfer' => $transferService->transferToArray($pending),
                'can_manage' => false,
                'can_delete' => false,
                'can_transfer' => false,
            ]);
        }

        return response()->json(['message' => 'Không có quyền xem khách hàng.'], 403);
    }

    public function claimRotationPoolClient(Request $request, Client $client): JsonResponse
    {
        $user = $request->user();
        if (! $this->canClaimRotationPool($user)) {
            return response()->json(['message' => 'Không có quyền nhận khách từ kho số.'], 403);
        }

        $rotationService = app(ClientAutoRotationService::class);
        $result = $rotationService->claimClientFromRotationPool((int) $client->id, $user);
        $status = (string) ($result['status'] ?? '');

        if ($status === 'claimed') {
            $rotationService->notifyRotationPoolClaimOutcome($result);

            return response()->json([
                'message' => 'Đã nhận khách hàng từ kho số.',
                'client_id' => (int) ($result['client_id'] ?? 0),
            ]);
        }

        return match ($status) {
            'not_in_pool' => response()->json(['message' => 'Khách hàng này không còn ở kho số.'], 422),
            'pending_transfer' => response()->json(['message' => 'Khách hàng đang có phiếu chuyển phụ trách chờ xử lý, chưa thể nhận từ kho số.'], 422),
            'daily_limit_reached' => response()->json([
                'message' => sprintf(
                    'Bạn đã đạt giới hạn nhận %d khách hàng từ kho số trong ngày. Vui lòng nhận thêm vào ngày mai hoặc liên hệ administrator để tăng quota kho số.',
                    max(1, (int) ($result['pool_claim_daily_limit'] ?? 1))
                ),
            ], 422),
            default => response()->json(['message' => 'Không thể nhận khách hàng từ kho số lúc này.'], 422),
        };
    }

    public function storeClient(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'company_profiles' => ['sometimes', 'array', 'max:20'],
            'company_profiles.*.id' => ['nullable', 'string', 'max:80'],
            'company_profiles.*.company_name' => ['nullable', 'string', 'max:255'],
            'company_profiles.*.address' => ['nullable', 'string', 'max:500'],
            'company_profiles.*.tax_code' => ['nullable', 'string', 'max:80'],
            'company_profiles.*.representative' => ['nullable', 'string', 'max:255'],
            'company_profiles.*.position' => ['nullable', 'string', 'max:255'],
            'company_profiles.*.is_default' => ['nullable', 'boolean'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'sales_owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'assigned_staff_id' => ['nullable', 'integer', 'exists:users,id'],
            'lead_type_id' => ['nullable', 'integer', 'exists:lead_types,id'],
            'lead_source' => ['nullable', 'string', 'max:100'],
            'lead_channel' => ['nullable', 'string', 'max:50'],
            'lead_message' => ['nullable', 'string'],
            'care_staff_ids' => ['sometimes', 'array'],
            'care_staff_ids.*' => ['integer', 'exists:users,id'],
        ]);

        if (empty($validated['lead_type_id'])) {
            $defaultLeadTypeId = LeadType::query()
                ->where('name', 'Khách hàng tiềm năng')
                ->value('id');
            if (! $defaultLeadTypeId) {
                $defaultLeadTypeId = LeadType::query()->orderBy('sort_order')->orderBy('id')->value('id');
            }
            if ($defaultLeadTypeId) {
                $validated['lead_type_id'] = $defaultLeadTypeId;
            }
        }

        $user = $request->user();
        if (array_key_exists('company_profiles', $validated) && ! $this->canManageClientCompanyProfiles($user)) {
            return response()->json(['message' => 'Chỉ administrator mới được cấu hình công ty pháp lý của khách hàng.'], 403);
        }
        if (array_key_exists('company_profiles', $validated)) {
            $validated['company_profiles'] = $this->normalizeClientCompanyProfiles($validated['company_profiles']);
        }
        $validated = $this->resolveClientAssignment($user, $validated);
        if (empty($validated['assigned_staff_id'])) {
            return response()->json([
                'message' => 'Vui lòng chọn nhân sự phụ trách trực tiếp cho khách hàng.',
            ], 422);
        }

        $phoneDup = ! empty($validated['phone'])
            ? app(ClientPhoneDuplicateService::class)->findExistingByPhone($validated['phone'])
            : null;
        if ($phoneDup) {
            return response()->json([
                'message' => 'Khách hàng với số điện thoại này đã tồn tại. Tên hiện tại: '.$phoneDup->name.'.',
                'existing_client' => [
                    'id' => (int) $phoneDup->id,
                    'name' => $phoneDup->name,
                ],
            ], 422);
        }

        try {
            $client = Client::create($validated);
        } catch (\Throwable $e) {
            Log::error('CRM create client failed', [
                'user_id' => (int) optional($user)->id,
                'payload' => [
                    'name' => $validated['name'] ?? null,
                    'assigned_department_id' => $validated['assigned_department_id'] ?? null,
                    'assigned_staff_id' => $validated['assigned_staff_id'] ?? null,
                    'sales_owner_id' => $validated['sales_owner_id'] ?? null,
                ],
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Không thể tạo khách hàng. Vui lòng kiểm tra lại thông tin phụ trách và thử lại.',
            ], 422);
        }
        $this->syncClientCareStaff(
            $client,
            $validated['care_staff_ids'] ?? [],
            (int) $user->id
        );
        try {
            app(LeadNotificationService::class)->notifyNewLead(
                $client,
                $this->resolveSourceLabel($client)
            );
        } catch (\Throwable $e) {
            Log::warning('CRM lead notification failed on storeClient', [
                'client_id' => (int) $client->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json($client->load($this->clientDetailRelations()), 201);
    }

    public function updateClient(Request $request, Client $client): JsonResponse
    {
        if (! $this->canManageClient($request->user(), $client)) {
            return response()->json(['message' => 'Không có quyền cập nhật khách hàng.'], 403);
        }
        if (app(ClientStaffTransferService::class)->viewerMustOnlyRespondTransfer($request->user(), $client)) {
            return response()->json([
                'message' => 'Bạn đang chờ xác nhận phiếu chuyển phụ trách — chưa thể chỉnh sửa khách hàng cho đến khi phiếu được xử lý.',
                'code' => 'client_transfer_receiver_pending',
            ], 403);
        }
        $oldAssignedStaffId = (int) ($client->assigned_staff_id ?? 0);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'company_profiles' => ['sometimes', 'array', 'max:20'],
            'company_profiles.*.id' => ['nullable', 'string', 'max:80'],
            'company_profiles.*.company_name' => ['nullable', 'string', 'max:255'],
            'company_profiles.*.address' => ['nullable', 'string', 'max:500'],
            'company_profiles.*.tax_code' => ['nullable', 'string', 'max:80'],
            'company_profiles.*.representative' => ['nullable', 'string', 'max:255'],
            'company_profiles.*.position' => ['nullable', 'string', 'max:255'],
            'company_profiles.*.is_default' => ['nullable', 'boolean'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'sales_owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'assigned_staff_id' => ['nullable', 'integer', 'exists:users,id'],
            'lead_type_id' => ['nullable', 'integer', 'exists:lead_types,id'],
            'lead_source' => ['nullable', 'string', 'max:100'],
            'lead_channel' => ['nullable', 'string', 'max:50'],
            'lead_message' => ['nullable', 'string'],
            'care_staff_ids' => ['sometimes', 'array'],
            'care_staff_ids.*' => ['integer', 'exists:users,id'],
        ]);
        $user = $request->user();
        if (array_key_exists('company_profiles', $validated) && ! $this->canManageClientCompanyProfiles($user)) {
            return response()->json(['message' => 'Chỉ administrator mới được cấu hình công ty pháp lý của khách hàng.'], 403);
        }
        if (array_key_exists('company_profiles', $validated)) {
            $validated['company_profiles'] = $this->normalizeClientCompanyProfiles($validated['company_profiles']);
        }
        $careStaffIdsProvided = array_key_exists('care_staff_ids', $validated);

        if ($user->role === 'nhan_vien') {
            if ($this->employeeAttemptedDirectAssignmentChange($validated, $client)) {
                return response()->json([
                    'message' => 'Nhân viên không được đổi phụ trách / phòng ban / nhóm chăm sóc trực tiếp trên form sửa. Vui lòng dùng chức năng «Chuyển phụ trách khách hàng» (phiếu chuyển giao).',
                    'code' => 'client_reassign_requires_transfer',
                ], 422);
            }
            $validated['assigned_staff_id'] = $client->assigned_staff_id;
            $validated['assigned_department_id'] = $client->assigned_department_id;
            $validated['sales_owner_id'] = $client->sales_owner_id;
            unset($validated['care_staff_ids']);
            $careStaffIdsProvided = false;
        }

        $validated = $this->resolveClientAssignment($user, $validated, $client);
        if (empty($validated['assigned_staff_id'])) {
            return response()->json([
                'message' => 'Khách hàng phải luôn có nhân sự phụ trách trực tiếp.',
            ], 422);
        }

        $phoneDup = ! empty($validated['phone'])
            ? app(ClientPhoneDuplicateService::class)->findExistingByPhone(
                $validated['phone'],
                (int) $client->id
            )
            : null;
        if ($phoneDup) {
            return response()->json([
                'message' => 'Khách hàng với số điện thoại này đã tồn tại. Tên hiện tại: '.$phoneDup->name.'.',
                'existing_client' => [
                    'id' => (int) $phoneDup->id,
                    'name' => $phoneDup->name,
                ],
            ], 422);
        }

        $newAssignedStaffCandidateId = array_key_exists('assigned_staff_id', $validated)
            ? (int) ($validated['assigned_staff_id'] ?? 0)
            : $oldAssignedStaffId;
        $willChangeAssignedStaff = $newAssignedStaffCandidateId !== $oldAssignedStaffId;
        $rotationService = $willChangeAssignedStaff ? app(ClientAutoRotationService::class) : null;
        $preAssignmentInsight = $willChangeAssignedStaff && $rotationService
            ? $rotationService->buildClientRotationInsight($client)
            : null;

        $client->update($validated);

        if ($careStaffIdsProvided && array_key_exists('care_staff_ids', $validated)) {
            $this->syncClientCareStaff(
                $client,
                $validated['care_staff_ids'] ?? [],
                (int) $user->id
            );
        }

        $newAssignedStaffId = (int) ($client->assigned_staff_id ?? 0);
        if ($newAssignedStaffId !== $oldAssignedStaffId) {
            $rotationService = $rotationService ?: app(ClientAutoRotationService::class);
            $rotationService->resetClientRotationAnchor($client);
            if (! $careStaffIdsProvided) {
                $rotationService->replaceClientCareStaffForAssignment(
                    $client,
                    $oldAssignedStaffId > 0 ? $oldAssignedStaffId : null,
                    $newAssignedStaffId > 0 ? $newAssignedStaffId : null,
                    (int) $user->id
                );
            }
            $rotationService->recordAssignmentHistory(
                $client,
                $oldAssignedStaffId > 0 ? $oldAssignedStaffId : null,
                $newAssignedStaffId > 0 ? $newAssignedStaffId : null,
                ClientAutoRotationService::ACTION_MANUAL_DIRECT_ASSIGNMENT,
                (int) $user->id,
                $preAssignmentInsight,
                null,
                'manual_direct_assignment',
                'Đổi phụ trách trực tiếp từ màn sửa khách hàng.'
            );
        }

        $this->notifyClientReassignment($client, $oldAssignedStaffId, $user);

        return response()->json($client->load($this->clientDetailRelations()));
    }

    public function destroyClient(Client $client): JsonResponse
    {
        $user = request()->user();
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Không có quyền xóa khách hàng.'], 403);
        }
        if (! $this->canManageClient($user, $client)) {
            return response()->json(['message' => 'Không có quyền xóa khách hàng.'], 403);
        }
        $client->delete();
        return response()->json(['message' => 'Xóa khách hàng thành công.']);
    }

    public function payments(Request $request): JsonResponse
    {
        $query = CustomerPayment::query()
            ->with('client')
            ->whereHas('client', function (Builder $clientQuery) {
                $clientQuery->withoutRotationPool();
            });
        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }
        return response()->json($query->orderByDesc('id')->paginate((int) $request->input('per_page', 10)));
    }

    public function storePayment(Request $request): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'ke_toan'], true)) {
            return response()->json(['message' => 'Không có quyền tạo thanh toán.'], 403);
        }
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'due_date' => ['nullable', 'date'],
            'paid_at' => ['nullable', 'date'],
            'status' => ['required', 'in:pending,paid,overdue'],
            'invoice_no' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string'],
        ]);
        $client = Client::query()->find((int) $validated['client_id']);
        if (! $client || $client->inRotationPool()) {
            return response()->json(['message' => 'Khách hàng đang ở kho số nên chưa thể ghi nhận thanh toán.'], 422);
        }
        $payment = CustomerPayment::create($validated);
        return response()->json($payment, 201);
    }

    public function updatePayment(Request $request, CustomerPayment $payment): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'ke_toan'], true)) {
            return response()->json(['message' => 'Không có quyền cập nhật thanh toán.'], 403);
        }
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'due_date' => ['nullable', 'date'],
            'paid_at' => ['nullable', 'date'],
            'status' => ['required', 'in:pending,paid,overdue'],
            'invoice_no' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string'],
        ]);
        $client = Client::query()->find((int) $validated['client_id']);
        if (! $client || $client->inRotationPool()) {
            return response()->json(['message' => 'Khách hàng đang ở kho số nên chưa thể cập nhật thanh toán.'], 422);
        }
        $payment->update($validated);
        return response()->json($payment);
    }

    public function destroyPayment(CustomerPayment $payment): JsonResponse
    {
        if (! in_array(request()->user()->role, ['admin', 'ke_toan'], true)) {
            return response()->json(['message' => 'Không có quyền xóa thanh toán.'], 403);
        }
        $payment->delete();
        return response()->json(['message' => 'Xóa thanh toán thành công.']);
    }

    private function normalizeSortDirection(string $direction): string
    {
        return strtolower($direction) === 'asc' ? 'asc' : 'desc';
    }

    private function applyClientSorting(
        Builder $query,
        string $sortBy,
        string $sortDir,
        string $lastActivityExpression
    ): void {
        $direction = $this->normalizeSortDirection($sortDir);
        $rawDirection = strtoupper($direction);

        switch ($sortBy) {
            case 'name':
                $query->orderBy('clients.name', $direction);
                break;
            case 'phone':
                $query->orderBy('clients.phone', $direction);
                break;
            case 'lead_type':
                $query->orderBy(
                    LeadType::query()
                        ->select('name')
                        ->whereColumn('lead_types.id', 'clients.lead_type_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'revenue_tier':
                $query->orderBy(
                    RevenueTier::query()
                        ->select('label')
                        ->whereColumn('revenue_tiers.id', 'clients.revenue_tier_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'department':
                $query->orderBy(
                    Department::query()
                        ->select('name')
                        ->whereColumn('departments.id', 'clients.assigned_department_id')
                        ->limit(1),
                    $direction
                );
                break;
            case 'assigned_staff':
                $query->orderByRaw(
                    'COALESCE(
                        (SELECT users.name FROM users WHERE users.id = clients.assigned_staff_id LIMIT 1),
                        (SELECT users.name FROM users WHERE users.id = clients.sales_owner_id LIMIT 1),
                        ""
                    ) ' . $rawDirection
                );
                break;
            case 'care_staff':
                $query->orderByRaw(
                    'COALESCE(
                        (
                            SELECT MIN(users.name)
                            FROM client_care_staff
                            INNER JOIN users ON users.id = client_care_staff.user_id
                            WHERE client_care_staff.client_id = clients.id
                        ),
                        ""
                    ) ' . $rawDirection
                );
                break;
            case 'created_at':
                $query->orderBy('clients.created_at', $direction);
                break;
            case 'product_categories':
                $query->orderBy('clients.product_categories', $direction);
                break;
            case 'notes':
                $query->orderBy('clients.notes', $direction);
                break;
            case 'total_revenue':
                $query->orderBy('clients.total_revenue', $direction);
                break;
            case 'total_debt_amount':
                $query->orderBy('clients.total_debt_amount', $direction);
                break;
            case 'opportunities_count':
                $query->orderBy('opportunities_count', $direction);
                break;
            case 'contracts_count':
                $query->orderBy('contracts_count', $direction);
                break;
            case 'lead_source':
                $query->orderBy('clients.lead_source', $direction)
                    ->orderBy('clients.lead_channel', $direction);
                break;
            case 'last_activity_at':
            default:
                $query->orderByRaw("{$lastActivityExpression} {$rawDirection}");
                break;
        }

        $query->orderBy('clients.id', $direction);
    }

    private function canAccessClient(User $user, Client $client): bool
    {
        return CrmScope::canAccessClient($user, $client);
    }

    private function canManageClient(User $user, Client $client): bool
    {
        return CrmScope::canManageClient($user, $client);
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

    private function resolveAssignedStaffFilterIds(Request $request): array
    {
        $raw = $request->input('assigned_staff_ids', []);
        if (is_string($raw)) {
            $trimmed = trim($raw);
            $raw = $trimmed === '' ? [] : (preg_split('/[\s,;|]+/', $trimmed) ?: []);
        }
        if (! is_array($raw)) {
            $raw = [];
        }

        if ($request->filled('assigned_staff_id')) {
            $raw[] = $request->input('assigned_staff_id');
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

    private function resolveClientAssignment(User $user, array $validated, ?Client $client = null): array
    {
        $requestedStaffId = ! empty($validated['assigned_staff_id'])
            ? (int) $validated['assigned_staff_id']
            : null;
        $requestedDepartmentId = ! empty($validated['assigned_department_id'])
            ? (int) $validated['assigned_department_id']
            : null;
        $requestedCareStaffIds = array_key_exists('care_staff_ids', $validated)
            ? collect((array) $validated['care_staff_ids'])
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function ($id) {
                    return $id > 0;
                })
                ->values()
                ->all()
            : null;

        if ($client === null && ! empty($validated['sales_owner_id']) && ! $requestedStaffId) {
            $requestedStaffId = (int) $validated['sales_owner_id'];
        }

        if ($user->role === 'nhan_vien') {
            if ($client === null) {
                $validated['assigned_staff_id'] = (int) $user->id;
                $validated['assigned_department_id'] = (int) ($user->department_id ?: $requestedDepartmentId);
                $validated['care_staff_ids'] = [(int) $user->id];

                return $validated;
            }

            return $validated;
        }

        if ($user->role === 'quan_ly') {
            $managedDeptIds = $user->managedDepartments()->pluck('id');
            $allowedUsers = User::query()
                ->where('is_active', true)
                ->where(function ($builder) use ($user) {
                    $builder->whereIn('department_id', $user->managedDepartments()->pluck('id'))
                        ->orWhere('id', $user->id);
                })
                ->get(['id', 'department_id'])
                ->keyBy('id');
            $allowedCareStaffIds = User::query()
                ->where('is_active', true)
                ->whereIn('department_id', $managedDeptIds)
                ->pluck('id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function ($id) {
                    return $id > 0;
                })
                ->values();

            if (! $requestedStaffId || ! $allowedUsers->has($requestedStaffId)) {
                $existingStaffId = $client ? (int) $client->assigned_staff_id : null;
                if ($existingStaffId && $allowedUsers->has($existingStaffId)) {
                    $requestedStaffId = $existingStaffId;
                } else {
                    $requestedStaffId = (int) $user->id;
                }
            }

            $validated['assigned_staff_id'] = $requestedStaffId;
            $resolvedDepartmentId = optional($allowedUsers->get($requestedStaffId))->department_id;
            $validated['assigned_department_id'] = $resolvedDepartmentId ? (int) $resolvedDepartmentId : null;
            $careSourceIds = $requestedCareStaffIds ?? $this->existingClientCareStaffIds($client);
            $careIds = collect($careSourceIds)
                ->filter(function ($id) use ($allowedCareStaffIds) {
                    return $allowedCareStaffIds->contains((int) $id);
                })
                ->map(function ($id) {
                    return (int) $id;
                })
                ->values();
            if ($requestedStaffId && $allowedCareStaffIds->contains((int) $requestedStaffId)) {
                $careIds->push((int) $requestedStaffId);
            }
            $validated['care_staff_ids'] = $careIds->unique()->values()->all();
            return $validated;
        }

        if (in_array((string) $user->role, ['admin', 'administrator'], true)) {
            if ($requestedStaffId) {
                $validated['assigned_staff_id'] = $requestedStaffId;
                $resolvedDepartmentId = User::query()
                    ->where('id', $requestedStaffId)
                    ->value('department_id');
                $validated['assigned_department_id'] = $resolvedDepartmentId
                    ? (int) $resolvedDepartmentId
                    : null;
            } elseif ($client) {
                $existingStaffId = (int) ($client->assigned_staff_id ?? 0);
                $validated['assigned_staff_id'] = $existingStaffId > 0 ? $existingStaffId : null;
                $validated['assigned_department_id'] = $client->assigned_department_id
                    ? (int) $client->assigned_department_id
                    : $requestedDepartmentId;
            } else {
                $validated['assigned_staff_id'] = null;
                $validated['assigned_department_id'] = $requestedDepartmentId;
            }

            $careSourceIds = $requestedCareStaffIds ?? $this->existingClientCareStaffIds($client);
            $careIds = collect($careSourceIds)
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function ($id) {
                    return $id > 0;
                });
            if ($requestedStaffId) {
                $careIds->push((int) $requestedStaffId);
            }
            $validated['care_staff_ids'] = $careIds->unique()->values()->all();

            return $validated;
        }

        return $validated;
    }

    private function resolveDefaultLeadTypeId(): ?int
    {
        $defaultLeadTypeId = LeadType::query()
            ->where('name', 'Khách hàng tiềm năng')
            ->value('id');
        if (! $defaultLeadTypeId) {
            $defaultLeadTypeId = LeadType::query()
                ->orderBy('sort_order')
                ->orderBy('id')
                ->value('id');
        }

        return $defaultLeadTypeId ? (int) $defaultLeadTypeId : null;
    }

    private function existingClientCareStaffIds(?Client $client): array
    {
        if (! $client) {
            return [];
        }

        $client->loadMissing('careStaffUsers:id');

        return $client->careStaffUsers
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->values()
            ->all();
    }

    private function appendClientPermissions(Client $client, User $user, ?ClientStaffTransferService $transferService = null): void
    {
        $transferService = $transferService ?: app(ClientStaffTransferService::class);
        $canManage = $this->canManageClient($user, $client);

        $client->setAttribute('can_manage', $canManage);
        $client->setAttribute(
            'can_delete',
            $canManage && in_array((string) $user->role, ['admin', 'administrator'], true)
        );
        $client->setAttribute('can_transfer', $transferService->canInitiate($user, $client));
    }

    private function appendClientPermissionsToArray(
        array $payload,
        Client $client,
        User $user,
        ?ClientStaffTransferService $transferService = null
    ): array {
        $transferService = $transferService ?: app(ClientStaffTransferService::class);
        $canManage = $this->canManageClient($user, $client);

        $payload['can_manage'] = $canManage;
        $payload['can_delete'] = $canManage && in_array((string) $user->role, ['admin', 'administrator'], true);
        $payload['can_transfer'] = $transferService->canInitiate($user, $client);

        return $payload;
    }

    /**
     * Nhân viên chỉ được đổi phụ trách qua phiếu chuyển giao — không qua PUT sửa khách.
     */
    private function employeeAttemptedDirectAssignmentChange(array $validated, Client $client): bool
    {
        $norm = static function ($v): int {
            return (int) ($v ?? 0);
        };

        if (array_key_exists('assigned_staff_id', $validated)) {
            if ($norm($validated['assigned_staff_id'] ?? null) !== $norm($client->assigned_staff_id)) {
                return true;
            }
        }
        if (array_key_exists('sales_owner_id', $validated)) {
            if ($norm($validated['sales_owner_id'] ?? null) !== $norm($client->sales_owner_id)) {
                return true;
            }
        }
        if (array_key_exists('assigned_department_id', $validated)) {
            if ($norm($validated['assigned_department_id'] ?? null) !== $norm($client->assigned_department_id)) {
                return true;
            }
        }
        if (array_key_exists('care_staff_ids', $validated) && $this->supportsClientCareStaff()) {
            $incoming = collect((array) ($validated['care_staff_ids'] ?? []))
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function (int $id) {
                    return $id > 0;
                })
                ->unique()
                ->sort()
                ->values()
                ->all();
            $existing = $client->careStaffUsers()
                ->pluck('id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->filter(function (int $id) {
                    return $id > 0;
                })
                ->unique()
                ->sort()
                ->values()
                ->all();

            return $incoming !== $existing;
        }

        return false;
    }

    private function syncClientCareStaff(Client $client, array $careStaffIds, int $assignedBy): void
    {
        if (! $this->supportsClientCareStaff()) {
            return;
        }

        $ids = collect($careStaffIds)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values();

        $syncPayload = $ids
            ->mapWithKeys(function ($id) use ($assignedBy) {
                return [
                    $id => ['assigned_by' => $assignedBy],
                ];
            })
            ->all();

        try {
            $client->careStaffUsers()->sync($syncPayload);
        } catch (\Throwable $e) {
            Log::warning('Client care staff sync failed', [
                'client_id' => (int) $client->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function clientDetailRelations(): array
    {
        $relations = [
            'leadType',
            'salesOwner',
            'revenueTier',
            'assignedDepartment',
            'assignedStaff',
        ];

        if ($this->supportsClientCareStaff()) {
            $relations[] = 'careStaffUsers:id,name,email';
        }

        return $relations;
    }

    private function supportsClientCareStaff(): bool
    {
        return Schema::hasTable('client_care_staff')
            && Schema::hasColumn('client_care_staff', 'client_id')
            && Schema::hasColumn('client_care_staff', 'user_id');
    }

    private function canManageClientCompanyProfiles(?User $user): bool
    {
        $role = strtolower((string) optional($user)->role);

        return in_array($role, ['admin', 'administrator'], true);
    }

    private function normalizeClientCompanyProfiles(array $profiles): array
    {
        $rows = collect($profiles)
            ->map(function ($profile) {
                $row = is_array($profile) ? $profile : [];

                $companyName = trim((string) ($row['company_name'] ?? ''));
                $address = trim((string) ($row['address'] ?? ''));
                $taxCode = trim((string) ($row['tax_code'] ?? ''));
                $representative = trim((string) ($row['representative'] ?? ''));
                $position = trim((string) ($row['position'] ?? ''));
                $hasAnyValue = $companyName !== ''
                    || $address !== ''
                    || $taxCode !== ''
                    || $representative !== ''
                    || $position !== '';

                if (! $hasAnyValue) {
                    return null;
                }

                return [
                    'id' => trim((string) ($row['id'] ?? '')) ?: Str::uuid()->toString(),
                    'company_name' => $companyName,
                    'address' => $address,
                    'tax_code' => $taxCode,
                    'representative' => $representative,
                    'position' => $position,
                    'is_default' => (bool) ($row['is_default'] ?? false),
                ];
            })
            ->filter()
            ->values();

        if ($rows->isEmpty()) {
            return [];
        }

        $defaultFound = false;
        $normalized = $rows->map(function (array $row, int $index) use (&$defaultFound) {
            if (! $defaultFound && ! empty($row['is_default'])) {
                $defaultFound = true;
                $row['is_default'] = true;

                return $row;
            }

            $row['is_default'] = false;
            if (! $defaultFound && $index === 0) {
                $defaultFound = true;
                $row['is_default'] = true;
            }

            return $row;
        });

        return $normalized->values()->all();
    }

    private function resolveSourceLabel(Client $client): string
    {
        if ((string) $client->lead_source === 'manual_entry' || ! $client->lead_source) {
            return 'Nhân viên thêm thủ công';
        }

        if ($client->lead_source && $client->lead_channel) {
            return (string) $client->lead_source.' / '.$client->lead_channel;
        }

        return (string) ($client->lead_source ?: 'CRM');
    }

    private function canViewRotationPool(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return in_array((string) $user->role, ['admin', 'administrator', 'quan_ly', 'nhan_vien'], true);
    }

    private function canClaimRotationPool(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return in_array((string) $user->role, ['quan_ly', 'nhan_vien'], true)
            && (! isset($user->is_active) || (bool) $user->is_active);
    }

    private function canManageRotationPool(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return in_array((string) $user->role, ['admin', 'administrator', 'quan_ly', 'nhan_vien'], true)
            && (! isset($user->is_active) || (bool) $user->is_active);
    }

    private function notifyClientReassignment(Client $client, int $oldAssignedStaffId, User $actor): void
    {
        $newAssignedStaffId = (int) ($client->assigned_staff_id ?? 0);
        if ($newAssignedStaffId <= 0 || $newAssignedStaffId === $oldAssignedStaffId) {
            return;
        }

        $client->loadMissing([
            'assignedStaff.departmentRelation.manager',
        ]);

        $assignedStaff = $client->assignedStaff;
        if (! $assignedStaff || ! $assignedStaff->is_active) {
            return;
        }

        $managerId = (int) optional(optional($assignedStaff->departmentRelation)->manager)->id;
        $recipientIds = collect([
            (int) $assignedStaff->id,
            $managerId > 0 ? $managerId : null,
        ])
            ->filter(function ($id) {
                return (int) $id > 0;
            })
            ->map(function ($id) {
                return (int) $id;
            })
            ->unique()
            ->values()
            ->all();

        if (empty($recipientIds)) {
            return;
        }

        $clientName = trim((string) ($client->name ?: 'Khách hàng'));
        $phone = trim((string) ($client->phone ?: 'Chưa có SĐT'));
        $assigneeName = trim((string) ($assignedStaff->name ?: 'Chưa rõ'));
        $departmentName = trim((string) optional($assignedStaff->departmentRelation)->name);
        $actorName = trim((string) ($actor->name ?: 'Hệ thống'));

        $body = sprintf(
            '%s • %s • Phụ trách mới: %s%s • Cập nhật bởi: %s',
            $clientName,
            $phone,
            $assigneeName,
            $departmentName !== '' ? ' ('.$departmentName.')' : '',
            $actorName
        );

        app(NotificationService::class)->notifyUsersAfterResponse(
            $recipientIds,
            'Khách hàng được đổi phụ trách',
            $body,
            [
                'type' => 'crm_client_reassigned',
                'category' => 'crm_realtime',
                'client_id' => (int) $client->id,
                'assigned_staff_id' => (int) $assignedStaff->id,
                'assigned_staff_name' => $assigneeName,
                'department_id' => $assignedStaff->department_id ? (int) $assignedStaff->department_id : null,
                'manager_id' => $managerId > 0 ? $managerId : null,
                'previous_assigned_staff_id' => $oldAssignedStaffId > 0 ? $oldAssignedStaffId : null,
                'changed_by_user_id' => (int) $actor->id,
                'changed_by_user_name' => $actorName,
            ]
        );
    }
}
