<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserAccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query()
            ->select([
                'id',
                'name',
                'email',
                'role',
                'department',
                'is_active',
                'workload_capacity',
                'created_at',
                'updated_at',
            ]);

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
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
}
