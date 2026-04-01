<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserAccountController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'department' => $validated['department'] ?? null,
            'department_id' => $validated['department_id'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'workload_capacity' => $validated['workload_capacity'] ?? 100,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $this->log($request, 'user_created', 'user', $user->id, [
            'name' => ['old' => null, 'new' => $user->name],
            'role' => ['old' => null, 'new' => $user->role],
        ]);

        return response()->json([
            'message' => 'Tạo tài khoản thành công.',
            'user' => $user,
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $query = User::query()
            ->select([
                'id',
                'name',
                'email',
                'role',
                'department',
                'department_id',
                'phone',
                'is_active',
                'workload_capacity',
                'created_at',
                'updated_at',
            ]);

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('department', 'like', "%{$search}%")
                    ->orWhereHas('managedDepartments', function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('role')) {
            $query->where('role', (string) $request->input('role'));
        }

        if ($request->filled('status')) {
            $status = (string) $request->input('status');
            if ($status === 'active') {
                $query->where('is_active', true);
            }
            if ($status === 'inactive') {
                $query->where('is_active', false);
            }
        }

        $perPage = (int) $request->input('per_page', 10);
        $perPage = max(5, min(50, $perPage));
        $users = $query->orderByDesc('id')->paginate($perPage);

        return response()->json([
            'users' => $users,
            'filters' => [
                'search' => (string) $request->input('search', ''),
                'role' => (string) $request->input('role', ''),
                'status' => (string) $request->input('status', ''),
            ],
        ]);
    }

    public function stats(): JsonResponse
    {
        $total = User::count();
        $active = User::where('is_active', true)->count();
        $inactive = User::where('is_active', false)->count();
        $averageCapacity = (float) User::avg('workload_capacity');

        $roleCounts = User::selectRaw('role, COUNT(*) as count')
            ->groupBy('role')
            ->orderByDesc('count')
            ->get()
            ->map(function ($item) {
                return [
                    'label' => $item->role,
                    'value' => (int) $item->count,
                ];
            })
            ->values();

        return response()->json([
            'total_users' => $total,
            'active_users' => $active,
            'inactive_users' => $inactive,
            'login_today' => $active,
            'average_capacity' => round($averageCapacity, 1),
            'role_distribution' => $roleCounts,
        ]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate($this->rules($user->id, false));

        $payload = [
            'name' => $validated['name'],
            'email' => $validated['email'],
            'role' => $validated['role'],
            'department' => $validated['department'] ?? null,
            'department_id' => $validated['department_id'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'workload_capacity' => $validated['workload_capacity'] ?? $user->workload_capacity ?? 100,
            'is_active' => $validated['is_active'] ?? true,
        ];

        if (!empty($validated['password'])) {
            $payload['password'] = Hash::make($validated['password']);
        }

        $before = $user->only(['name', 'role', 'is_active']);
        $user->update($payload);

        $this->log($request, 'user_updated', 'user', $user->id, [
            'name' => ['old' => $before['name'], 'new' => $user->name],
            'role' => ['old' => $before['role'], 'new' => $user->role],
            'is_active' => ['old' => (bool) $before['is_active'], 'new' => (bool) $user->is_active],
        ]);

        return response()->json([
            'message' => 'Cập nhật tài khoản thành công.',
            'user' => $user->fresh(),
        ]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ((int) $request->user()->id === (int) $user->id) {
            return response()->json([
                'message' => 'Không thể tự xóa tài khoản đang đăng nhập.',
            ], 422);
        }

        if (in_array($user->role, ['admin', 'administrator'], true)) {
            $remaining = User::where('role', $user->role)->count();
            if ($remaining <= 1) {
                return response()->json([
                    'message' => sprintf('Không thể xóa %s cuối cùng.', $user->role),
                ], 422);
            }
        }

        $user->delete();

        $this->log($request, 'user_deleted', 'user', $user->id, []);

        return response()->json([
            'message' => 'Xóa tài khoản thành công.',
        ]);
    }

    private function rules(?int $userId = null, bool $requirePassword = true): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($userId),
            ],
            'password' => [
                $requirePassword ? 'required' : 'nullable',
                'string',
                'min:8',
            ],
            'role' => ['required', 'string', Rule::in([
                'administrator',
                'admin',
                'quan_ly',
                'nhan_vien',
                'ke_toan',
            ])],
            'department' => ['nullable', 'string', 'max:100'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'phone' => ['nullable', 'string', 'max:30'],
            'workload_capacity' => ['nullable', 'integer', 'min:0', 'max:200'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    private function log(Request $request, string $action, string $subjectType, int $subjectId, array $changes): void
    {
        ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'changes' => $changes,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);
    }
}
