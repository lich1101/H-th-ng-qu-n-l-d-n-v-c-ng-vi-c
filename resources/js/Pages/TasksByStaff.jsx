import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
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

const formatDate = (raw) => {
    if (!raw) return '—';
    return String(raw).slice(0, 10);
};

export default function TasksByStaff(props) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [filters, setFilters] = useState({
        project_id: '',
        assignee_id: '',
        status: '',
        search: '',
        deadline_from: '',
        deadline_to: '',
    });

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/v1/users/lookup');
            setUsers(res.data?.data || []);
        } catch {
            setUsers([]);
        }
    };

    const fetchProjects = async () => {
        try {
            const res = await axios.get('/api/v1/projects', { params: { per_page: 200 } });
            setProjects(res.data?.data || []);
        } catch {
            setProjects([]);
        }
    };

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/tasks', {
                params: {
                    per_page: 200,
                    ...(filters.project_id ? { project_id: filters.project_id } : {}),
                    ...(filters.assignee_id ? { assignee_id: filters.assignee_id } : {}),
                    ...(filters.status ? { status: filters.status } : {}),
                    ...(filters.search ? { search: filters.search } : {}),
                    ...(filters.deadline_from ? { deadline_from: filters.deadline_from } : {}),
                    ...(filters.deadline_to ? { deadline_to: filters.deadline_to } : {}),
                },
            });
            setTasks(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được công việc theo nhân sự.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchProjects();
        fetchTasks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const groups = useMemo(() => {
        const map = {};
        tasks.forEach((task) => {
            const key = String(task?.assignee?.id || 0);
            if (!map[key]) {
                map[key] = {
                    id: task?.assignee?.id || 0,
                    name: task?.assignee?.name || 'Chưa gán nhân sự',
                    rows: [],
                };
            }
            map[key].rows.push(task);
        });
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }, [tasks]);

    return (
        <PageContainer
            auth={props.auth}
            title="Công việc theo nhân sự"
            description="Theo dõi khối lượng công việc theo từng nhân viên và tiến độ thực hiện."
            stats={[]}
        >
            <div className="lg:col-span-2 space-y-4">
                <FilterToolbar
                    title="Bộ lọc công việc theo nhân sự"
                    description="Lọc theo dự án, nhân sự, trạng thái và khoảng hạn chót để theo dõi khối lượng công việc rõ hơn."
                    actions={(
                        <FilterActionGroup>
                            <button
                                type="button"
                                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                                onClick={fetchTasks}
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
                                onChange={(e) => setFilters((s) => ({ ...s, project_id: e.target.value }))}
                            >
                                <option value="">Tất cả dự án</option>
                                {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                            </select>
                        </FilterField>
                        <FilterField label="Nhân sự">
                            <select
                                className={filterControlClass}
                                value={filters.assignee_id}
                                onChange={(e) => setFilters((s) => ({ ...s, assignee_id: e.target.value }))}
                            >
                                <option value="">Tất cả nhân sự</option>
                                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
                                placeholder="Tiêu đề công việc"
                                value={filters.search}
                                onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
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
                </FilterToolbar>

                {loading && (
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm text-slate-500 shadow-card">
                        Đang tải...
                    </div>
                )}

                {!loading && groups.map((group) => (
                    <div key={group.id || group.name} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
                            <span className="text-xs text-slate-500">{group.rows.length} công việc</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                                        <th className="py-2">Công việc</th>
                                        <th className="py-2">Dự án</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Tiến độ</th>
                                        <th className="py-2">Deadline</th>
                                        <th className="py-2 text-right">Đầu việc</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.rows.map((task) => (
                                        <tr
                                            key={task.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                                            onClick={() => { window.location.href = `/cong-viec/${task.id}`; }}
                                        >
                                            <td className="py-2.5">
                                                <p className="font-medium text-slate-900">{task.title}</p>
                                                <p className="text-xs text-slate-500">{task.description || '—'}</p>
                                            </td>
                                            <td className="py-2.5 text-xs text-slate-600">{task.project?.name || '—'}</td>
                                            <td className="py-2.5">
                                                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${STATUS_STYLES[task.status] || STATUS_STYLES.todo}`}>
                                                    {LABELS[task.status] || task.status}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-xs text-slate-600">{task.progress_percent ?? 0}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(task.deadline)}</td>
                                            <td className="py-2.5 text-right">
                                                <a
                                                    href={`/dau-viec?task_id=${task.id}`}
                                                    className="text-xs font-semibold text-primary"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    Xem đầu việc
                                                </a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}

                {!loading && groups.length === 0 && (
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm text-slate-500 shadow-card">
                        Chưa có công việc theo bộ lọc hiện tại.
                    </div>
                )}
            </div>
        </PageContainer>
    );
}
