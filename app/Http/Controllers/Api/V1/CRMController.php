<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\CustomerPayment;
use App\Models\Department;
use App\Models\LeadType;
use App\Models\RevenueTier;
use App\Models\User;
use App\Services\LeadNotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class CRMController extends Controller
{
    public function clients(Request $request): JsonResponse
    {
        $query = Client::query()
            ->with([
                'leadType',
                'salesOwner',
                'revenueTier',
                'assignedDepartment',
                'assignedStaff',
                'facebookPage',
                'careStaffUsers:id,name,email',
            ])
            ->withCount(['opportunities', 'contracts']);
        CrmScope::applyClientScope($query, $request->user());
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($builder) use ($search) {
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
            });
        }
        if ($request->filled('type')) {
            if ($request->input('type') === 'potential') {
                $query->whereDoesntHave('contracts', function ($q) {
                    $q->whereIn('status', ['success', 'active']);
                });
            }
            if ($request->input('type') === 'active') {
                $query->whereHas('contracts', function ($q) {
                    $q->whereIn('status', ['success', 'active']);
                });
            }
        }
        if ($request->filled('lead_type_id')) {
            $query->where('lead_type_id', (int) $request->input('lead_type_id'));
        }
        if ($request->filled('revenue_tier_id')) {
            $query->where('revenue_tier_id', (int) $request->input('revenue_tier_id'));
        }
        if ($request->filled('assigned_department_id')) {
            $departmentId = (int) $request->input('assigned_department_id');
            $query->where(function ($builder) use ($departmentId) {
                $builder->where('assigned_department_id', $departmentId)
                    ->orWhereHas('assignedStaff', function ($staffQuery) use ($departmentId) {
                        $staffQuery->where('department_id', $departmentId);
                    });
            });
        }
        if ($request->filled('assigned_staff_id')) {
            $staffId = (int) $request->input('assigned_staff_id');
            $query->where(function ($builder) use ($staffId) {
                $builder->where('assigned_staff_id', $staffId)
                    ->orWhere('sales_owner_id', $staffId);
            });
        }
        if ($request->boolean('lead_only')) {
            $query->whereNotNull('lead_type_id');
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

        return response()->json(
            $query
                ->paginate((int) $request->input('per_page', 10))
        );
    }

    public function storeClient(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
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
        $validated = $this->resolveClientAssignment($user, $validated);

        if (! empty($validated['assigned_staff_id']) && empty($validated['sales_owner_id'])) {
            $validated['sales_owner_id'] = $validated['assigned_staff_id'];
        }

        $client = Client::create($validated);
        $this->syncClientCareStaff(
            $client,
            $validated['care_staff_ids'] ?? [],
            (int) $user->id
        );
        app(LeadNotificationService::class)->notifyNewLead(
            $client,
            $this->resolveSourceLabel($client)
        );

        return response()->json($client->load([
            'leadType',
            'salesOwner',
            'revenueTier',
            'assignedDepartment',
            'assignedStaff',
            'careStaffUsers:id,name,email',
        ]), 201);
    }

    public function updateClient(Request $request, Client $client): JsonResponse
    {
        if (! $this->canManageClient($request->user(), $client)) {
            return response()->json(['message' => 'Không có quyền cập nhật khách hàng.'], 403);
        }
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
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
        $validated = $this->resolveClientAssignment($user, $validated, $client);

        if (! empty($validated['assigned_staff_id']) && empty($validated['sales_owner_id'])) {
            $validated['sales_owner_id'] = $validated['assigned_staff_id'];
        }
        $client->update($validated);
        if (array_key_exists('care_staff_ids', $validated)) {
            $this->syncClientCareStaff(
                $client,
                $validated['care_staff_ids'] ?? [],
                (int) $user->id
            );
        }

        return response()->json($client->load([
            'leadType',
            'salesOwner',
            'revenueTier',
            'assignedDepartment',
            'assignedStaff',
            'careStaffUsers:id,name,email',
        ]));
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
        $query = CustomerPayment::query()->with('client');
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
        if (CrmScope::hasGlobalScope($user)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            return CrmScope::canManagerAccessClient($user, $client);
        }

        if ((int) $client->assigned_staff_id === (int) $user->id) {
            return true;
        }

        if ((int) $client->sales_owner_id === (int) $user->id) {
            return true;
        }

        return $client->careStaffUsers()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function canManageClient(User $user, Client $client): bool
    {
        if (in_array($user->role, ['admin'], true)) {
            return true;
        }

        if ($user->role === 'quan_ly') {
            return CrmScope::canManagerAccessClient($user, $client);
        }

        return (int) $client->assigned_staff_id === (int) $user->id;
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

        if (! empty($validated['sales_owner_id']) && ! $requestedStaffId) {
            $requestedStaffId = (int) $validated['sales_owner_id'];
        }

        if ($user->role === 'nhan_vien') {
            $validated['assigned_staff_id'] = (int) $user->id;
            $validated['assigned_department_id'] = (int) ($user->department_id ?: $requestedDepartmentId);
            $validated['care_staff_ids'] = [(int) $user->id];
            return $validated;
        }

        if ($user->role === 'quan_ly') {
            $allowedUsers = User::query()
                ->where('is_active', true)
                ->where(function ($builder) use ($user) {
                    $builder->whereIn('department_id', $user->managedDepartments()->pluck('id'))
                        ->orWhere('id', $user->id);
                })
                ->get(['id', 'department_id'])
                ->keyBy('id');

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
            $careIds = collect($requestedCareStaffIds ?? [])
                ->filter(function ($id) use ($allowedUsers) {
                    return $allowedUsers->has((int) $id);
                })
                ->map(function ($id) {
                    return (int) $id;
                })
                ->values();
            if ($requestedStaffId) {
                $careIds->push((int) $requestedStaffId);
            }
            $validated['care_staff_ids'] = $careIds->unique()->values()->all();
            return $validated;
        }

        if ($user->role === 'admin') {
            if ($requestedStaffId) {
                $validated['assigned_staff_id'] = $requestedStaffId;
                $validated['assigned_department_id'] = (int) User::query()
                    ->where('id', $requestedStaffId)
                    ->value('department_id');
            } else {
                $validated['assigned_staff_id'] = null;
                $validated['assigned_department_id'] = $requestedDepartmentId;
            }

            $careIds = collect($requestedCareStaffIds ?? [])
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

    private function syncClientCareStaff(Client $client, array $careStaffIds, int $assignedBy): void
    {
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

        $client->careStaffUsers()->sync($syncPayload);
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
}
