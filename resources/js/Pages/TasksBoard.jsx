import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const DEFAULT_PRIORITIES = [
    { value: 'low', label: 'Thấp' },
    { value: 'medium', label: 'Trung bình' },
    { value: 'high', label: 'Cao' },
    { value: 'urgent', label: 'Khẩn cấp' },
];

const PRIORITY_LABELS = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn cấp',
};

const LABELS = {
    todo: 'Cần làm',
    doing: 'Đang làm',
    done: 'Hoàn tất',
    blocked: 'Bị chặn',
};

export default function TasksBoard(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'quan_ly'].includes(userRole);
    const canUpdate = ['admin', 'quan_ly', 'nhan_vien'].includes(userRole);
    const canDelete = ['admin', 'quan_ly'].includes(userRole);

    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [meta, setMeta] = useState({});
    const [viewMode, setViewMode] = useState('kanban');
    const [filters, setFilters] = useState({
        project_id: '',
        status: '',
        per_page: 30,
        page: 1,
    });
    const [metaPaging, setMetaPaging] = useState({ current_page: 1, last_page: 1, total: 0 });

    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        project_id: '',
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        deadline: '',
        progress_percent: 0,
        assignee_id: '',
    });

    const statusOptions = useMemo(() => {
        const values = meta.task_statuses || [];
        if (!values.length) {
            return ['todo', 'doing', 'done', 'blocked'];
        }
        return values;
    }, [meta]);

    const fetchMeta = async () => {
        try {
            const res = await axios.get('/api/v1/meta');
            setMeta(res.data || {});
        } catch {
            // ignore
        }
    };

    const fetchProjects = async () => {
        try {
            const res = await axios.get('/api/v1/projects', { params: { per_page: 200 } });
            setProjects(res.data?.data || []);
        } catch {
            // ignore
        }
    };

    const fetchTasks = async (page = filters.page, nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/tasks', {
                params: {
                    per_page: nextFilters.per_page,
                    page,
                    ...(nextFilters.project_id ? { project_id: nextFilters.project_id } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                },
            });
            setTasks(res.data?.data || []);
            setMetaPaging({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((s) => ({ ...s, page: res.data?.current_page || 1 }));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách công việc.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMeta();
        fetchProjects();
        fetchTasks(1, { ...filters, page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const open = metaPaging.total;
        const overdue = tasks.filter((t) => {
            if (!t.deadline) return false;
            try { return new Date(t.deadline).getTime() < Date.now() && t.status !== 'done'; } catch { return false; }
        }).length;
        const done = tasks.filter((t) => t.status === 'done').length;
        return [
            { label: 'Công việc (trang hiện tại)', value: String(tasks.length) },
            { label: 'Tổng theo bộ lọc', value: String(open) },
            { label: 'Quá hạn (trang)', value: String(overdue) },
            { label: 'Hoàn tất (trang)', value: String(done) },
        ];
    }, [tasks, metaPaging.total]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            project_id: '',
            title: '',
            description: '',
            priority: 'medium',
            status: statusOptions[0] || 'todo',
            deadline: '',
            progress_percent: 0,
            assignee_id: '',
        });
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const selectedProject = useMemo(
        () => projects.find((p) => String(p.id) === String(form.project_id)),
        [projects, form.project_id]
    );
    const projectHasContract = !!selectedProject?.contract_id;

    const startEdit = (t) => {
        setEditingId(t.id);
        setForm({
            project_id: t.project_id || '',
            title: t.title || '',
            description: t.description || '',
            priority: t.priority || 'medium',
            status: t.status || statusOptions[0] || 'todo',
            deadline: t.deadline ? String(t.deadline).slice(0, 10) : '',
            progress_percent: t.progress_percent ?? 0,
            assignee_id: t.assignee_id || '',
        });
        setShowForm(true);
    };

    const save = async () => {
        if (!canCreate && editingId == null) return toast.error('Bạn không có quyền tạo công việc.');
        if (!canUpdate && editingId != null) return toast.error('Bạn không có quyền cập nhật công việc.');
        if (!form.project_id || !form.title?.trim()) return toast.error('Vui lòng chọn dự án và nhập tiêu đề.');
        if (!projectHasContract) return toast.error('Dự án chưa có hợp đồng, không thể tạo công việc.');
        try {
            const payload = {
                project_id: Number(form.project_id),
                title: form.title,
                description: form.description || null,
                priority: form.priority,
                status: form.status,
                deadline: form.deadline || null,
                progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
                assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
            };
            if (editingId) {
                await axios.put(`/api/v1/tasks/${editingId}`, payload);
                toast.success('Đã cập nhật công việc.');
            } else {
                await axios.post('/api/v1/tasks', payload);
                toast.success('Đã tạo công việc.');
            }
            closeForm();
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu công việc thất bại.');
        }
    };

    const remove = async (id) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa công việc.');
        if (!confirm('Xóa công việc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${id}`);
            toast.success('Đã xóa công việc.');
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa công việc thất bại.');
        }
    };

    const columns = useMemo(() => {
        const buckets = {};
        for (const s of statusOptions) buckets[s] = [];
        for (const t of tasks) {
            const key = t.status || statusOptions[0];
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(t);
        }
        return statusOptions.map((s) => ({
            key: s,
            title: LABELS[s] || s,
            items: buckets[s] || [],
        }));
    }, [tasks, statusOptions]);

    const formatDate = (raw) => {
        if (!raw) return '';
        try {
            const d = new Date(raw);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        } catch {
            return String(raw).slice(0, 10);
        }
    };

    const sortedByDeadline = useMemo(() => (
        [...tasks].sort((a, b) => {
            const da = a.deadline ? new Date(a.deadline).getTime() : 0;
            const db = b.deadline ? new Date(b.deadline).getTime() : 0;
            return da - db;
        })
    ), [tasks]);

    const buildAckStamp = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}:00`;
    };

    const acknowledgeTask = async (t) => {
        if (!canUpdate) return toast.error('Bạn không có quyền xác nhận.');
        try {
            await axios.put(`/api/v1/tasks/${t.id}`, {
                project_id: t.project_id,
                title: t.title,
                description: t.description || null,
                priority: t.priority || 'medium',
                status: t.status,
                start_at: t.start_at || null,
                deadline: t.deadline || null,
                completed_at: t.completed_at || null,
                progress_percent: t.progress_percent ?? 0,
                assigned_by: t.assigned_by || null,
                assignee_id: t.assignee_id || null,
                reviewer_id: t.reviewer_id || null,
                require_acknowledgement: t.require_acknowledgement ?? true,
                acknowledged_at: buildAckStamp(),
            });
            toast.success('Đã xác nhận nhận công việc.');
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xác nhận thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý công việc"
            description="Theo dõi công việc theo từng trạng thái, ưu tiên và hạn chót."
            stats={stats}
        >
            <div className="lg:col-span-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <div className="flex flex-wrap gap-2">
                        {canCreate && (
                            <button
                                type="button"
                                className="rounded-2xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                onClick={openCreate}
                            >
                                Thêm mới
                            </button>
                        )}
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.project_id}
                            onChange={(e) => setFilters((s) => ({ ...s, project_id: e.target.value }))}
                        >
                            <option value="">Tất cả dự án</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                        </select>
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.status}
                            onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        {[
                            { key: 'kanban', label: 'Bảng Kanban' },
                            { key: 'timeline', label: 'Dòng thời gian' },
                            { key: 'gantt', label: 'Biểu đồ Gantt' },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setViewMode(tab.key)}
                                className={`px-3 py-2 rounded-2xl text-xs font-semibold ${
                                    viewMode === tab.key
                                        ? 'bg-primary text-white'
                                        : 'bg-white border border-slate-200/80 text-slate-600'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <button className="text-sm text-primary font-semibold" onClick={() => fetchTasks(1, { ...filters, page: 1 })} type="button">
                            Tải lại
                        </button>
                    </div>
                </div>

                    {viewMode === 'kanban' && (
                        <div className="flex gap-4 overflow-x-auto pb-2">
                            {columns.map((col) => (
                                <div key={col.key} className="min-w-[280px] flex-1">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs uppercase tracking-widest text-text-subtle font-semibold">{col.title} ({col.items.length})</h4>
                                    </div>
                                    <div className="space-y-3">
                                        {col.items.map((t) => {
                                            const canAck = t.require_acknowledgement && !t.acknowledged_at && (
                                                t.assignee_id === props?.auth?.user?.id || ['admin', 'quan_ly'].includes(userRole)
                                            );
                                            return (
                                                <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                            {PRIORITY_LABELS[t.priority] || t.priority || 'Trung bình'}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-xs text-text-muted">
                                                            <button className="hover:text-slate-900" onClick={() => startEdit(t)} type="button">Sửa</button>
                                                            {canDelete && (
                                                                <button className="hover:text-danger" onClick={() => remove(t.id)} type="button">Xoá</button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <h3 className="mt-3 font-semibold text-slate-900">{t.title}</h3>
                                                    <p className="text-xs text-text-muted mt-1">{t.project?.name || 'Chưa gán dự án'}</p>
                                                    <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                                                        <span>{t.deadline ? `Hạn chót ${String(t.deadline).slice(0, 10)}` : 'Chưa có hạn chót'}</span>
                                                        <span>{t.progress_percent ?? 0}%</span>
                                                    </div>
                                                    {t.require_acknowledgement && !t.acknowledged_at && (
                                                        <div className="mt-3 flex items-center justify-between text-xs">
                                                            <span className="text-warning font-semibold">Chưa xác nhận</span>
                                                            {canAck && (
                                                                <button className="text-primary font-semibold" onClick={() => acknowledgeTask(t)} type="button">
                                                                    Xác nhận nhận công việc
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {viewMode === 'timeline' && (
                        <div className="space-y-4">
                            {sortedByDeadline.map((t) => (
                                <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <span className="h-3 w-3 rounded-full bg-primary" />
                                        <span className="flex-1 w-px bg-slate-200 mt-2" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-slate-900">{t.title}</h3>
                                            <span className="text-xs text-text-muted">{formatDate(t.deadline)}</span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-1">{t.project?.name || 'Chưa gán dự án'}</p>
                                        <div className="mt-2 text-xs text-text-muted">Trạng thái: {LABELS[t.status] || t.status}</div>
                                    </div>
                                </div>
                            ))}
                            {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
                            {!loading && sortedByDeadline.length === 0 && (
                                <p className="text-sm text-text-muted">Chưa có dữ liệu dòng thời gian.</p>
                            )}
                        </div>
                    )}

                    {viewMode === 'gantt' && (
                        <div className="space-y-3">
                            {sortedByDeadline.length === 0 && (
                                <p className="text-sm text-text-muted">Chưa có dữ liệu biểu đồ Gantt.</p>
                            )}
                            {sortedByDeadline.map((t) => {
                                const start = t.start_at ? new Date(t.start_at) : (t.deadline ? new Date(t.deadline) : new Date());
                                const end = t.deadline ? new Date(t.deadline) : new Date(start.getTime() + 3 * 86400000);
                                const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
                                return (
                                    <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                                        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                                            <span>{t.title}</span>
                                            <span>{formatDate(t.deadline) || 'Chưa có hạn chót'}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-2 bg-primary" style={{ width: `${Math.min(100, totalDays * 10)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa công việc #${editingId}` : 'Tạo công việc'}
                description="Nhập thông tin công việc và phân công."
                size="lg"
            >
                <div className="space-y-3 text-sm">
                    <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.project_id} onChange={(e) => setForm((s) => ({ ...s, project_id: e.target.value }))}>
                        <option value="">-- Chọn dự án * --</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                    {form.project_id && !projectHasContract && (
                        <p className="text-xs text-warning">Dự án chưa có hợp đồng, cần tạo hợp đồng trước khi tạo công việc.</p>
                    )}
                    <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" placeholder="Tiêu đề *" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
                    <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} placeholder="Mô tả" value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                            {DEFAULT_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                            {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.deadline} onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))} />
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="number" min="0" max="100" value={form.progress_percent} onChange={(e) => setForm((s) => ({ ...s, progress_percent: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex-1 bg-primary text-white rounded-2xl py-2.5 font-semibold" onClick={save} type="button">
                            {editingId ? 'Cập nhật công việc' : 'Tạo công việc'}
                        </button>
                        <button className="flex-1 border border-slate-200 rounded-2xl py-2.5 font-semibold" onClick={closeForm} type="button">
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
