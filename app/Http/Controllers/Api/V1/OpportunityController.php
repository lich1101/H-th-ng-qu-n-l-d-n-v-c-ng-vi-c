<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\CrmScope;
use App\Models\Opportunity;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OpportunityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Opportunity::query()->with(['client', 'assignee', 'creator']);
        CrmScope::applyOpportunityScope($query, $request->user());
        if ($request->filled('client_id')) {
            $query->where('client_id', (int) $request->input('client_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhereHas('client', function ($c) use ($search) {
                        $c->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%");
                    });
            });
        }
        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 15))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'in:open,won,lost'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'expected_close_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        $validated['status'] = $validated['status'] ?? 'open';
        $validated['created_by'] = $request->user()->id;

        $opportunity = Opportunity::create($validated);
        return response()->json($opportunity->load(['client', 'assignee', 'creator']), 201);
    }

    public function show(Opportunity $opportunity): JsonResponse
    {
        if (! $this->canAccessOpportunity(request()->user(), $opportunity)) {
            return response()->json(['message' => 'Không có quyền xem cơ hội.'], 403);
        }
        return response()->json($opportunity->load(['client', 'assignee', 'creator', 'contracts']));
    }

    public function update(Request $request, Opportunity $opportunity): JsonResponse
    {
        if (! $this->canAccessOpportunity($request->user(), $opportunity)) {
            return response()->json(['message' => 'Không có quyền cập nhật cơ hội.'], 403);
        }
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'client_id' => ['sometimes', 'required', 'integer', 'exists:clients,id'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'in:open,won,lost'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'expected_close_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        $opportunity->update($validated);
        return response()->json($opportunity->load(['client', 'assignee', 'creator']));
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
        if (in_array($user->role, ['admin', 'ke_toan'], true)) {
            return true;
        }
        if (! $opportunity->client) {
            $opportunity->load('client');
        }
        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            return $opportunity->client
                && $opportunity->client->assigned_department_id
                && $deptIds->contains($opportunity->client->assigned_department_id);
        }

        return $opportunity->client && (int) $opportunity->client->assigned_staff_id === (int) $user->id;
    }
}
