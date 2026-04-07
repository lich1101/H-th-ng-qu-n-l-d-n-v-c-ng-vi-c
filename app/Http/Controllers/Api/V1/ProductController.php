<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Product::query()->with('category');
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhereHas('category', function ($catQuery) use ($search) {
                        $catQuery->where('name', 'like', "%{$search}%");
                    });
            });
        }
        if ($request->filled('category_id')) {
            $query->where('category_id', (int) $request->input('category_id'));
        }
        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->input('is_active'));
        }
        return response()->json(
            $query->orderBy('name')->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category_id' => ['nullable', 'integer', 'exists:product_categories,id'],
            'unit' => ['nullable', 'string', 'max:20'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $validated['code'] = $this->generateCode(isset($validated['category_id']) ? (int) $validated['category_id'] : null);
        $validated['is_active'] = $validated['is_active'] ?? true;

        $product = Product::create($validated);
        $this->notifyProductAdmins($product, $request->user(), 'created');

        return response()->json($product, 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json($product);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'category_id' => ['nullable', 'integer', 'exists:product_categories,id'],
            'unit' => ['nullable', 'string', 'max:20'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $product->update($validated);
        $this->notifyProductAdmins($product->fresh(), $request->user(), 'updated');

        return response()->json($product);
    }

    public function destroy(Product $product): JsonResponse
    {
        $product->delete();
        return response()->json(['message' => 'Đã xóa sản phẩm.']);
    }

    private function generateCode(?int $categoryId): string
    {
        $prefix = $this->resolveCategoryPrefix($categoryId) . '-' . now()->format('Ymd');
        for ($i = 1; $i <= 9999; $i++) {
            $code = $prefix . '-' . str_pad((string) $i, 4, '0', STR_PAD_LEFT);
            if (! Product::where('code', $code)->exists()) {
                return $code;
            }
        }
        return $prefix . '-' . strtoupper(Str::random(4));
    }

    private function resolveCategoryPrefix(?int $categoryId): string
    {
        if (! $categoryId) {
            return 'SP';
        }

        $rawCode = (string) ProductCategory::query()
            ->where('id', $categoryId)
            ->value('code');

        $normalized = strtoupper(preg_replace('/[^A-Z0-9]/', '', $rawCode));

        return $normalized !== ''
            ? Str::limit($normalized, 10, '')
            : 'SP';
    }

    private function notifyProductAdmins(Product $product, $actor, string $action): void
    {
        if (! $actor) {
            return;
        }
        $actorId = (int) $actor->id;
        $targetIds = User::query()
            ->whereIn('role', ['admin', 'administrator'])
            ->where('is_active', true)
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) use ($actorId) {
                return $id > 0 && $id !== $actorId;
            })
            ->values()
            ->all();
        if (empty($targetIds)) {
            return;
        }
        $name = trim((string) ($product->name ?: 'Sản phẩm'));
        $title = $action === 'created' ? 'Có sản phẩm mới' : 'Sản phẩm đã được cập nhật';
        $body = $action === 'created'
            ? sprintf('Sản phẩm "%s" vừa được tạo.', $name)
            : sprintf('Sản phẩm "%s" vừa được cập nhật.', $name);

        try {
            app(NotificationService::class)->notifyUsersAfterResponse(
                $targetIds,
                $title,
                $body,
                [
                    'type' => $action === 'created' ? 'product_created' : 'product_updated',
                    'category' => 'catalog',
                    'product_id' => (int) $product->id,
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
