<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Opportunity;
use App\Models\OpportunityStatus;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OpportunityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Opportunity::query()->with([
            'client:id,name,company,email,phone',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusConfig:id,code,name,color_hex,sort_order',
        ]);
        CrmScope::applyOpportunityScope($query, $request->user());

        if ($request->filled('client_id')) {
            $query->where('client_id', (int) $request->input('client_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%")
                    ->orWhere('opportunity_type', 'like', "%{$search}%")
                    ->orWhere('source', 'like', "%{$search}%")
                    ->orWhereHas('client', function ($c) use ($search) {
                        $c->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    });
            });
        }

        $result = $query
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 20));

        return response()->json($result);
    }

    public function store(Request $request): JsonResponse
    {
        $statusCodes = OpportunityStatus::query()->pluck('code')->all();
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'opportunity_type' => ['nullable', 'string', 'max:120'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', Rule::in($statusCodes)],
            'source' => ['nullable', 'string', 'max:120'],
            'success_probability' => ['nullable', 'integer', 'min:0', 'max:100'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'watcher_ids' => ['nullable', 'array'],
            'watcher_ids.*' => ['integer', 'exists:users,id'],
            'expected_close_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        $validated['status'] = $validated['status'] ?? $this->defaultStatusCode();
        $validated['created_by'] = $request->user()->id;
        if (empty($validated['assigned_to'])) {
            $validated['assigned_to'] = (int) $request->user()->id;
        }
        $validated['watcher_ids'] = $this->normalizeWatcherIds($validated['watcher_ids'] ?? []);

        $opportunity = Opportunity::create($validated);
        $opportunity->load([
            'client:id,name,company,email,phone',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusConfig:id,code,name,color_hex,sort_order',
        ]);

        if ($request->user()->role === 'nhan_vien') {
            $this->notifyNewOpportunityFromStaff($opportunity, $request->user());
        }

        return response()->json($opportunity, 201);
    }

    private function notifyNewOpportunityFromStaff(Opportunity $opportunity, User $creator): void
    {
        try {
            $adminIds = User::query()->where('role', 'admin')->pluck('id')->all();
            
            $managerId = null;
            if ($creator->department_id) {
                // Fetch the manager of the department
                $managerId = \App\Models\Department::query()
                    ->where('id', $creator->department_id)
                    ->value('manager_id');
            }

            $targetIds = array_merge($adminIds, array_filter([$managerId]));
            $targetIds = array_values(array_filter(array_unique(array_map('intval', $targetIds)), function($id) use ($creator) {
                return $id > 0 && $id !== (int) $creator->id;
            }));

            if (empty($targetIds)) {
                return;
            }

            $clientName = $opportunity->client ? ($opportunity->client->name ?: 'Không tên') : 'Không rõ';
            $startDate = $opportunity->created_at ? $opportunity->created_at->format('d/m/Y') : now()->format('d/m/Y');
            $endDate = $opportunity->expected_close_date 
                ? \Carbon\Carbon::parse($opportunity->expected_close_date)->format('d/m/Y') 
                : 'không xác định';

            $title = 'Cơ hội mới từ nhân viên';
            $body = "Khách hàng {$clientName} có thêm cơ hội {$opportunity->title} có thời hạn từ {$startDate} đến {$endDate}";

            app(\App\Services\NotificationService::class)->notifyUsersAfterResponse(
                $targetIds,
                $title,
                $body,
                [
                    'type' => 'crm_notification',
                    'opportunity_id' => $opportunity->id,
                    'creator_id' => $creator->id,
                ]
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Notify new opportunity from staff failed: ' . $e->getMessage());
        }
    }

    public function show(Opportunity $opportunity): JsonResponse
    {
        if (! $this->canAccessOpportunity(request()->user(), $opportunity)) {
            return response()->json(['message' => 'Không có quyền xem cơ hội.'], 403);
        }
        return response()->json($opportunity->load([
            'client:id,name,company,email,phone',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusConfig:id,code,name,color_hex,sort_order',
            'contracts',
        ]));
    }

    public function update(Request $request, Opportunity $opportunity): JsonResponse
    {
        if (! $this->canAccessOpportunity($request->user(), $opportunity)) {
            return response()->json(['message' => 'Không có quyền cập nhật cơ hội.'], 403);
        }
        $statusCodes = OpportunityStatus::query()->pluck('code')->all();
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'opportunity_type' => ['nullable', 'string', 'max:120'],
            'client_id' => ['sometimes', 'required', 'integer', 'exists:clients,id'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', Rule::in($statusCodes)],
            'source' => ['nullable', 'string', 'max:120'],
            'success_probability' => ['nullable', 'integer', 'min:0', 'max:100'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'watcher_ids' => ['nullable', 'array'],
            'watcher_ids.*' => ['integer', 'exists:users,id'],
            'expected_close_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        if (array_key_exists('watcher_ids', $validated)) {
            $validated['watcher_ids'] = $this->normalizeWatcherIds($validated['watcher_ids'] ?? []);
        }
        $opportunity->update($validated);
        return response()->json($opportunity->load([
            'client:id,name,company,email,phone',
            'assignee:id,name,email,role',
            'creator:id,name,email,role',
            'product:id,name,code',
            'statusConfig:id,code,name,color_hex,sort_order',
        ]));
    }

    public function destroy(Opportunity $opportunity): JsonResponse
    {
        if (request()->user()->role !== 'admin') {
            return response()->json(['message' => 'Không có quyền xóa cơ hội.'], 403);
        }
        $opportunity->delete();
        return response()->json(['message' => 'Đã xóa cơ hội.']);
    }

    private function canAccessOpportunity(User $user, Opportunity $opportunity): bool
    {
        if (CrmScope::hasGlobalScope($user)) {
            return true;
        }
        if (! $opportunity->client) {
            $opportunity->load('client');
        }
        if ($user->role === 'quan_ly') {
            return CrmScope::canManagerAccessOpportunity($user, $opportunity);
        }

        $watchers = collect((array) ($opportunity->watcher_ids ?? []))
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            });

        return ($opportunity->client && (
            (int) $opportunity->client->assigned_staff_id === (int) $user->id
            || (int) $opportunity->client->sales_owner_id === (int) $user->id
            || (int) $opportunity->created_by === (int) $user->id
            || (int) $opportunity->assigned_to === (int) $user->id
        )) || $watchers->contains((int) $user->id);
    }

    private function defaultStatusCode(): string
    {
        $default = OpportunityStatus::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->value('code');

        return $default ?: 'open';
    }

    /**
     * @param  array<int, mixed>  $rawIds
     * @return array<int, int>
     */
    private function normalizeWatcherIds(array $rawIds): array
    {
        $normalized = collect($rawIds)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();

        return $normalized;
    }
}
