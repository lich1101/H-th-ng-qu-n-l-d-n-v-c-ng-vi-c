<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Project::query()->with(['client', 'creator']);

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
        $validated['created_by'] = $request->user()->id;

        $project = Project::create($validated);

        return response()->json($project->load(['client', 'creator']), 201);
    }

    public function show(Project $project): JsonResponse
    {
        return response()->json(
            $project->load(['client', 'creator', 'tasks'])
        );
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate($this->rules($project->id));
        $project->update($validated);

        return response()->json($project->load(['client', 'creator']));
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
                'required',
                'string',
                'max:30',
                Rule::unique('projects', 'code')->ignore($projectId),
            ],
            'name' => ['required', 'string', 'max:255'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
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
}
