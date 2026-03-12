<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LeadType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadTypeController extends Controller
{
    public function index(): JsonResponse
    {
        $items = LeadType::orderBy('sort_order')->orderBy('id')->get();
        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'color_hex' => ['nullable', 'string', 'max:7'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        $validated['color_hex'] = $validated['color_hex'] ?? '#6B7280';
        $validated['sort_order'] = $validated['sort_order'] ?? 0;

        $leadType = LeadType::create($validated);
        return response()->json($leadType, 201);
    }

    public function update(Request $request, LeadType $leadType): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:80'],
            'color_hex' => ['nullable', 'string', 'max:7'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        if ($leadType->name === 'Khách hàng tiềm năng' && array_key_exists('name', $validated)) {
            unset($validated['name']);
        }
        $leadType->update($validated);
        return response()->json($leadType);
    }

    public function destroy(LeadType $leadType): JsonResponse
    {
        if ($leadType->name === 'Khách hàng tiềm năng') {
            return response()->json(['message' => 'Không thể xóa trạng thái mặc định.'], 422);
        }
        $leadType->clients()->update(['lead_type_id' => null]);
        $leadType->delete();
        return response()->json(['message' => 'Đã xóa loại tiềm năng.']);
    }
}
