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
import FilterDateInput from '@/Components/FilterDateInput';
import PageContainer from '@/Components/PageContainer';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';
import { progressBarFillClass } from '@/lib/progressBarFill';
import { formatVietnamDate } from '@/lib/vietnamTime';

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

const PRIORITY_LABELS = { low: 'Thấp', medium: 'Trung Bình', high: 'Cao', urgent: 'Khẩn' };
const PRIORITY_STYLES = {
    low: 'bg-slate-100 text-slate-700 border-slate-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    urgent: 'bg-rose-50 text-rose-700 border-rose-200',
};

const formatDate = (raw) => formatVietnamDate(raw, '—');

export default function TasksByStaff(props) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [paging, setPaging] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [filters, setFilters] = useState({
        project_id: '',
        assignee_id: '',
        status: '',
        search: '',
        deadline_from: '',
        deadline_to: '',
        per_page: 20,
        page: 1,
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

    const handleSearch = (val) => {
        setFilters((s) => ({ ...s, search: val, page: 1 }));
    };

    const applyTasksByStaffFilters = () => {
        setFilters((prev) => {
            const next = { ...prev, page: 1 };
            fetchTasks(1, next);
            return next;
        });
    };

    const fetchTasks = async (page = filters.page, nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/tasks', {
                params: {
                    page,
                    per_page: nextFilters.per_page || 20,
                    ...(nextFilters.project_id ? { project_id: nextFilters.project_id } : {}),
                    ...(nextFilters.assignee_id ? { assignee_id: nextFilters.assignee_id } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.deadline_from ? { deadline_from: nextFilters.deadline_from } : {}),
                    ...(nextFilters.deadline_to ? { deadline_to: nextFilters.deadline_to } : {}),
                },
            });
            setTasks(res.data?.data || []);
            setPaging({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((prev) => ({ ...prev, page: res.data?.current_page || page }));
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
                <FilterToolbar enableSearch
                    title="Bộ lọc công việc theo nhân sự"
                    description="Lọc theo dự án, nhân sự, trạng thái và khoảng hạn chót để theo dõi khối lượng công việc rõ hơn."
                    searchValue={filters.search}
                    onSearch={handleSearch}
                    onSubmitFilters={applyTasksByStaffFilters}
                >
                    <div className={FILTER_GRID_RESPONSIVE}>
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
                        <FilterField label="Từ hạn chót">
                            <FilterDateInput
                                className={filterControlClass}
                                value={filters.deadline_from}
                                onChange={(e) => setFilters((s) => ({ ...s, deadline_from: e.target.value }))}
                            />
                        </FilterField>
                        <FilterField label="Đến hạn chót">
                            <FilterDateInput
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
                                        <th className="py-2">Ưu tiên</th>
                                        <th className="py-2">Tiến độ</th>
                                        <th className="py-2">Tỷ trọng</th>
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
                                            <td className="py-2.5">
                                                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
                                                    {PRIORITY_LABELS[task.priority] || task.priority || 'Trung Bình'}
                                                </span>
                                            </td>
                                            <td className="py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-16 rounded-full bg-slate-100">
                                                        <div className={`h-1.5 rounded-full ${progressBarFillClass(task.progress_percent)}`} style={{ width: `${Math.min(100, task.progress_percent || 0)}%` }} />
                                                    </div>
                                                    <span className="text-xs text-slate-600">{task.progress_percent ?? 0}%</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(task.weight_percent ?? 0)}%</td>
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

                <PaginationControls
                    page={paging.current_page}
                    lastPage={paging.last_page}
                    total={paging.total}
                    perPage={filters.per_page}
                    label="công việc"
                    loading={loading}
                    onPageChange={(page) => fetchTasks(page, filters)}
                    onPerPageChange={(perPage) => {
                        const next = { ...filters, per_page: perPage, page: 1 };
                        setFilters(next);
                        fetchTasks(1, next);
                    }}
                />
            </div>
        </PageContainer>
    );
}
