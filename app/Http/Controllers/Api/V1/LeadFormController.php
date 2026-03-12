<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LeadForm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LeadFormController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = LeadForm::query()->with(['leadType', 'department', 'creator']);
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }
        return response()->json($query->orderByDesc('id')->paginate((int) $request->input('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'max:120'],
            'lead_type_id' => ['nullable', 'integer', 'exists:lead_types,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'is_active' => ['nullable', 'boolean'],
            'redirect_url' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        $slug = $validated['slug'] ?? Str::slug($validated['name']);
        if (LeadForm::where('slug', $slug)->exists()) {
            $slug = $slug . '-' . Str::lower(Str::random(4));
        }

        $leadForm = LeadForm::create([
            'name' => $validated['name'],
            'slug' => $slug,
            'lead_type_id' => $validated['lead_type_id'] ?? null,
            'department_id' => $validated['department_id'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'redirect_url' => $validated['redirect_url'] ?? null,
            'description' => $validated['description'] ?? null,
            'created_by' => $request->user()->id,
            'public_key' => Str::random(32),
        ]);

        return response()->json($leadForm->load(['leadType', 'department', 'creator']), 201);
    }

    public function update(Request $request, LeadForm $leadForm): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'lead_type_id' => ['nullable', 'integer', 'exists:lead_types,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'is_active' => ['nullable', 'boolean'],
            'redirect_url' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        $leadForm->update($validated);

        return response()->json($leadForm->load(['leadType', 'department', 'creator']));
    }

    public function destroy(LeadForm $leadForm): JsonResponse
    {
        $leadForm->delete();
        return response()->json(['message' => 'Đã xóa form.']);
    }
}
