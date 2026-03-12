<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\RevenueTier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RevenueTierController extends Controller
{
    public function index(): JsonResponse
    {
        $items = RevenueTier::orderBy('sort_order')->orderBy('min_amount')->get();
        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50'],
            'label' => ['required', 'string', 'max:80'],
            'color_hex' => ['nullable', 'string', 'max:7'],
            'min_amount' => ['nullable', 'numeric', 'min:0'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        $validated['color_hex'] = $validated['color_hex'] ?? '#6B7280';
        $validated['min_amount'] = $validated['min_amount'] ?? 0;
        $validated['sort_order'] = $validated['sort_order'] ?? 0;

        $tier = RevenueTier::create($validated);
        return response()->json($tier, 201);
    }

    public function update(Request $request, RevenueTier $revenueTier): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:50'],
            'label' => ['sometimes', 'required', 'string', 'max:80'],
            'color_hex' => ['nullable', 'string', 'max:7'],
            'min_amount' => ['nullable', 'numeric', 'min:0'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        $revenueTier->update($validated);
        return response()->json($revenueTier);
    }

    public function destroy(RevenueTier $revenueTier): JsonResponse
    {
        $revenueTier->delete();
        return response()->json(['message' => 'Đã xóa hạng doanh thu.']);
    }
}
