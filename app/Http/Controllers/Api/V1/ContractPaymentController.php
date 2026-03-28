<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Client;
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

        if ($error = $this->validatePaymentCap($contract, (float) $validated['amount'])) {
            return response()->json(['message' => $error], 422);
        }

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

        if ($error = $this->validatePaymentCap($contract, (float) $validated['amount'], $payment)) {
            return response()->json(['message' => $error], 422);
        }

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

        if ($this->isManagerOfContractDepartment($user, $contract)) {
            return true;
        }

        if ($user->role !== 'nhan_vien') {
            return false;
        }

        return $this->isStaffLinkedToContract($user, $contract);
    }

    private function isManagerOfContractDepartment(User $user, Contract $contract): bool
    {
        if ($user->role !== 'quan_ly') {
            return false;
        }

        if ((int) $contract->collector_user_id === (int) $user->id) {
            return true;
        }

        $deptIds = $user->managedDepartments()->pluck('id');
        if ($deptIds->isEmpty()) {
            return false;
        }

        $contract->loadMissing('client');
        if ($contract->client && $contract->client->assigned_department_id && $deptIds->contains((int) $contract->client->assigned_department_id)) {
            return true;
        }

        $contract->loadMissing('collector');
        $contract->loadMissing('careStaffUsers:id,department_id');

        if ($contract->collector
            && $contract->collector->department_id
            && $deptIds->contains((int) $contract->collector->department_id)) {
            return true;
        }

        return $contract->careStaffUsers->contains(function ($staff) use ($deptIds) {
            return $staff->department_id && $deptIds->contains((int) $staff->department_id);
        });
    }

    private function isStaffLinkedToContract(User $user, Contract $contract): bool
    {
        if ((int) $contract->created_by === (int) $user->id) {
            return true;
        }
        if ((int) $contract->collector_user_id === (int) $user->id) {
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

        return $this->isCareStaff($user, $client) || $this->isContractCareStaff($user, $contract);
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

    private function validatePaymentCap(Contract $contract, float $nextAmount, ?ContractPayment $currentPayment = null): ?string
    {
        $contractValue = (float) ($contract->value ?? 0);
        $existingTotal = (float) $contract->payments()->sum('amount');

        if ($currentPayment) {
            $existingTotal -= (float) ($currentPayment->amount ?? 0);
        }

        $projectedTotal = $existingTotal + max(0, $nextAmount);
        if ($projectedTotal <= $contractValue + 0.0001) {
            return null;
        }

        $remaining = max(0, $contractValue - $existingTotal);

        return 'Số tiền thanh toán vượt giá trị hợp đồng. Chỉ còn có thể thu tối đa '
            .number_format($remaining, 0, ',', '.')
            .' VNĐ.';
    }
}
