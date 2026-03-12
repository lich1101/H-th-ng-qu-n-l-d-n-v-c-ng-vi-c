<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\CustomerPayment;
use App\Models\LeadType;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CRMController extends Controller
{
    public function clients(Request $request): JsonResponse
    {
        $query = Client::query()->with(['leadType', 'salesOwner', 'revenueTier', 'assignedDepartment', 'assignedStaff']);
        CrmScope::applyClientScope($query, $request->user());
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('company', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
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
        if ($request->boolean('lead_only')) {
            $query->whereNotNull('lead_type_id');
        }
        return response()->json($query->orderByDesc('id')->paginate((int) $request->input('per_page', 10)));
    }

    public function storeClient(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string'],
            'sales_owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'assigned_staff_id' => ['nullable', 'integer', 'exists:users,id'],
            'lead_type_id' => ['nullable', 'integer', 'exists:lead_types,id'],
            'lead_source' => ['nullable', 'string', 'max:100'],
            'lead_channel' => ['nullable', 'string', 'max:50'],
            'lead_message' => ['nullable', 'string'],
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
        if ($user->role !== 'admin') {
            $validated['assigned_department_id'] = $validated['assigned_department_id'] ?? $user->department_id;
            $validated['assigned_staff_id'] = $validated['assigned_staff_id'] ?? $user->id;
        }

        if ($user->role === 'admin') {
            if (empty($validated['assigned_staff_id']) && ! empty($validated['sales_owner_id'])) {
                $validated['assigned_staff_id'] = $validated['sales_owner_id'];
            }

            if (empty($validated['assigned_department_id']) && ! empty($validated['assigned_staff_id'])) {
                $deptId = User::query()->where('id', $validated['assigned_staff_id'])->value('department_id');
                if ($deptId) {
                    $validated['assigned_department_id'] = $deptId;
                }
            }
        }

        if (! empty($validated['assigned_staff_id']) && empty($validated['sales_owner_id'])) {
            $validated['sales_owner_id'] = $validated['assigned_staff_id'];
        }

        $client = Client::create($validated);

        return response()->json($client->load(['leadType', 'salesOwner', 'revenueTier', 'assignedDepartment', 'assignedStaff']), 201);
    }

    public function updateClient(Request $request, Client $client): JsonResponse
    {
        if (! $this->canAccessClient($request->user(), $client)) {
            return response()->json(['message' => 'Không có quyền cập nhật khách hàng.'], 403);
        }
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string'],
            'sales_owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'assigned_staff_id' => ['nullable', 'integer', 'exists:users,id'],
            'lead_type_id' => ['nullable', 'integer', 'exists:lead_types,id'],
            'lead_source' => ['nullable', 'string', 'max:100'],
            'lead_channel' => ['nullable', 'string', 'max:50'],
            'lead_message' => ['nullable', 'string'],
        ]);
        $user = $request->user();
        if ($user->role !== 'admin') {
            unset($validated['assigned_department_id'], $validated['assigned_staff_id']);
        }

        if ($user->role === 'admin') {
            if (empty($validated['assigned_staff_id']) && ! empty($validated['sales_owner_id'])) {
                $validated['assigned_staff_id'] = $validated['sales_owner_id'];
            }

            if (empty($validated['assigned_department_id']) && ! empty($validated['assigned_staff_id'])) {
                $deptId = User::query()->where('id', $validated['assigned_staff_id'])->value('department_id');
                if ($deptId) {
                    $validated['assigned_department_id'] = $deptId;
                }
            }
        }

        if (! empty($validated['assigned_staff_id']) && empty($validated['sales_owner_id'])) {
            $validated['sales_owner_id'] = $validated['assigned_staff_id'];
        }
        $client->update($validated);
        return response()->json($client->load(['leadType', 'salesOwner', 'revenueTier', 'assignedDepartment', 'assignedStaff']));
    }

    public function destroyClient(Client $client): JsonResponse
    {
        $user = request()->user();
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Không có quyền xóa khách hàng.'], 403);
        }
        if (! $this->canAccessClient($user, $client)) {
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

    private function canAccessClient(User $user, Client $client): bool
    {
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return true;
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return $client->assigned_department_id && $deptIds->contains($client->assigned_department_id);
        }

        return (int) $client->assigned_staff_id === (int) $user->id;
    }
}
