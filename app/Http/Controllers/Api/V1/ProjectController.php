<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\ProjectScope;
use App\Models\AppSetting;
use App\Models\Contract;
use App\Models\Project;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Project::query()->with($this->baseRelations());

        ProjectScope::applyProjectScope($query, $user);

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('service_type')) {
            $query->where('service_type', $request->input('service_type'));
        }

        if ($request->filled('owner_id')) {
            $query->where('owner_id', (int) $request->input('owner_id'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        if ($request->filled('start_from')) {
            $query->whereDate('start_date', '>=', $request->input('start_from'));
        }

        if ($request->filled('start_to')) {
            $query->whereDate('start_date', '<=', $request->input('start_to'));
        }

        if ($request->filled('deadline_from')) {
            $query->whereDate('deadline', '>=', $request->input('deadline_from'));
        }

        if ($request->filled('deadline_to')) {
            $query->whereDate('deadline', '<=', $request->input('deadline_to'));
        }

        $paginator = $query
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 15));

        $paginator->getCollection()->transform(function (Project $project) use ($user) {
            return $this->transformProject($project, $user);
        });

        return response()->json($paginator);
    }

    public function store(Request $request): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'quan_ly'], true)) {
            return response()->json(['message' => 'Không có quyền tạo dự án.'], 403);
        }

        $validated = $request->validate($this->rules());

        if (($validated['service_type'] ?? '') === 'khac') {
            $validated['service_type_other'] = trim((string) ($validated['service_type_other'] ?? ''));
            if ($validated['service_type_other'] === '') {
                return response()->json(['message' => 'Vui lòng nhập loại dịch vụ khác.'], 422);
            }
        } else {
            $validated['service_type_other'] = null;
        }

        if (empty($validated['code'])) {
            $validated['code'] = $this->generateProjectCode();
        }

        $validated['created_by'] = $request->user()->id;

        $contract = $this->resolveContractForProject($validated, null);
        if ($contract instanceof JsonResponse) {
            return $contract;
        }

        $project = Project::create($validated);

        if ($contract && empty($contract->project_id)) {
            $contract->update(['project_id' => $project->id]);
        }

        $project->load($this->baseRelations());

        return response()->json($this->transformProject($project, $request->user()), 201);
    }

    public function show(Project $project, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem dự án.'], 403);
        }

        $project->load(array_merge($this->baseRelations(), [
            'tasks' => function ($query) {
                $query->with([
                    'assignee:id,name,email,avatar_url',
                    'reviewer:id,name,email,avatar_url',
                    'department:id,name,manager_id',
                ])->orderByDesc('id');
            },
        ]));

        return response()->json($this->transformProject($project, $request->user(), true));
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền cập nhật dự án.'], 403);
        }
        if (! in_array($request->user()->role, ['admin', 'quan_ly'], true)) {
            return response()->json(['message' => 'Bạn chỉ có quyền xem dự án trong phạm vi phụ trách.'], 403);
        }

        $validated = $request->validate($this->rules($project->id));
        $nextStatus = (string) ($validated['status'] ?? $project->status);
        $currentHandoverStatus = (string) ($project->handover_status ?? 'chua_ban_giao');

        if ($nextStatus === 'hoan_thanh' && $currentHandoverStatus !== 'approved') {
            return response()->json([
                'message' => 'Dự án chỉ được chuyển Hoàn thành sau khi phiếu bàn giao đã được duyệt.',
            ], 422);
        }

        if (($validated['service_type'] ?? $project->service_type) === 'khac') {
            $validated['service_type_other'] = trim((string) ($validated['service_type_other'] ?? $project->service_type_other ?? ''));
            if ($validated['service_type_other'] === '') {
                return response()->json(['message' => 'Vui lòng nhập loại dịch vụ khác.'], 422);
            }
        } else {
            $validated['service_type_other'] = null;
        }

        $oldContractId = $project->contract_id;
        $contract = $this->resolveContractForProject($validated, $project);
        if ($contract instanceof JsonResponse) {
            return $contract;
        }

        $project->update($validated);

        if ($contract && empty($contract->project_id)) {
            $contract->update(['project_id' => $project->id]);
        }

        if ($oldContractId && $oldContractId !== ($contract->id ?? $oldContractId)) {
            Contract::query()
                ->where('id', $oldContractId)
                ->where('project_id', $project->id)
                ->update(['project_id' => null]);
        }

        $project->load($this->baseRelations());

        return response()->json($this->transformProject($project, $request->user()));
    }

    public function destroy(Project $project, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xóa dự án.'], 403);
        }
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Chỉ admin mới có quyền xóa dự án.'], 403);
        }

        $project->delete();

        return response()->json([
            'message' => 'Đã xóa dự án.',
        ]);
    }

    public function handoverQueue(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Project::query()
            ->with($this->baseRelations())
            ->where('handover_status', 'pending');

        if ($user->role !== 'admin') {
            $query->whereHas('contract', function ($contractQuery) use ($user) {
                $contractQuery->where('collector_user_id', $user->id);
            });
        }

        $paginator = $query
            ->orderByDesc('handover_requested_at')
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 50));

        $paginator->getCollection()->transform(function (Project $project) use ($user) {
            return $this->transformProject($project, $user);
        });

        return response()->json($paginator);
    }

    public function submitHandover(Project $project, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền gửi duyệt bàn giao dự án này.'], 403);
        }

        $minimum = $this->handoverMinimumProgressPercent();
        if (! ProjectScope::canSubmitProjectHandover($request->user(), $project, $minimum)) {
            return response()->json([
                'message' => "Chỉ phụ trách dự án mới được gửi duyệt, và tiến độ phải từ {$minimum}% trở lên.",
            ], 422);
        }

        $project->update([
            'handover_status' => 'pending',
            'handover_requested_by' => $request->user()->id,
            'handover_requested_at' => now(),
            'handover_review_note' => null,
        ]);

        $project->load($this->baseRelations());
        $this->notifyHandoverSubmitted($project, $request);

        return response()->json($this->transformProject($project, $request->user()));
    }

    public function reviewHandover(Project $project, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền xem dự án này.'], 403);
        }

        if (! ProjectScope::canReviewProjectHandover($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền duyệt bàn giao dự án này.'], 403);
        }

        if ((string) ($project->handover_status ?? '') !== 'pending') {
            return response()->json(['message' => 'Phiếu bàn giao dự án không ở trạng thái chờ duyệt.'], 422);
        }

        $validated = $request->validate([
            'decision' => ['required', 'string', 'in:approved,rejected'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $decision = (string) $validated['decision'];
        $reason = trim((string) ($validated['reason'] ?? ''));
        if ($decision === 'rejected' && $reason === '') {
            return response()->json(['message' => 'Vui lòng nhập lý do từ chối duyệt bàn giao.'], 422);
        }

        if ($decision === 'approved') {
            $project->update([
                'handover_status' => 'approved',
                'approved_by' => $request->user()->id,
                'approved_at' => now(),
                'handover_review_note' => $reason !== '' ? $reason : null,
            ]);
        } else {
            $project->update([
                'handover_status' => 'rejected',
                'approved_by' => null,
                'approved_at' => null,
                'handover_review_note' => $reason,
            ]);
        }

        $project->load($this->baseRelations());
        $this->notifyHandoverReviewed($project, $request, $decision, $reason !== '' ? $reason : null);

        return response()->json($this->transformProject($project, $request->user()));
    }

    private function rules(?int $projectId = null): array
    {
        return [
            'code' => [
                'nullable',
                'string',
                'max:30',
                Rule::unique('projects', 'code')->ignore($projectId),
            ],
            'name' => ['required', 'string', 'max:255'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'contract_id' => ['nullable', 'integer', 'exists:contracts,id'],
            'service_type' => ['required', 'string', 'max:80'],
            'service_type_other' => ['nullable', 'string', 'max:120'],
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'budget' => ['nullable', 'numeric', 'min:0'],
            'status' => ['required', 'string', 'max:50'],
            'customer_requirement' => ['nullable', 'string'],
            'owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'repo_url' => ['nullable', 'string', 'max:255'],
        ];
    }

    private function generateProjectCode(): string
    {
        $date = now()->format('Ymd');
        for ($i = 0; $i < 5; $i++) {
            $random = Str::upper(Str::random(4));
            $code = "PRJ-{$date}-{$random}";
            if (! Project::where('code', $code)->exists()) {
                return $code;
            }
        }

        return 'PRJ-'.$date.'-'.strtoupper(Str::random(6));
    }

    private function resolveContractForProject(array &$validated, ?Project $project)
    {
        if (empty($validated['contract_id'])) {
            return null;
        }

        $contract = Contract::query()->find($validated['contract_id']);
        if (! $contract) {
            return response()->json(['message' => 'Hợp đồng không tồn tại.'], 422);
        }

        if ($contract->project_id && (int) $contract->project_id !== (int) optional($project)->id) {
            return response()->json(['message' => 'Hợp đồng đã liên kết với dự án khác.'], 422);
        }

        if (! empty($validated['client_id']) && (int) $validated['client_id'] !== (int) $contract->client_id) {
            return response()->json(['message' => 'Khách hàng không khớp với hợp đồng.'], 422);
        }

        $validated['client_id'] = $contract->client_id;

        return $contract;
    }

    private function baseRelations(): array
    {
        return [
            'client:id,name,company,email,phone',
            'creator:id,name,email,role,avatar_url',
            'owner:id,name,email,role,avatar_url,department_id',
            'approver:id,name,email,role,avatar_url',
            'handoverRequester:id,name,email,role,avatar_url',
            'contract:id,code,title,client_id,project_id,value,status,approval_status,start_date,end_date,signed_at,collector_user_id',
            'contract.collector:id,name,email,role,avatar_url,department_id',
        ];
    }

    private function transformProject(Project $project, ?User $user, bool $detailed = false): array
    {
        $payload = $project->toArray();
        $payload['permissions'] = $this->projectPermissions($project, $user);
        $payload['handover_min_progress_percent'] = $this->handoverMinimumProgressPercent();
        $payload['collector_user_id'] = ProjectScope::projectCollectorId($project);

        if ($detailed && $project->relationLoaded('tasks')) {
            $payload['tasks'] = collect($project->tasks)->map(function ($task) {
                return $task->toArray();
            })->values()->all();
        }

        return $payload;
    }

    private function projectPermissions(Project $project, ?User $user): array
    {
        $minimum = $this->handoverMinimumProgressPercent();

        return [
            'can_view' => ProjectScope::canAccessProject($user, $project),
            'can_edit' => $user ? in_array($user->role, ['admin', 'quan_ly'], true) : false,
            'can_delete' => $user ? $user->role === 'admin' : false,
            'can_submit_handover' => ProjectScope::canSubmitProjectHandover($user, $project, $minimum),
            'can_review_handover' => ProjectScope::canReviewProjectHandover($user, $project),
        ];
    }

    private function handoverMinimumProgressPercent(): int
    {
        return (int) (AppSetting::query()->value('project_handover_min_progress_percent') ?? 90);
    }

    private function handoverReviewerIds(Project $project, int $excludeUserId = 0): array
    {
        $targetIds = User::query()
            ->where('role', 'admin')
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();

        $collectorId = ProjectScope::projectCollectorId($project);
        if ($collectorId > 0) {
            $targetIds[] = $collectorId;
        }

        return array_values(array_filter(array_unique($targetIds), function ($id) use ($excludeUserId) {
            return (int) $id > 0 && (int) $id !== $excludeUserId;
        }));
    }

    private function notifyHandoverSubmitted(Project $project, Request $request): void
    {
        $targetIds = $this->handoverReviewerIds($project, (int) $request->user()->id);
        if (empty($targetIds)) {
            return;
        }

        app(NotificationService::class)->notifyUsersAfterResponse(
            $targetIds,
            'Có phiếu duyệt bàn giao dự án',
            sprintf(
                'Dự án %s đang chờ duyệt bàn giao. Người gửi: %s.',
                (string) $project->name,
                (string) $request->user()->name
            ),
            [
                'type' => 'project_handover_pending',
                'project_id' => $project->id,
                'requested_by' => $request->user()->id,
            ]
        );
    }

    private function notifyHandoverReviewed(Project $project, Request $request, string $decision, ?string $reason): void
    {
        $ownerId = (int) ($project->owner_id ?? 0);
        if ($ownerId <= 0 || $ownerId === (int) $request->user()->id) {
            return;
        }

        $title = $decision === 'approved'
            ? 'Phiếu bàn giao dự án đã được duyệt'
            : 'Phiếu bàn giao dự án bị từ chối';
        $body = sprintf(
            'Dự án %s • Người phản hồi: %s%s',
            (string) $project->name,
            (string) $request->user()->name,
            $reason ? ' • Lý do: '.$reason : ''
        );

        app(NotificationService::class)->notifyUsersAfterResponse(
            [$ownerId],
            $title,
            $body,
            [
                'type' => 'project_handover_reviewed',
                'project_id' => $project->id,
                'decision' => $decision,
                'reason' => $reason,
            ]
        );
    }
}
