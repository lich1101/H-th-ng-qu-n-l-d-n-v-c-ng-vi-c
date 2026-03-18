<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\ContractItem;
use App\Models\Product;
use App\Models\Project;
use App\Models\RevenueTier;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ContractController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Contract::query()
            ->with(['client', 'project', 'opportunity', 'creator', 'approver', 'collector'])
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
        if ($request->filled('approval_status')) {
            $query->where('approval_status', (string) $request->input('approval_status'));
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
                    ->orWhereHas('client', function ($clientQuery) use ($search) {
                        $clientQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%");
                    });
            });
        }

        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 15))
        );
    }

    public function show(Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract(request()->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem hợp đồng.'], 403);
        }
        return response()->json(
            $contract->load(['client', 'project', 'opportunity', 'creator', 'approver', 'collector', 'items', 'payments', 'costs'])
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules(null, true));
        $client = $this->resolveAccessibleClient($request, (int) $validated['client_id']);
        if (! $client) {
            return response()->json(['message' => 'Bạn chỉ được chọn khách hàng mà mình đang quản lý.'], 403);
        }
        if (empty($validated['code'])) {
            $validated['code'] = $this->generateContractCode();
        }
        $validated['created_by'] = $request->user()->id;
        unset($validated['project_id']);

        $items = $this->normalizeItems($request->input('items', []));
        if (! empty($items)) {
            $validated['value'] = $this->sumItems($items);
        }

        if (! empty($request->input('project_id'))) {
            $validated['project_id'] = (int) $request->input('project_id');
            $project = Project::find($validated['project_id']);
            if (! $project) {
                return response()->json(['message' => 'Project không tồn tại.'], 422);
            }
            if ((int) $project->client_id !== (int) $client->id) {
                return response()->json(['message' => 'Project không thuộc khách hàng này.'], 422);
            }
        }

        $validated['collector_user_id'] = $this->resolveCollectorUserId($request, $validated);
        $validated = array_merge($validated, $this->resolveApproval($request));

        $contract = Contract::create($validated);

        if (! empty($validated['project_id'])) {
            Project::where('id', $validated['project_id'])->update([
                'contract_id' => $contract->id,
            ]);
        }

        if (! empty($items)) {
            $this->syncItems($contract, $items);
        }

        $contract->refreshFinancials();

        if ($contract->approval_status === 'approved') {
            $this->syncClientRevenue($contract->client);
        }

        if (($contract->approval_status ?? '') === 'pending') {
            $accountantIds = User::query()
                ->whereIn('role', ['admin', 'ke_toan'])
                ->pluck('id')
                ->reject(function ($id) use ($request) {
                    return (int) $id === (int) $request->user()->id;
                })
                ->all();
            if (! empty($accountantIds)) {
                try {
                    app(NotificationService::class)->notifyUsersAfterResponse(
                        $accountantIds,
                        'Hợp đồng mới cần duyệt',
                        'Hợp đồng: '.$contract->title,
                        [
                            'type' => 'contract_approval',
                            'contract_id' => $contract->id,
                        ]
                    );
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        return response()->json($contract->load(['client', 'project', 'opportunity', 'creator', 'approver', 'collector', 'items']), 201);
    }

    public function update(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền cập nhật hợp đồng.'], 403);
        }
        $validated = $request->validate($this->rules($contract->id, true));
        $client = $this->resolveAccessibleClient($request, (int) $validated['client_id']);
        if (! $client) {
            return response()->json(['message' => 'Bạn chỉ được chọn khách hàng mà mình đang quản lý.'], 403);
        }
        $oldProjectId = $contract->project_id;

        $items = $this->normalizeItems($request->input('items', []));
        if (! empty($items)) {
            $validated['value'] = $this->sumItems($items);
        }

        $validated['collector_user_id'] = $this->resolveCollectorUserId($request, $validated, $contract);

        if (! empty($validated['project_id'])) {
            $project = Project::find($validated['project_id']);
            if (! $project) {
                return response()->json(['message' => 'Project không tồn tại.'], 422);
            }
            if ((int) $project->client_id !== (int) $client->id) {
                return response()->json(['message' => 'Project không thuộc khách hàng này.'], 422);
            }
        }

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

        if (! empty($contract->project_id)) {
            Project::where('id', $contract->project_id)->update([
                'contract_id' => $contract->id,
            ]);
        }

        if ($oldProjectId && $oldProjectId !== $contract->project_id) {
            Project::where('id', $oldProjectId)
                ->where('contract_id', $contract->id)
                ->update(['contract_id' => null]);
        }

        if (! empty($items)) {
            $this->syncItems($contract, $items);
        }

        $contract->refreshFinancials();

        $contract->refresh();
        if ($contract->client) {
            $this->syncClientRevenue($contract->client);
        }

        return response()->json($contract->load(['client', 'project', 'opportunity', 'creator', 'approver', 'collector', 'items']));
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

    public function destroy(Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract(request()->user(), $contract)) {
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

    private function rules(?int $contractId = null, bool $withOptional = false): array
    {
        $rules = [
            'code' => [
                'nullable',
                'string',
                'max:40',
                Rule::unique('contracts', 'code')->ignore($contractId),
            ],
            'title' => ['required', 'string', 'max:255'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'opportunity_id' => ['nullable', 'integer', 'exists:opportunities,id'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
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
            $allowedIds = User::query()
                ->where('is_active', true)
                ->where(function (Builder $builder) use ($user) {
                    $builder->whereIn('department_id', $user->managedDepartments()->pluck('id'))
                        ->orWhere('id', $user->id);
                })
                ->pluck('id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->all();

            if ($requestedCollectorId && in_array($requestedCollectorId, $allowedIds, true)) {
                return $requestedCollectorId;
            }

            if ($contract && $contract->collector_user_id && in_array((int) $contract->collector_user_id, $allowedIds, true)) {
                return (int) $contract->collector_user_id;
            }

            return (int) $user->id;
        }

        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            if ($requestedCollectorId) {
                $exists = User::query()
                    ->where('id', $requestedCollectorId)
                    ->where('is_active', true)
                    ->exists();
                if ($exists) {
                    return $requestedCollectorId;
                }
            }

            if ($contract && $contract->collector_user_id) {
                return (int) $contract->collector_user_id;
            }

            return (int) $user->id;
        }

        return $requestedCollectorId ?: ($contract ? (int) $contract->collector_user_id : null);
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
                ? (float) $item['unit_price']
                : ($product ? (float) $product->unit_price : 0);
            $quantity = max(1, (int) ($item['quantity'] ?? 1));
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

    private function canAccessContract(User $user, Contract $contract): bool
    {
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return true;
        }
        if (! $contract->client) {
            $contract->load('client');
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return $contract->client
                && $contract->client->assigned_department_id
                && $deptIds->contains($contract->client->assigned_department_id);
        }

        return $contract->client && (int) $contract->client->assigned_staff_id === (int) $user->id;
    }

    private function resolveAccessibleClient(Request $request, int $clientId): ?Client
    {
        $query = Client::query()->where('id', $clientId);
        CrmScope::applyClientScope($query, $request->user());

        return $query->first();
    }
}
