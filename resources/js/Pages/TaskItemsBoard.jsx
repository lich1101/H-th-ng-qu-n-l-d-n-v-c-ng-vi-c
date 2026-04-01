import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';

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

const formatDate = (raw) => (raw ? String(raw).slice(0, 10) : '—');

export default function TaskItemsBoard(props) {
    const toast = useToast();
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const [filters, setFilters] = useState({
        project_id: searchParams.get('project_id') || '',
        task_id: searchParams.get('task_id') || '',
        assignee_id: searchParams.get('assignee_id') || '',
        status: searchParams.get('status') || '',
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
            const res = await axios.get('/api/v1/users/lookup');
            setUsers(res.data?.data || []);
        } catch {
            setUsers([]);
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

    const fetchItems = async (page = filters.page, nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/task-items', {
                params: {
                    per_page: nextFilters.per_page || 30,
                    page,
                    ...(nextFilters.project_id ? { project_id: nextFilters.project_id } : {}),
                    ...(nextFilters.task_id ? { task_id: nextFilters.task_id } : {}),
                    ...(nextFilters.assignee_id ? { assignee_id: nextFilters.assignee_id } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.start_from ? { start_from: nextFilters.start_from } : {}),
                    ...(nextFilters.start_to ? { start_to: nextFilters.start_to } : {}),
                    ...(nextFilters.deadline_from ? { deadline_from: nextFilters.deadline_from } : {}),
                    ...(nextFilters.deadline_to ? { deadline_to: nextFilters.deadline_to } : {}),
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
                    description="Lọc đầu việc theo dự án, công việc, nhân sự và mốc thời gian để rà tiến độ chính xác hơn."
                    actions={(
                        <FilterActionGroup>
                            <button
                                type="button"
                                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                                onClick={() => fetchItems(1, { ...filters, page: 1 })}
                            >
                                Lọc
                            </button>
                        </FilterActionGroup>
                    )}
                >
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                            <select
                                className={filterControlClass}
                                value={filters.assignee_id}
                                onChange={(e) => setFilters((s) => ({ ...s, assignee_id: e.target.value }))}
                            >
                                <option value="">Tất cả nhân sự</option>
                                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                            </select>
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
                        <FilterField label="Tìm kiếm">
                            <input
                                className={filterControlClass}
                                placeholder="Tiêu đề đầu việc hoặc công việc"
                                value={filters.search}
                                onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
                            />
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
                                        onClick={() => { window.location.href = `/cong-viec/${item.task_id}`; }}
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
