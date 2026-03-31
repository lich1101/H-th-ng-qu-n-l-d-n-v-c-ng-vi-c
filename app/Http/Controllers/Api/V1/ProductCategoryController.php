<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ProductCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProductCategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ProductCategory::query();
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }
        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->input('is_active'));
        }

        return response()->json(
            $query->orderBy('name')->paginate((int) $request->input('per_page', 50))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $validated['code'] = $this->generateCode((string) $validated['name']);
        $validated['is_active'] = $validated['is_active'] ?? true;

        $category = ProductCategory::create($validated);

        return response()->json($category, 201);
    }

    public function update(Request $request, ProductCategory $productCategory): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        if (empty($productCategory->code)) {
            $validated['code'] = $this->generateCode((string) ($validated['name'] ?? $productCategory->name), $productCategory->id);
        }
        $productCategory->update($validated);

        return response()->json($productCategory);
    }

    public function destroy(ProductCategory $productCategory): JsonResponse
    {
        $productCategory->delete();

        return response()->json(['message' => 'Đã xóa danh mục sản phẩm.']);
    }

    private function generateCode(string $name, ?int $ignoreId = null): string
    {
        $base = Str::upper(Str::slug($name, '-'));
        $base = $base !== '' ? $base : 'DANH-MUC';
        $base = Str::limit($base, 30, '');
        $candidate = $base;
        $index = 2;

        while (
            ProductCategory::query()
                ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))
                ->where('code', $candidate)
                ->exists()
        ) {
            $suffix = '-' . $index;
            $candidate = Str::limit($base, 40 - strlen($suffix), '') . $suffix;
            $index++;
        }

        return $candidate;
    }
}
