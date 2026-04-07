import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, {
    FILTER_GRID_RESPONSIVE,
    FILTER_GRID_SUBMIT_ROW,
    FILTER_SUBMIT_BUTTON_CLASS,
    FilterActionGroup,
    FilterField,
    filterControlClass,
} from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import PaginationControls from '@/Components/PaginationControls';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate } from '@/lib/vietnamTime';
import { fetchStaffFilterOptions, usersToStaffTagOptions } from '@/lib/staffFilterOptions';

const LABELS = {
    todo: 'Cần làm',
    doing: 'Đang làm',
    done: 'Hoàn tất',
    blocked: 'Bị chặn',
};

const STATUS_STYLES = {
    todo: 'bg-slate-100 text-slate-700 border-slate-200',
    doing: 'bg-blue-50 text-blue-700 border-blue-200',
    done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blocked: 'bg-rose-50 text-rose-700 border-rose-200',
};

const formatDate = (raw) => formatVietnamDate(raw, '—');
const parseMultiIds = (raw) => {
    if (!raw) return [];
    return String(raw)
        .split(/[\s,;|]+/)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
};

export default function TaskItemsBoard(props) {
    const toast = useToast();
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const [filters, setFilters] = useState({
        project_id: searchParams.get('project_id') || '',
        task_id: searchParams.get('task_id') || '',
        assignee_ids: parseMultiIds(searchParams.get('assignee_ids') || searchParams.get('assignee_id')),
        status: searchParams.get('status') || '',
        pace: searchParams.get('pace') || '',
        search: searchParams.get('search') || '',
        start_from: searchParams.get('start_from') || '',
        start_to: searchParams.get('start_to') || '',
        deadline_from: searchParams.get('deadline_from') || '',
        deadline_to: searchParams.get('deadline_to') || '',
        per_page: 30,
        page: 1,
    });
    const [items, setItems] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [taskItemAssigneeFilterUsers, setTaskItemAssigneeFilterUsers] = useState([]);
    const [paging, setPaging] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [loading, setLoading] = useState(false);

    const fetchProjects = async () => {
        try {
            const res = await axios.get('/api/v1/projects', { params: { per_page: 200 } });
            setProjects(res.data?.data || []);
        } catch {
            setProjects([]);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/v1/users/lookup', {
                params: { purpose: 'operational_assignee' },
            });
            setUsers(res.data?.data || []);
        } catch {
            setUsers([]);
        }
    };

    const fetchTaskItemStaffFilterOptions = async () => {
        try {
            const rows = await fetchStaffFilterOptions('task_items');
            setTaskItemAssigneeFilterUsers(rows);
        } catch {
            setTaskItemAssigneeFilterUsers([]);
        }
    };

    const fetchTaskOptions = async (projectId = '') => {
        try {
            const res = await axios.get('/api/v1/tasks', {
                params: {
                    per_page: 200,
                    ...(projectId ? { project_id: projectId } : {}),
                },
            });
            setTasks(res.data?.data || []);
        } catch {
            setTasks([]);
        }
    };

    const handleSearch = (val) => {
        const next = { ...filters, search: val, page: 1 };
        setFilters(next);
    };

    const applyTaskItemFilters = () => {
        setFilters((prev) => {
            const next = { ...prev, page: 1 };
            fetchItems(1, next);
            return next;
        });
    };

    const fetchItems = async (page = filters.page, nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/task-items', {
                params: {
                    per_page: nextFilters.per_page || 30,
                    page,
                    ...(nextFilters.project_id ? { project_id: nextFilters.project_id } : {}),
                    ...(nextFilters.task_id ? { task_id: nextFilters.task_id } : {}),
                    ...(Array.isArray(nextFilters.assignee_ids) && nextFilters.assignee_ids.length > 0 ? { assignee_ids: nextFilters.assignee_ids } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.start_from ? { start_from: nextFilters.start_from } : {}),
                    ...(nextFilters.start_to ? { start_to: nextFilters.start_to } : {}),
                    ...(nextFilters.deadline_from ? { deadline_from: nextFilters.deadline_from } : {}),
                    ...(nextFilters.deadline_to ? { deadline_to: nextFilters.deadline_to } : {}),
                    ...(nextFilters.pace ? { pace: nextFilters.pace } : {}),
                },
            });
            setItems(res.data?.data || []);
            setPaging({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((s) => ({ ...s, page: res.data?.current_page || 1 }));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách đầu việc.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
        fetchUsers();
        fetchTaskItemStaffFilterOptions();
        fetchTaskOptions(filters.project_id);
        fetchItems(1, { ...filters, page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchTaskOptions(filters.project_id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.project_id]);

    const summary = useMemo(() => {
        const done = items.filter((item) => item.status === 'done').length;
        const doing = items.filter((item) => item.status === 'doing').length;
        return { done, doing };
    }, [items]);
    const assigneeFilterOptions = useMemo(() => {
        if (taskItemAssigneeFilterUsers.length > 0) {
            return usersToStaffTagOptions(taskItemAssigneeFilterUsers);
        }
        return usersToStaffTagOptions(users);
    }, [taskItemAssigneeFilterUsers, users]);

    return (
        <PageContainer
            auth={props.auth}
            title="Danh sách đầu việc"
            description="Theo dõi đầu việc theo nhân sự, thời gian, trạng thái và công việc liên quan."
            stats={[]}
        >
            <div className="lg:col-span-2 space-y-4">
                <FilterToolbar enableSearch
                    title="Bộ lọc đầu việc"
                    description="Tìm nhanh đầu việc qua tiêu đề, dự án, công việc hoặc nhân sự phụ trách."
                    searchValue={filters.search}
                    onSearch={handleSearch}
                    onSubmitFilters={applyTaskItemFilters}
                >
                    <div className={FILTER_GRID_RESPONSIVE}>
                        <FilterField label="Dự án">
                            <select
                                className={filterControlClass}
                                value={filters.project_id}
                                onChange={(e) => setFilters((s) => ({ ...s, project_id: e.target.value, task_id: '' }))}
                            >
                                <option value="">Tất cả dự án</option>
                                {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                            </select>
                        </FilterField>
                        <FilterField label="Công việc">
                            <select
                                className={filterControlClass}
                                value={filters.task_id}
                                onChange={(e) => setFilters((s) => ({ ...s, task_id: e.target.value }))}
                            >
                                <option value="">Tất cả công việc</option>
                                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                            </select>
                        </FilterField>
                        <FilterField label="Nhân sự">
                            <TagMultiSelect
                                options={assigneeFilterOptions}
                                selectedIds={filters.assignee_ids}
                                onChange={(selectedIds) => setFilters((s) => ({ ...s, assignee_ids: selectedIds }))}
                                addPlaceholder="Tìm và thêm nhân sự"
                                emptyLabel="Để trống để xem toàn bộ nhân sự trong phạm vi."
                            />
                        </FilterField>
                        <FilterField label="Trạng thái">
                            <select
                                className={filterControlClass}
                                value={filters.status}
                                onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                            >
                                <option value="">Tất cả trạng thái</option>
                                {Object.keys(LABELS).map((key) => <option key={key} value={key}>{LABELS[key]}</option>)}
                            </select>
                        </FilterField>
                        <FilterField label="So với tiến độ kỳ vọng">
                            <select
                                className={filterControlClass}
                                value={filters.pace}
                                onChange={(e) => setFilters((s) => ({ ...s, pace: e.target.value }))}
                                title="Kỳ vọng theo đường tuyến tính từ ngày bắt đầu đến deadline (chia đều % theo ngày)."
                            >
                                <option value="">Tất cả</option>
                                <option value="behind">Chậm tiến độ</option>
                                <option value="on_track">Kịp tiến độ</option>
                                <option value="ahead">Vượt tiến độ</option>
                            </select>
                        </FilterField>

                        <FilterField label="Từ ngày bắt đầu">
                            <input
                                type="date"
                                className={filterControlClass}
                                value={filters.start_from}
                                onChange={(e) => setFilters((s) => ({ ...s, start_from: e.target.value }))}
                            />
                        </FilterField>
                        <FilterField label="Đến ngày bắt đầu">
                            <input
                                type="date"
                                className={filterControlClass}
                                value={filters.start_to}
                                onChange={(e) => setFilters((s) => ({ ...s, start_to: e.target.value }))}
                            />
                        </FilterField>
                        <FilterField label="Từ hạn chót">
                            <input
                                type="date"
                                className={filterControlClass}
                                value={filters.deadline_from}
                                onChange={(e) => setFilters((s) => ({ ...s, deadline_from: e.target.value }))}
                            />
                        </FilterField>
                        <FilterField label="Đến hạn chót">
                            <input
                                type="date"
                                className={filterControlClass}
                                value={filters.deadline_to}
                                onChange={(e) => setFilters((s) => ({ ...s, deadline_to: e.target.value }))}
                            />
                        </FilterField>
                        <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                            <button type="submit" className={FILTER_SUBMIT_BUTTON_CLASS}>
                                Lọc
                            </button>
                        </FilterActionGroup>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                        Tổng: {paging.total} • Đang làm: {summary.doing} • Hoàn tất: {summary.done}
                    </div>
                </FilterToolbar>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                                    <th className="py-2">Đầu việc</th>
                                    <th className="py-2">Công việc</th>
                                    <th className="py-2">Dự án</th>
                                    <th className="py-2">Nhân sự</th>
                                    <th className="py-2">Trạng thái</th>
                                    <th className="py-2">Tiến độ</th>
                                    <th className="py-2">Tỷ trọng</th>
                                    <th className="py-2">Bắt đầu</th>
                                    <th className="py-2">Deadline</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                                        onClick={() => { window.location.href = `/dau-viec/${item.id}`; }}
                                    >
                                        <td className="py-2.5">
                                            <p className="font-medium text-slate-900">{item.title}</p>
                                            <p className="text-xs text-slate-500">{item.description || '—'}</p>
                                        </td>
                                        <td className="py-2.5 text-xs text-slate-600">{item.task?.title || '—'}</td>
                                        <td className="py-2.5 text-xs text-slate-600">{item.task?.project?.name || '—'}</td>
                                        <td className="py-2.5 text-xs text-slate-600">{item.assignee?.name || '—'}</td>
                                        <td className="py-2.5">
                                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${STATUS_STYLES[item.status] || STATUS_STYLES.todo}`}>
                                                {LABELS[item.status] || item.status}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-xs text-slate-600">{item.progress_percent ?? 0}%</td>
                                        <td className="py-2.5 text-xs text-slate-600">{Number(item.weight_percent ?? 0)}%</td>
                                        <td className="py-2.5 text-xs text-slate-600">{formatDate(item.start_date)}</td>
                                        <td className="py-2.5 text-xs text-slate-600">{formatDate(item.deadline)}</td>
                                    </tr>
                                ))}
                                {loading && (
                                    <tr>
                                        <td className="py-6 text-center text-sm text-slate-500" colSpan={9}>Đang tải...</td>
                                    </tr>
                                )}
                                {!loading && items.length === 0 && (
                                    <tr>
                                        <td className="py-6 text-center text-sm text-slate-500" colSpan={9}>Chưa có đầu việc theo bộ lọc.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls
                        page={paging.current_page}
                        lastPage={paging.last_page}
                        total={paging.total}
                        perPage={filters.per_page}
                        label="đầu việc"
                        loading={loading}
                        onPageChange={(page) => fetchItems(page, filters)}
                        onPerPageChange={(perPage) => {
                            const next = { ...filters, per_page: perPage, page: 1 };
                            setFilters(next);
                            fetchItems(1, next);
                        }}
                    />
                </div>
            </div>
        </PageContainer>
    );
}
