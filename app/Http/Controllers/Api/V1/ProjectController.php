<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Project::query()->with(['client', 'creator', 'contract', 'owner']);

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('service_type')) {
            $query->where('service_type', $request->input('service_type'));
        }

        if ($request->filled('owner_id')) {
            $query->where('owner_id', (int) $request->input('owner_id'));
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        if ($request->filled('start_from')) {
            $query->whereDate('start_date', '>=', $request->input('start_from'));
        }
        if ($request->filled('start_to')) {
            $query->whereDate('start_date', '<=', $request->input('start_to'));
        }
        if ($request->filled('deadline_from')) {
            $query->whereDate('deadline', '>=', $request->input('deadline_from'));
        }
        if ($request->filled('deadline_to')) {
            $query->whereDate('deadline', '<=', $request->input('deadline_to'));
        }

        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 15))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());
        if (($validated['service_type'] ?? '') === 'khac') {
            $validated['service_type_other'] = trim((string) ($validated['service_type_other'] ?? ''));
            if ($validated['service_type_other'] === '') {
                return response()->json(['message' => 'Vui lòng nhập loại dịch vụ khác.'], 422);
            }
        } else {
            $validated['service_type_other'] = null;
        }
        if (empty($validated['code'])) {
            $validated['code'] = $this->generateProjectCode();
        }
        $validated['created_by'] = $request->user()->id;

        $contract = null;
        if (! empty($validated['contract_id'])) {
            $contract = Contract::find($validated['contract_id']);
            if (! $contract) {
                return response()->json(['message' => 'Hợp đồng không tồn tại.'], 422);
            }
            if ($contract->project_id) {
                return response()->json(['message' => 'Hợp đồng đã liên kết với dự án khác.'], 422);
            }
            if (! empty($validated['client_id']) && (int) $validated['client_id'] !== (int) $contract->client_id) {
                return response()->json(['message' => 'Khách hàng không khớp với hợp đồng.'], 422);
            }
            $validated['client_id'] = $contract->client_id;
        }

        $project = Project::create($validated);

        if ($contract && empty($contract->project_id)) {
            $contract->update(['project_id' => $project->id]);
        }

        return response()->json($project->load(['client', 'creator', 'contract', 'owner']), 201);
    }

    public function show(Project $project): JsonResponse
    {
        return response()->json(
            $project->load(['client', 'creator', 'tasks', 'contract', 'owner'])
        );
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate($this->rules($project->id));
        $oldContractId = $project->contract_id;
        $nextStatus = (string) ($validated['status'] ?? $project->status);
        $nextHandoverStatus = (string) ($validated['handover_status'] ?? $project->handover_status ?? '');

        if ($nextStatus === 'hoan_thanh' && $nextHandoverStatus !== 'approved') {
            return response()->json([
                'message' => 'Dự án chỉ được chuyển Hoàn thành sau khi duyệt bàn giao.',
            ], 422);
        }

        if (($validated['handover_status'] ?? null) === 'approved' && ! in_array($request->user()->role, ['admin', 'quan_ly'], true)) {
            return response()->json([
                'message' => 'Bạn không có quyền duyệt bàn giao dự án.',
            ], 403);
        }

        if ($nextHandoverStatus === 'approved') {
            $validated['approved_by'] = $request->user()->id;
            $validated['approved_at'] = now();
        } elseif (($validated['handover_status'] ?? null) === 'pending') {
            $validated['approved_by'] = null;
            $validated['approved_at'] = null;
        }

        if (($validated['service_type'] ?? $project->service_type) === 'khac') {
            $validated['service_type_other'] = trim((string) ($validated['service_type_other'] ?? $project->service_type_other ?? ''));
            if ($validated['service_type_other'] === '') {
                return response()->json(['message' => 'Vui lòng nhập loại dịch vụ khác.'], 422);
            }
        } else {
            $validated['service_type_other'] = null;
        }
        $contract = null;
        if (! empty($validated['contract_id'])) {
            $contract = Contract::find($validated['contract_id']);
            if (! $contract) {
                return response()->json(['message' => 'Hợp đồng không tồn tại.'], 422);
            }
            if ($contract->project_id && (int) $contract->project_id !== (int) $project->id) {
                return response()->json(['message' => 'Hợp đồng đã liên kết với dự án khác.'], 422);
            }
            if (! empty($validated['client_id']) && (int) $validated['client_id'] !== (int) $contract->client_id) {
                return response()->json(['message' => 'Khách hàng không khớp với hợp đồng.'], 422);
            }
            $validated['client_id'] = $contract->client_id;
        }
        $project->update($validated);

        if ($contract && empty($contract->project_id)) {
            $contract->update(['project_id' => $project->id]);
        }
        if ($oldContractId && $oldContractId !== ($contract->id ?? $oldContractId)) {
            Contract::where('id', $oldContractId)
                ->where('project_id', $project->id)
                ->update(['project_id' => null]);
        }

        return response()->json($project->load(['client', 'creator', 'contract', 'owner']));
    }

    public function destroy(Project $project): JsonResponse
    {
        $project->delete();

        return response()->json([
            'message' => 'Project deleted.',
        ]);
    }

    private function rules(?int $projectId = null): array
    {
        return [
            'code' => [
                'nullable',
                'string',
                'max:30',
                Rule::unique('projects', 'code')->ignore($projectId),
            ],
            'name' => ['required', 'string', 'max:255'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'contract_id' => ['nullable', 'integer', 'exists:contracts,id'],
            'service_type' => ['required', 'string', 'max:80'],
            'service_type_other' => ['nullable', 'string', 'max:120'],
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'budget' => ['nullable', 'numeric', 'min:0'],
            'status' => ['required', 'string', 'max:50'],
            'handover_status' => ['nullable', 'string', 'max:50'],
            'customer_requirement' => ['nullable', 'string'],
            'approved_by' => ['nullable', 'integer', 'exists:users,id'],
            'approved_at' => ['nullable', 'date'],
            'owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'repo_url' => ['nullable', 'string', 'max:255'],
        ];
    }

    private function generateProjectCode(): string
    {
        $date = now()->format('Ymd');
        for ($i = 0; $i < 5; $i++) {
            $random = Str::upper(Str::random(4));
            $code = "PRJ-{$date}-{$random}";
            if (!Project::where('code', $code)->exists()) {
                return $code;
            }
        }

        return 'PRJ-' . $date . '-' . strtoupper(Str::random(6));
    }
}
