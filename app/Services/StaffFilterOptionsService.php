<?php

namespace App\Services;

use App\Http\Helpers\CrmScope;
use App\Http\Helpers\ProjectScope;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Opportunity;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class StaffFilterOptionsService
{
    /**
     * Nhân sự hiển thị ở cột «Phụ trách» (assigned_staff; hoặc sales_owner khi chưa có người phụ trách) — không gồm đội chăm sóc.
     *
     * @return Collection<int, User>
     */
    public function forCrmClients(User $viewer): Collection
    {
        $base = Client::query();
        CrmScope::applyClientScope($base, $viewer);

        $ids = collect();
        $ids = $ids->merge((clone $base)->whereNotNull('assigned_staff_id')->distinct()->pluck('assigned_staff_id'));
        $ids = $ids->merge(
            (clone $base)
                ->whereNull('assigned_staff_id')
                ->whereNotNull('sales_owner_id')
                ->distinct()
                ->pluck('sales_owner_id')
        );

        return $this->usersFromIds($ids);
    }

    /**
     * Nhân sự liên quan hợp đồng trong phạm vi (khớp các nhánh lọc staff_ids).
     *
     * @return Collection<int, User>
     */
    public function forContracts(User $viewer): Collection
    {
        $base = Contract::query();
        CrmScope::applyContractScope($base, $viewer);

        $ids = (clone $base)->whereNotNull('collector_user_id')->distinct()->pluck('collector_user_id');

        return $this->usersFromIds($ids);
    }

    /**
     * Chủ nhiệm dự án (owner_id) trong phạm vi.
     *
     * @return Collection<int, User>
     */
    public function forProjects(User $viewer): Collection
    {
        $base = Project::query();
        ProjectScope::applyProjectScope($base, $viewer);

        $ids = (clone $base)->whereNotNull('owner_id')->distinct()->pluck('owner_id');

        return $this->usersFromIds($ids);
    }

    /**
     * Người phụ trách / người tạo cơ hội trong phạm vi (khớp bộ lọc staff hiện tại).
     *
     * @return Collection<int, User>
     */
    public function forOpportunities(User $viewer): Collection
    {
        $base = Opportunity::query();
        CrmScope::applyOpportunityScope($base, $viewer);

        $ids = collect();
        $ids = $ids->merge((clone $base)->whereNotNull('assigned_to')->distinct()->pluck('assigned_to'));
        $ids = $ids->merge(
            (clone $base)
                ->whereNull('assigned_to')
                ->whereNotNull('created_by')
                ->distinct()
                ->pluck('created_by')
        );

        return $this->usersFromIds($ids);
    }

    /**
     * Người được giao công việc trong phạm vi.
     *
     * @return Collection<int, User>
     */
    public function forTasks(User $viewer): Collection
    {
        $base = Task::query();
        ProjectScope::applyTaskScope($base, $viewer);

        $ids = (clone $base)->whereNotNull('assignee_id')->distinct()->pluck('assignee_id');

        return $this->usersFromIds($ids);
    }

    /**
     * Người được giao đầu việc (task_items.assignee_id) trong phạm vi danh sách đầu việc.
     *
     * @return Collection<int, User>
     */
    public function forTaskItems(User $viewer): Collection
    {
        $base = TaskItem::query();
        ProjectScope::applyTaskItemListScope($base, $viewer);

        $ids = (clone $base)->whereNotNull('assignee_id')->distinct()->pluck('assignee_id');

        return $this->usersFromIds($ids);
    }

    /**
     * @param  Collection<int, mixed>|array<int, mixed>  $ids
     * @return Collection<int, User>
     */
    private function usersFromIds(Collection|array $ids): Collection
    {
        $unique = collect($ids)
            ->map(function ($id) {
                return (int) $id;
            })
            ->filter(function (int $id) {
                return $id > 0;
            })
            ->unique()
            ->values()
            ->all();

        if ($unique === []) {
            return collect();
        }

        return User::query()
            ->select(['id', 'name', 'email', 'role', 'department_id', 'avatar_url'])
            ->where('is_active', true)
            ->whereIn('id', $unique)
            ->orderBy('name')
            ->get()
            ->values();
    }
}
