<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\LeadType;
use App\Models\User;
use App\Services\LeadNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadCaptureController extends Controller
{
    public function webhook(Request $request): JsonResponse
    {
        $token = (string) $request->header('X-Lead-Token', $request->input('token'));
        $expected = (string) env('LEAD_WEBHOOK_TOKEN');
        if ($expected && $token !== $expected) {
            return response()->json(['message' => 'Invalid token.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'message' => ['nullable', 'string'],
            'source' => ['nullable', 'string', 'max:100'],
            'channel' => ['nullable', 'string', 'max:50'],
            'assigned_department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'assigned_staff_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $leadTypeId = LeadType::query()
            ->where('name', 'Khách hàng tiềm năng')
            ->value('id');
        if (! $leadTypeId) {
            $leadTypeId = LeadType::query()->orderBy('sort_order')->orderBy('id')->value('id');
        }

        $assignedDepartmentId = $validated['assigned_department_id'] ?? null;
        if (! $assignedDepartmentId && ! empty($validated['assigned_staff_id'])) {
            $assignedDepartmentId = User::query()
                ->where('id', $validated['assigned_staff_id'])
                ->value('department_id');
        }

        $client = Client::create([
            'name' => $validated['name'],
            'company' => $validated['company'] ?? null,
            'email' => $validated['email'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'lead_type_id' => $leadTypeId,
            'lead_source' => $validated['source'] ?? 'page_message',
            'lead_channel' => $validated['channel'] ?? 'page',
            'lead_message' => $validated['message'] ?? null,
            'notes' => $validated['message'] ?? null,
            'assigned_department_id' => $assignedDepartmentId,
            'assigned_staff_id' => $validated['assigned_staff_id'] ?? null,
        ]);

        app(LeadNotificationService::class)->notifyNewLead(
            $client,
            $validated['source'] ?? 'Page / webhook'
        );

        return response()->json([
            'message' => 'Lead captured.',
            'client' => $client->load(['leadType', 'revenueTier']),
        ], 201);
    }
}
