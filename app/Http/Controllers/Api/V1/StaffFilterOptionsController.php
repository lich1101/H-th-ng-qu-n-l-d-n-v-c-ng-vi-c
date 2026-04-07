<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\StaffFilterOptionsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffFilterOptionsController extends Controller
{
    private const CONTEXTS = [
        'crm_clients',
        'contracts',
        'projects',
        'opportunities',
        'tasks',
        'task_items',
    ];

    public function index(Request $request, StaffFilterOptionsService $service): JsonResponse
    {
        $context = (string) $request->input('context', 'crm_clients');
        if (! in_array($context, self::CONTEXTS, true)) {
            return response()->json([
                'message' => 'Tham số context không hợp lệ.',
            ], 422);
        }

        $user = $request->user();
        if (! $user) {
            return response()->json(['data' => []]);
        }

        $rows = match ($context) {
            'crm_clients' => $service->forCrmClients($user),
            'contracts' => $service->forContracts($user),
            'projects' => $service->forProjects($user),
            'opportunities' => $service->forOpportunities($user),
            'tasks' => $service->forTasks($user),
            'task_items' => $service->forTaskItems($user),
        };

        return response()->json(['data' => $rows->values()->all()]);
    }
}
