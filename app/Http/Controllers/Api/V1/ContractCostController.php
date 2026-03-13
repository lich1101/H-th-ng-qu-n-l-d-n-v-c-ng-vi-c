<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\ContractCost;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContractCostController extends Controller
{
    public function index(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem chi phí hợp đồng.'], 403);
        }

        return response()->json(
            $contract->costs()->orderByDesc('cost_date')->orderByDesc('id')->get()
        );
    }

    public function store(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền tạo chi phí hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'cost_date' => ['nullable', 'date'],
            'cost_type' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string'],
        ]);
        $validated['created_by'] = $request->user()->id;

        $cost = $contract->costs()->create($validated);
        $contract->refreshFinancials();

        return response()->json($cost, 201);
    }

    public function update(Request $request, Contract $contract, ContractCost $cost): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật chi phí hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }
        if ((int) $cost->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Chi phí không thuộc hợp đồng.'], 422);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'cost_date' => ['nullable', 'date'],
            'cost_type' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string'],
        ]);
        $cost->update($validated);
        $contract->refreshFinancials();

        return response()->json($cost);
    }

    public function destroy(Request $request, Contract $contract, ContractCost $cost): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền xóa chi phí hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }
        if ((int) $cost->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Chi phí không thuộc hợp đồng.'], 422);
        }

        $cost->delete();
        $contract->refreshFinancials();

        return response()->json(['message' => 'Đã xóa chi phí hợp đồng.']);
    }

    private function canManage(?User $user): bool
    {
        return $user && in_array($user->role, ['admin', 'ke_toan'], true);
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
}
