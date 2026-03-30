<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Department::query()->with(['manager', 'staff']);
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where('name', 'like', "%{$search}%");
        }
        return response()->json($query->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
            'staff_ids' => ['nullable', 'array'],
            'staff_ids.*' => ['integer', 'exists:users,id'],
        ]);

        if ($error = $this->validateManagerId($validated['manager_id'] ?? null)) {
            return response()->json(['message' => $error], 422);
        }
        if ($error = $this->validateStaffIds($validated['staff_ids'] ?? [])) {
            return response()->json(['message' => $error], 422);
        }

        $department = Department::create([
            'name' => $validated['name'],
            'manager_id' => $validated['manager_id'] ?? null,
        ]);

        if (! empty($validated['staff_ids'])) {
            User::whereIn('id', $validated['staff_ids'])->update([
                'department_id' => $department->id,
            ]);
        }

        return response()->json($department->load(['manager', 'staff']), 201);
    }

    public function update(Request $request, Department $department): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
            'staff_ids' => ['nullable', 'array'],
            'staff_ids.*' => ['integer', 'exists:users,id'],
            'remove_staff_ids' => ['nullable', 'array'],
            'remove_staff_ids.*' => ['integer', 'exists:users,id'],
        ]);

        if (array_key_exists('manager_id', $validated)) {
            if ($error = $this->validateManagerId($validated['manager_id'])) {
                return response()->json(['message' => $error], 422);
            }
        }
        if (array_key_exists('staff_ids', $validated)) {
            if ($error = $this->validateStaffIds($validated['staff_ids'] ?? [])) {
                return response()->json(['message' => $error], 422);
            }
        }

        $department->update([
            'name' => $validated['name'] ?? $department->name,
            'manager_id' => $validated['manager_id'] ?? $department->manager_id,
        ]);

        if (! empty($validated['staff_ids'])) {
            User::whereIn('id', $validated['staff_ids'])->update([
                'department_id' => $department->id,
            ]);
        }

        if (! empty($validated['remove_staff_ids'])) {
            User::whereIn('id', $validated['remove_staff_ids'])->update([
                'department_id' => null,
            ]);
        }

        return response()->json($department->load(['manager', 'staff']));
    }

    public function destroy(Department $department): JsonResponse
    {
        User::where('department_id', $department->id)->update(['department_id' => null]);
        $department->delete();
        return response()->json(['message' => 'Đã xóa phòng ban.']);
    }

    private function validateManagerId($managerId): ?string
    {
        $managerId = (int) ($managerId ?? 0);
        if ($managerId <= 0) {
            return null;
        }

        $manager = User::query()->select(['id', 'role', 'is_active'])->find($managerId);
        if (! $manager || ! $manager->is_active) {
            return 'Quản lý phòng ban không tồn tại hoặc đã ngưng hoạt động.';
        }

        if ((string) $manager->role !== 'quan_ly') {
            return 'Chỉ được chọn người có vai trò quản lý làm quản lý phòng ban.';
        }

        return null;
    }

    private function validateStaffIds(array $staffIds): ?string
    {
        $staffIds = collect($staffIds)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();

        if (empty($staffIds)) {
            return null;
        }

        $invalidIds = User::query()
            ->whereIn('id', $staffIds)
            ->where(function ($builder) {
                $builder->whereNotIn('role', ['nhan_vien', 'quan_ly'])
                    ->orWhere('is_active', false);
            })
            ->pluck('id')
            ->all();

        return empty($invalidIds)
            ? null
            : 'Danh sách nhân sự của phòng ban chỉ được gồm quản lý hoặc nhân viên đang hoạt động.';
    }
}
