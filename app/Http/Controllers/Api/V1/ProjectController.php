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
        $query = Project::query()->with(['client', 'creator', 'contract']);

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('service_type')) {
            $query->where('service_type', $request->input('service_type'));
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 15))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());
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
            if (! empty($validated['client_id']) && (int) $validated['client_id'] !== (int) $contract->client_id) {
                return response()->json(['message' => 'Khách hàng không khớp với hợp đồng.'], 422);
            }
            $validated['client_id'] = $contract->client_id;
        }

        $project = Project::create($validated);

        if ($contract && empty($contract->project_id)) {
            $contract->update(['project_id' => $project->id]);
        }

        return response()->json($project->load(['client', 'creator', 'contract']), 201);
    }

    public function show(Project $project): JsonResponse
    {
        return response()->json(
            $project->load(['client', 'creator', 'tasks', 'contract'])
        );
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate($this->rules($project->id));
        $contract = null;
        if (! empty($validated['contract_id'])) {
            $contract = Contract::find($validated['contract_id']);
            if (! $contract) {
                return response()->json(['message' => 'Hợp đồng không tồn tại.'], 422);
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

        return response()->json($project->load(['client', 'creator', 'contract']));
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
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'budget' => ['nullable', 'numeric', 'min:0'],
            'status' => ['required', 'string', 'max:50'],
            'handover_status' => ['nullable', 'string', 'max:50'],
            'customer_requirement' => ['nullable', 'string'],
            'approved_by' => ['nullable', 'integer', 'exists:users,id'],
            'approved_at' => ['nullable', 'date'],
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
