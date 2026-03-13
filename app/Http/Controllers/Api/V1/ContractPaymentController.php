<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\ContractPayment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContractPaymentController extends Controller
{
    public function index(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền xem thanh toán hợp đồng.'], 403);
        }

        return response()->json(
            $contract->payments()->orderByDesc('paid_at')->orderByDesc('id')->get()
        );
    }

    public function store(Request $request, Contract $contract): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền tạo thanh toán hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'paid_at' => ['nullable', 'date'],
            'method' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string'],
        ]);
        $validated['created_by'] = $request->user()->id;

        $payment = $contract->payments()->create($validated);
        $contract->refreshFinancials();

        return response()->json($payment, 201);
    }

    public function update(Request $request, Contract $contract, ContractPayment $payment): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền cập nhật thanh toán hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }
        if ((int) $payment->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Thanh toán không thuộc hợp đồng.'], 422);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'paid_at' => ['nullable', 'date'],
            'method' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string'],
        ]);
        $payment->update($validated);
        $contract->refreshFinancials();

        return response()->json($payment);
    }

    public function destroy(Request $request, Contract $contract, ContractPayment $payment): JsonResponse
    {
        if (! $this->canManage($request->user())) {
            return response()->json(['message' => 'Không có quyền xóa thanh toán hợp đồng.'], 403);
        }
        if (! $this->canAccessContract($request->user(), $contract)) {
            return response()->json(['message' => 'Không có quyền thao tác hợp đồng.'], 403);
        }
        if ((int) $payment->contract_id !== (int) $contract->id) {
            return response()->json(['message' => 'Thanh toán không thuộc hợp đồng.'], 422);
        }

        $payment->delete();
        $contract->refreshFinancials();

        return response()->json(['message' => 'Đã xóa thanh toán hợp đồng.']);
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
