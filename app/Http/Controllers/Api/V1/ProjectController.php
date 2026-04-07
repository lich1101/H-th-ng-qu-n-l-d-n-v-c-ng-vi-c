<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Helpers\ProjectScope;
use App\Support\ExternalUrl;
use App\Models\AppSetting;
use App\Models\Contract;
use App\Models\Project;
use App\Models\ProjectMeeting;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\ProjectGscSyncService;
use App\Services\WorkflowTopicApplierService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

        $ownerFilterIds = $this->resolveOwnerFilterIds($request);
        if (! empty($ownerFilterIds)) {
            $query->whereIn('owner_id', $ownerFilterIds);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('status', 'like', "%{$search}%")
                    ->orWhere('service_type', 'like', "%{$search}%")
                    ->orWhere('service_type_other', 'like', "%{$search}%")
                    ->orWhere('website_url', 'like', "%{$search}%")
                    ->orWhere('repo_url', 'like', "%{$search}%")
                    ->orWhere('customer_requirement', 'like', "%{$search}%")
                    ->orWhere('start_date', 'like', "%{$search}%")
                    ->orWhere('deadline', 'like', "%{$search}%")
                    ->orWhere('handover_status', 'like', "%{$search}%")
                    ->orWhere('budget', 'like', "%{$search}%")
                    ->orWhere('progress_percent', 'like', "%{$search}%")
                    ->orWhereHas('client', function ($clientQuery) use ($search) {
                        $clientQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    })
                    ->orWhereHas('owner', function ($ownerQuery) use ($search) {
                        $ownerQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    })
                    ->orWhereHas('contract', function ($contractQuery) use ($search) {
                        $contractQuery->where('code', 'like', "%{$search}%")
                            ->orWhere('title', 'like', "%{$search}%")
                            ->orWhere('notes', 'like', "%{$search}%");
                    })
                    ->orWhereHas('contract.collector', function ($collectorQuery) use ($search) {
                        $collectorQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    })
                    ->orWhereHas('linkedContract', function ($contractQuery) use ($search) {
                        $contractQuery->where('code', 'like', "%{$search}%")
                            ->orWhere('title', 'like', "%{$search}%")
                            ->orWhere('notes', 'like', "%{$search}%");
                    })
                    ->orWhereHas('linkedContract.collector', function ($collectorQuery) use ($search) {
                        $collectorQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    })
                    ->orWhereHas('workflowTopic', function ($topicQuery) use ($search) {
                        $topicQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%")
                            ->orWhere('description', 'like', "%{$search}%");
                    });
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

        /** @var \Illuminate\Pagination\LengthAwarePaginator $paginator */
        $paginator = $query
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 15));

        $paginator->setCollection($paginator->getCollection()->transform(function (Project $project) use ($user) {
            return $this->transformProject($project, $user);
        }));

        return response()->json($paginator);
    }

    public function store(
        Request $request,
        ProjectGscSyncService $syncService,
        WorkflowTopicApplierService $workflowTopicApplier
    ): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'administrator', 'quan_ly'], true)) {
            return response()->json(['message' => 'Không có quyền tạo dự án.'], 403);
        }

        $validated = $request->validate($this->rules());
        if ($error = $this->validateProjectOwner($validated['owner_id'] ?? null)) {
            return response()->json(['message' => $error], 422);
        }

        if (! empty($validated['contract_id'])) {
            $authError = $this->assertCanCreateFromContract($request->user(), (int) $validated['contract_id']);
            if ($authError) {
                return $authError;
            }
        }

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
        if (! empty($validated['workflow_topic_id'])) {
            $workflowTopicApplier->applyToProject(
                $project,
                (int) $validated['workflow_topic_id'],
                (int) $request->user()->id
            );
        }
        $syncService->handleWebsiteMutation($project, null);

        if ($contract && empty($contract->project_id)) {
            $contract->update(['project_id' => $project->id]);
        }

        $project->load($this->baseRelations());

        return response()->json($this->transformProject($project, $request->user()), 201);
    }

    /**
     * Create a project directly from an approved contract.
     * Only admin or the contract collector can do this.
     */
    public function createFromContract(
        Request $request,
        ProjectGscSyncService $syncService,
        WorkflowTopicApplierService $workflowTopicApplier
    ): JsonResponse
    {
        $contractId = (int) $request->input('contract_id');
        if (! $contractId) {
            return response()->json(['message' => 'contract_id là bắt buộc.'], 422);
        }

        $contract = Contract::with(['client'])->find($contractId);
        if (! $contract) {
            return response()->json(['message' => 'Hợp đồng không tồn tại.'], 404);
        }

        // 1:1 check
        $existingProject = Project::where('contract_id', $contractId)->first();
        if ($existingProject) {
            return response()->json(['message' => 'Hợp đồng này đã có dự án liên kết.', 'project_id' => $existingProject->id], 422);
        }
        if ($contract->project_id) {
            return response()->json(['message' => 'Hợp đồng đã liên kết với dự án khác.', 'project_id' => $contract->project_id], 422);
        }

        // Role check
        $authError = $this->assertCanCreateFromContract($request->user(), $contractId, $contract);
        if ($authError) {
            return $authError;
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'service_type' => ['required', 'string', 'max:80'],
            'service_type_other' => ['nullable', 'string', 'max:120'],
            'workflow_topic_id' => ['nullable', 'integer', 'exists:workflow_topics,id'],
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'budget' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'max:50'],
            'customer_requirement' => ['nullable', 'string'],
            'owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'repo_url' => ['nullable', 'string', 'max:255'],
            'website_url' => ['nullable', 'string', 'max:255'],
        ]);

        $this->normalizeProjectUrlFields($validated);

        if (! empty($validated['owner_id'])) {
            if ($error = $this->validateProjectOwner($validated['owner_id'])) {
                return response()->json(['message' => $error], 422);
            }
        }

        $project = Project::create([
            'code' => $this->generateProjectCode(),
            'name' => $validated['name'],
            'client_id' => $contract->client_id,
            'contract_id' => $contract->id,
            'service_type' => $validated['service_type'] ?? 'khac',
            'service_type_other' => ($validated['service_type'] ?? '') === 'khac' ? ($validated['service_type_other'] ?? '') : null,
            'workflow_topic_id' => $validated['workflow_topic_id'] ?? null,
            'start_date' => $validated['start_date'] ?? $contract->start_date,
            'deadline' => $validated['deadline'] ?? $contract->end_date,
            'budget' => $validated['budget'] ?? $contract->value ?? null,
            'status' => $validated['status'] ?? 'moi_tao',
            'customer_requirement' => $validated['customer_requirement'] ?? null,
            'owner_id' => $validated['owner_id'] ?? null,
            'repo_url' => $validated['repo_url'] ?? null,
            'website_url' => $validated['website_url'] ?? null,
            'created_by' => $request->user()->id,
        ]);
        if (! empty($validated['workflow_topic_id'])) {
            $workflowTopicApplier->applyToProject(
                $project,
                (int) $validated['workflow_topic_id'],
                (int) $request->user()->id
            );
        }
        $syncService->handleWebsiteMutation($project, null);

        $contract->update(['project_id' => $project->id]);
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

    public function update(
        Request $request,
        Project $project,
        ProjectGscSyncService $syncService,
        WorkflowTopicApplierService $workflowTopicApplier
    ): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền cập nhật dự án.'], 403);
        }

        $canEdit = in_array($request->user()->role, ['admin', 'administrator', 'quan_ly'], true)
            || (int) $project->owner_id === (int) $request->user()->id;
        if (! $canEdit && $this->projectHasLinkedContract($project)) {
            $collectorId = ProjectScope::projectCollectorId($project);
            $contractCreatorId = $this->projectContractCreatorId($project);

            if ($collectorId === (int) $request->user()->id || $contractCreatorId === (int) $request->user()->id) {
                $canEdit = true;
            }
        }

        if (! $canEdit) {
            return response()->json(['message' => 'Bạn chỉ có quyền xem dự án trong phạm vi phụ trách.'], 403);
        }

        $validated = $request->validate($this->rules($project->id));
        $this->normalizeProjectUrlFields($validated);
        if (array_key_exists('owner_id', $validated)) {
            if ($error = $this->validateProjectOwner($validated['owner_id'])) {
                return response()->json(['message' => $error], 422);
            }
        }
        $nextStatus = (string) ($validated['status'] ?? $project->status);
        $currentHandoverStatus = (string) ($project->handover_status ?? 'chua_ban_giao');

        if (($validated['service_type'] ?? $project->service_type) === 'khac') {
            $validated['service_type_other'] = trim((string) ($validated['service_type_other'] ?? $project->service_type_other ?? ''));
            if ($validated['service_type_other'] === '') {
                return response()->json(['message' => 'Vui lòng nhập loại dịch vụ khác.'], 422);
            }
        } else {
            $validated['service_type_other'] = null;
        }

        $oldContractId = $project->contract_id;
        $oldWorkflowTopicId = (int) ($project->workflow_topic_id ?? 0);
        $contract = $this->resolveContractForProject($validated, $project);
        if ($contract instanceof JsonResponse) {
            return $contract;
        }
        $needsHandoverApproval = $contract
            ? true
            : ($this->projectHasLinkedContract($project) && ! array_key_exists('contract_id', $validated));
        if ($nextStatus === 'hoan_thanh' && $needsHandoverApproval && $currentHandoverStatus !== 'approved') {
            return response()->json([
                'message' => 'Dự án chỉ được chuyển Hoàn thành sau khi phiếu bàn giao đã được duyệt.',
            ], 422);
        }

        $newWorkflowTopicId = array_key_exists('workflow_topic_id', $validated)
            ? (int) ($validated['workflow_topic_id'] ?? 0)
            : $oldWorkflowTopicId;
        $workflowTopicChanged = $oldWorkflowTopicId !== $newWorkflowTopicId;
        $confirmReapplyWorkflow = filter_var($request->input('confirm_reapply_workflow', false), FILTER_VALIDATE_BOOLEAN);
        if ($workflowTopicChanged && $oldWorkflowTopicId > 0 && $newWorkflowTopicId > 0 && ! $confirmReapplyWorkflow) {
            return response()->json([
                'message' => 'Đổi Topic Barem sẽ xóa toàn bộ công việc/đầu việc hiện tại. Vui lòng xác nhận trước khi lưu.',
                'code' => 'workflow_topic_reapply_confirmation_required',
            ], 422);
        }

        $oldWebsiteRaw = (string) ($project->website_url ?? '');
        $project->update($validated);
        $syncService->handleWebsiteMutation($project, $oldWebsiteRaw);

        if ($workflowTopicChanged && $newWorkflowTopicId > 0) {
            DB::transaction(function () use ($project, $oldWorkflowTopicId, $newWorkflowTopicId, $request, $workflowTopicApplier) {
                if ($oldWorkflowTopicId > 0) {
                    // Đổi từ barem A sang barem B: làm mới danh sách công việc/đầu việc để khớp 100% barem mới.
                    $project->tasks()->delete();
                }

                $workflowTopicApplier->applyToProject(
                    $project,
                    $newWorkflowTopicId,
                    (int) $request->user()->id
                );
            });
        }

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
        if (! in_array((string) $request->user()->role, ['admin', 'administrator'], true)) {
            return response()->json(['message' => 'Chỉ admin/administrator mới có quyền xóa dự án.'], 403);
        }

        DB::transaction(function () use ($project) {
            Contract::query()
                ->where('project_id', $project->id)
                ->update(['project_id' => null]);

            ProjectMeeting::query()
                ->where('project_id', $project->id)
                ->delete();

            $project->delete();
        });

        return response()->json([
            'message' => 'Đã xóa dự án cùng toàn bộ công việc và đầu việc liên quan.',
        ]);
    }

    public function handoverQueue(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Project::query()
            ->with($this->baseRelations())
            ->where('handover_status', 'pending')
            ->where(function ($projectQuery) {
                $projectQuery->whereNotNull('projects.contract_id')
                    ->orWhereExists(function ($existsQuery) {
                        $existsQuery->select(DB::raw(1))
                            ->from('contracts')
                            ->whereColumn('contracts.project_id', 'projects.id');
                    });
            });

        if (! in_array((string) $user->role, ['admin', 'administrator'], true)) {
            $query->where(function ($projectQuery) use ($user) {
                $projectQuery->whereHas('contract', function ($contractQuery) use ($user) {
                    $contractQuery->where('collector_user_id', $user->id);
                })->orWhereExists(function ($existsQuery) use ($user) {
                    $existsQuery->select(DB::raw(1))
                        ->from('contracts')
                        ->whereColumn('contracts.project_id', 'projects.id')
                        ->where('contracts.collector_user_id', $user->id);
                });
            });
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhereHas('client', function ($clientQuery) use ($search) {
                        $clientQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    })
                    ->orWhereHas('contract', function ($contractQuery) use ($search) {
                        $contractQuery->where('code', 'like', "%{$search}%")
                            ->orWhere('title', 'like', "%{$search}%");
                    });
            });
        }

        /** @var \Illuminate\Pagination\LengthAwarePaginator $paginator */
        $paginator = $query
            ->orderByDesc('handover_requested_at')
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 50));

        $paginator->setCollection($paginator->getCollection()->transform(function (Project $project) use ($user) {
            return $this->transformProject($project, $user);
        }));

        return response()->json($paginator);
    }

    public function submitHandover(Project $project, Request $request): JsonResponse
    {
        if (! ProjectScope::canAccessProject($request->user(), $project)) {
            return response()->json(['message' => 'Không có quyền gửi duyệt bàn giao dự án này.'], 403);
        }

        if (! $this->projectHasLinkedContract($project)) {
            return response()->json([
                'message' => 'Dự án nội bộ không cần gửi phiếu duyệt bàn giao vì không có hợp đồng liên kết.',
            ], 422);
        }

        $minimum = $this->handoverMinimumProgressPercent();
        if (! ProjectScope::canSubmitProjectHandover($request->user(), $project, $minimum)) {
            return response()->json([
                'message' => "Chỉ admin hoặc phụ trách dự án mới được gửi duyệt, và tiến độ phải từ {$minimum}% trở lên.",
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

            $this->markLinkedContractHandoverReceived($project, $request->user());
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

    /**
     * @param  array<string, mixed>  $validated
     */
    private function normalizeProjectUrlFields(array &$validated): void
    {
        foreach (['repo_url', 'website_url'] as $key) {
            if (! array_key_exists($key, $validated)) {
                continue;
            }
            $validated[$key] = ExternalUrl::toAbsoluteHref($validated[$key] ?? null);
        }
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
            'workflow_topic_id' => ['nullable', 'integer', 'exists:workflow_topics,id'],
            'start_date' => ['nullable', 'date'],
            'deadline' => ['nullable', 'date'],
            'budget' => ['nullable', 'numeric', 'min:0'],
            'status' => ['required', 'string', 'max:50'],
            'customer_requirement' => ['nullable', 'string'],
            'owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'repo_url' => ['nullable', 'string', 'max:255'],
            'website_url' => ['nullable', 'string', 'max:255'],
            'confirm_reapply_workflow' => ['nullable', 'boolean'],
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

        // Strict 1:1: check contract.project_id
        if ($contract->project_id && (int) $contract->project_id !== (int) optional($project)->id) {
            return response()->json(['message' => 'Hợp đồng đã liên kết với dự án khác.'], 422);
        }

        // Also check projects table for any existing project with this contract_id
        $existing = Project::where('contract_id', $contract->id)
            ->where('id', '!=', (int) optional($project)->id)
            ->first();
        if ($existing) {
            return response()->json(['message' => 'Hợp đồng đã có dự án liên kết (dự án #'.$existing->id.').'], 422);
        }

        if (! empty($validated['client_id']) && (int) $validated['client_id'] !== (int) $contract->client_id) {
            return response()->json(['message' => 'Khách hàng không khớp với hợp đồng.'], 422);
        }

        $validated['client_id'] = $contract->client_id;

        return $contract;
    }

    /**
     * Check if user can create project from a specific contract.
     * Only admin or the contract's collector.
     */
    private function assertCanCreateFromContract(User $user, int $contractId, ?Contract $contract = null): ?JsonResponse
    {
        $contract = $contract ?: Contract::with(['creator', 'collector'])->find($contractId);
        if (! $contract) {
            return response()->json(['message' => 'Hợp đồng không tồn tại.'], 404);
        }

        if ($contract->approval_status !== 'approved') {
            return response()->json(['message' => 'Bạn chỉ có thể tạo dự án cho hợp đồng đã được duyệt.'], 422);
        }

        if (in_array((string) $user->role, ['admin', 'administrator'], true)) {
            return null;
        }

        $isCollector = (int) ($contract->collector_user_id ?? 0) === (int) $user->id;
        if ($isCollector) {
            return null;
        }

        return response()->json(['message' => 'Chỉ admin hoặc nhân sự thu hợp đồng mới được tạo dự án từ hợp đồng đã duyệt.'], 403);
    }

    private function baseRelations(): array
    {
        return [
            'client:id,name,company,email,phone',
            'creator:id,name,email,role,avatar_url',
            'owner:id,name,email,role,avatar_url,department_id',
            'workflowTopic:id,name,code,is_active',
            'approver:id,name,email,role,avatar_url',
            'handoverRequester:id,name,email,role,avatar_url',
            'contract:id,code,title,notes,client_id,project_id,value,status,approval_status,start_date,end_date,signed_at,collector_user_id,handover_receive_status,handover_received_by,handover_received_at',
            'contract.collector:id,name,email,role,avatar_url,department_id',
            'linkedContract:id,code,title,notes,client_id,project_id,value,status,approval_status,start_date,end_date,signed_at,collector_user_id,handover_receive_status,handover_received_by,handover_received_at',
            'linkedContract.collector:id,name,email,role,avatar_url,department_id',
        ];
    }

    private function transformProject(Project $project, ?User $user, bool $detailed = false): array
    {
        $payload = $project->toArray();
        $primaryContract = $payload['contract'] ?? null;
        $fallbackContract = $payload['linked_contract'] ?? null;
        $resolvedContract = $primaryContract ?: $fallbackContract;
        if ($resolvedContract) {
            $payload['contract'] = $resolvedContract;
            $payload['contract_id'] = (int) ($payload['contract_id'] ?? $resolvedContract['id'] ?? 0) ?: (int) ($resolvedContract['id'] ?? 0);
        }
        unset($payload['linked_contract']);

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

        $canEdit = $user
            ? in_array($user->role, ['admin', 'administrator', 'quan_ly'], true)
                || (int) $project->owner_id === (int) $user->id
            : false;
        if (! $canEdit && $user && $this->projectHasLinkedContract($project)) {
            $collectorId = ProjectScope::projectCollectorId($project);
            $contractCreatorId = $this->projectContractCreatorId($project);

            if ($collectorId === (int) $user->id || $contractCreatorId === (int) $user->id) {
                $canEdit = true;
            }
        }

        return [
            'can_view' => ProjectScope::canAccessProject($user, $project),
            'can_edit' => $canEdit,
            'can_delete' => $user ? in_array((string) $user->role, ['admin', 'administrator'], true) : false,
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
            ->whereIn('role', ['admin', 'administrator'])
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

    private function resolveOwnerFilterIds(Request $request): array
    {
        $raw = $request->input('owner_ids', []);
        if (is_string($raw)) {
            $raw = preg_split('/[\s,;|]+/', $raw) ?: [];
        }
        if (! is_array($raw)) {
            $raw = [];
        }

        if ($request->filled('owner_id')) {
            $raw[] = $request->input('owner_id');
        }

        return collect($raw)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function ($id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();
    }

    private function notifyHandoverSubmitted(Project $project, Request $request): void
    {
        $targetIds = $this->handoverReviewerIds($project, (int) $request->user()->id);
        if (empty($targetIds)) {
            return;
        }

        app(NotificationService::class)->notifyUsers(
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
                'dedupe' => false,
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

        app(NotificationService::class)->notifyUsers(
            [$ownerId],
            $title,
            $body,
            [
                'type' => 'project_handover_reviewed',
                'project_id' => $project->id,
                'decision' => $decision,
                'reason' => $reason,
                'dedupe' => false,
            ]
        );
    }

    private function validateProjectOwner($ownerId): ?string
    {
        $ownerId = (int) ($ownerId ?? 0);
        if ($ownerId <= 0) {
            return null;
        }

        $owner = User::query()->select(['id', 'role'])->find($ownerId);
        if (! $owner) {
            return 'Người phụ trách dự án không tồn tại.';
        }

        if (in_array((string) $owner->role, ['admin', 'administrator', 'ke_toan'], true)) {
            return 'Không thể chọn admin/administrator/kế toán làm người phụ trách dự án.';
        }

        return null;
    }

    private function markLinkedContractHandoverReceived(Project $project, User $reviewer): void
    {
        $contract = null;

        if ($project->relationLoaded('contract') && $project->contract) {
            $contract = $project->contract;
        } elseif (! empty($project->contract_id)) {
            $contract = Contract::query()->find((int) $project->contract_id);
        } else {
            $contract = Contract::query()
                ->where('project_id', $project->id)
                ->first();
        }

        if (! $contract) {
            return;
        }

        $contract->update([
            'handover_receive_status' => 'da_nhan_ban_giao',
            'handover_received_by' => $reviewer->id,
            'handover_received_at' => now(),
        ]);
    }

    private function projectHasLinkedContract(Project $project): bool
    {
        return ProjectScope::hasLinkedContract($project);
    }

    private function projectContractCreatorId(Project $project): int
    {
        $creatorId = $project->relationLoaded('contract')
            ? (int) optional($project->contract)->created_by
            : (int) $project->contract()->value('created_by');

        if ($creatorId <= 0) {
            $creatorId = (int) Contract::query()
                ->where('project_id', $project->id)
                ->value('created_by');
        }

        return max(0, $creatorId);
    }
}
