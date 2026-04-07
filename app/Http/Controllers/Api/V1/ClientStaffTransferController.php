<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Client;
use App\Models\ClientStaffTransferRequest;
use App\Services\ClientStaffTransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientStaffTransferController extends Controller
{
    public function index(Request $request, ClientStaffTransferService $service): JsonResponse
    {
        $user = $request->user();
        $query = ClientStaffTransferRequest::query()
            ->where('status', ClientStaffTransferService::STATUS_PENDING)
            ->with(['client:id,name,assigned_department_id', 'fromStaff:id,name,email', 'toStaff:id,name,email', 'requestedBy:id,name']);

        if (! CrmScope::hasGlobalScope($user)) {
            $query->where(function ($b) use ($user) {
                $b->where('to_staff_id', (int) $user->id)
                    ->orWhere('from_staff_id', (int) $user->id)
                    ->orWhere('requested_by_user_id', (int) $user->id);
                if ($user->role === 'quan_ly') {
                    $deptIds = CrmScope::managedDepartmentIds($user)->all();
                    if (! empty($deptIds)) {
                        $b->orWhereHas('client', function ($c) use ($deptIds) {
                            $c->whereIn('assigned_department_id', $deptIds);
                        });
                    }
                }
            });
        }

        $rows = $query->orderByDesc('id')->limit(100)->get();

        return response()->json([
            'data' => $rows->map(function (ClientStaffTransferRequest $t) use ($service, $user) {
                return $this->transferPayloadForViewer($service, $t, $user);
            })->values()->all(),
        ]);
    }

    public function eligibleTargets(Request $request, Client $client, ClientStaffTransferService $service): JsonResponse
    {
        if (! $service->canInitiate($request->user(), $client)) {
            return response()->json(['message' => 'Không có quyền xem danh sách nhận phụ trách.'], 403);
        }

        return response()->json([
            'users' => $service->eligibleTargetUsers($client)->values()->all(),
        ]);
    }

    public function store(Request $request, Client $client, ClientStaffTransferService $service): JsonResponse
    {
        $validated = $request->validate([
            'to_staff_id' => ['required', 'integer', 'exists:users,id'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        try {
            $transfer = $service->createRequest(
                $request->user(),
                $client,
                (int) $validated['to_staff_id'],
                $validated['note'] ?? null
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['transfer' => $this->transferPayloadForViewer($service, $transfer, $request->user())], 201);
    }

    public function show(Request $request, ClientStaffTransferRequest $transfer, ClientStaffTransferService $service): JsonResponse
    {
        if (! $service->canViewTransferDetail($request->user(), $transfer)) {
            return response()->json(['message' => 'Không có quyền xem phiếu chuyển giao.'], 403);
        }

        return response()->json(['transfer' => $this->transferPayloadForViewer($service, $transfer, $request->user())]);
    }

    public function accept(Request $request, ClientStaffTransferRequest $transfer, ClientStaffTransferService $service): JsonResponse
    {
        try {
            $transfer = $service->accept($request->user(), $transfer);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['transfer' => $this->transferPayloadForViewer($service, $transfer, $request->user())]);
    }

    public function reject(Request $request, ClientStaffTransferRequest $transfer, ClientStaffTransferService $service): JsonResponse
    {
        $validated = $request->validate([
            'rejection_note' => ['nullable', 'string', 'max:2000'],
        ]);

        try {
            $transfer = $service->reject(
                $request->user(),
                $transfer,
                $validated['rejection_note'] ?? null
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['transfer' => $this->transferPayloadForViewer($service, $transfer, $request->user())]);
    }

    public function cancel(Request $request, ClientStaffTransferRequest $transfer, ClientStaffTransferService $service): JsonResponse
    {
        try {
            $transfer = $service->cancel($request->user(), $transfer);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['transfer' => $this->transferPayloadForViewer($service, $transfer, $request->user())]);
    }

    private function transferPayloadForViewer(
        ClientStaffTransferService $service,
        ClientStaffTransferRequest $transfer,
        $viewer
    ): array {
        $payload = $service->transferToArray($transfer);
        $payload['permissions'] = [
            'can_accept' => $service->canActOnRequest($viewer, $transfer),
            'can_reject' => $transfer->status === ClientStaffTransferService::STATUS_PENDING
                && (
                    (int) $transfer->to_staff_id === (int) $viewer->id
                    || $service->canActOnRequest($viewer, $transfer)
                ),
            'can_cancel' => $service->canCancelRequest($viewer, $transfer),
        ];

        return $payload;
    }
}
