import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const TASK_PRIORITIES = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
];

const TASK_STATUSES = [
    { value: 'nhan_task', label: 'Nhận task' },
    { value: 'dang_trien_khai', label: 'Đang triển khai' },
    { value: 'done', label: 'Done' },
    { value: 'hen_meet_ban_giao', label: 'Hẹn meet bàn giao' },
    { value: 'hoan_tat_ban_giao', label: 'Hoàn tất bàn giao' },
];

export default function TasksBoard(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'truong_phong_san_xuat'].includes(userRole);
    const canUpdate = ['admin', 'truong_phong_san_xuat', 'nhan_su_san_xuat'].includes(userRole);
    const canDelete = ['admin', 'truong_phong_san_xuat'].includes(userRole);

    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [filters, setFilters] = useState({
        project_id: '',
        status: '',
        per_page: 15,
        page: 1,
    });
    const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });

    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        project_id: '',
        title: '',
        description: '',
        priority: 'medium',
        status: 'nhan_task',
        deadline: '',
        progress_percent: 0,
        assignee_id: '',
    });

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
            setMeta({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((s) => ({ ...s, page: res.data?.current_page || 1 }));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách task.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
        fetchTasks(1, { ...filters, page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const open = meta.total;
        const overdue = tasks.filter((t) => {
            if (!t.deadline) return false;
            try { return new Date(t.deadline).getTime() < Date.now() && t.status !== 'hoan_tat_ban_giao'; } catch { return false; }
        }).length;
        const done = tasks.filter((t) => t.status === 'hoan_tat_ban_giao' || t.status === 'done').length;
        return [
            { label: 'Task (trang hiện tại)', value: String(tasks.length) },
            { label: 'Tổng theo filter', value: String(open) },
            { label: 'Overdue (trang)', value: String(overdue) },
            { label: 'Done (trang)', value: String(done) },
        ];
    }, [tasks, meta.total]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            project_id: '',
            title: '',
            description: '',
            priority: 'medium',
            status: 'nhan_task',
            deadline: '',
            progress_percent: 0,
            assignee_id: '',
        });
    };

    const startEdit = (t) => {
        setEditingId(t.id);
        setForm({
            project_id: t.project_id || '',
            title: t.title || '',
            description: t.description || '',
            priority: t.priority || 'medium',
            status: t.status || 'nhan_task',
            deadline: t.deadline ? String(t.deadline).slice(0, 10) : '',
            progress_percent: t.progress_percent ?? 0,
            assignee_id: t.assignee_id || '',
        });
    };

    const save = async () => {
        if (!canCreate && editingId == null) return toast.error('Bạn không có quyền tạo task.');
        if (!canUpdate && editingId != null) return toast.error('Bạn không có quyền cập nhật task.');
        if (!form.project_id || !form.title?.trim()) return toast.error('Vui lòng chọn dự án và nhập tiêu đề.');
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
                toast.success('Đã cập nhật task.');
            } else {
                await axios.post('/api/v1/tasks', payload);
                toast.success('Đã tạo task.');
            }
            resetForm();
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu task thất bại.');
        }
    };

    const remove = async (id) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa task.');
        if (!confirm('Xóa task này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${id}`);
            toast.success('Đã xóa task.');
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa task thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý công việc"
            description="Admin/Trưởng phòng có CRUD đầy đủ; nhân sự sản xuất được cập nhật theo quyền API."
            stats={stats}
        >
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">{editingId ? `Sửa task #${editingId}` : 'Tạo task'}</h3>
                        <button className="text-xs text-slate-600 hover:text-slate-900" onClick={resetForm} type="button">Reset</button>
                    </div>
                    <div className="space-y-2 text-sm">
                        <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={form.project_id} onChange={(e) => setForm((s) => ({ ...s, project_id: e.target.value }))}>
                            <option value="">-- Chọn dự án * --</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                        </select>
                        <input className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Tiêu đề *" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
                        <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2" rows={3} placeholder="Mô tả" value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
                        <div className="grid grid-cols-2 gap-2">
                            <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                                {TASK_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                            <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                                {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input className="w-full rounded-lg border border-slate-200 px-3 py-2" type="date" value={form.deadline} onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))} />
                            <input className="w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min="0" max="100" value={form.progress_percent} onChange={(e) => setForm((s) => ({ ...s, progress_percent: e.target.value }))} />
                        </div>
                        <input className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Assignee ID (tạm thời)" value={form.assignee_id} onChange={(e) => setForm((s) => ({ ...s, assignee_id: e.target.value }))} />
                        <button className="w-full rounded-lg px-3 py-2 font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50" onClick={save} type="button" disabled={loading}>
                            {editingId ? 'Cập nhật task' : 'Tạo task'}
                        </button>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                        <div className="text-xs text-slate-500">Bộ lọc</div>
                        <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.project_id} onChange={(e) => setFilters((s) => ({ ...s, project_id: e.target.value }))}>
                            <option value="">-- Tất cả dự án --</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                        </select>
                        <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}>
                            <option value="">-- Tất cả trạng thái --</option>
                            {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <button className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="button" onClick={() => fetchTasks(1, { ...filters, page: 1 })}>Áp dụng lọc</button>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="font-semibold">Danh sách task</h3>
                        <div className="text-xs text-slate-500">
                            Trang {meta.current_page}/{meta.last_page} • Tổng {meta.total}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600">
                                <tr>
                                    <th className="text-left px-4 py-3">Tên task</th>
                                    <th className="text-left px-4 py-3">Ưu tiên</th>
                                    <th className="text-left px-4 py-3">Deadline</th>
                                    <th className="text-left px-4 py-3">Dự án</th>
                                    <th className="text-left px-4 py-3">Trạng thái</th>
                                    <th className="text-left px-4 py-3">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.map((t) => (
                                    <tr key={t.id} className="border-t border-slate-100">
                                        <td className="px-4 py-3 font-medium">{t.title}</td>
                                        <td className="px-4 py-3">{t.priority}</td>
                                        <td className="px-4 py-3">{t.deadline || '—'}</td>
                                        <td className="px-4 py-3">{t.project?.code || ''}</td>
                                        <td className="px-4 py-3">{t.status}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                {canUpdate && (
                                                    <button className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100" type="button" onClick={() => startEdit(t)}>
                                                        Sửa
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button className="text-xs px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" type="button" onClick={() => remove(t.id)}>
                                                        Xóa
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {!tasks.length && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                                            Không có task nào.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 flex items-center justify-between">
                        <button
                            className="text-sm px-3 py-2 rounded border border-slate-200 disabled:opacity-50"
                            type="button"
                            onClick={() => fetchTasks(Math.max(1, meta.current_page - 1), filters)}
                            disabled={meta.current_page <= 1}
                        >
                            ← Trước
                        </button>
                        <button
                            className="text-sm px-3 py-2 rounded border border-slate-200 disabled:opacity-50"
                            type="button"
                            onClick={() => fetchTasks(Math.min(meta.last_page, meta.current_page + 1), filters)}
                            disabled={meta.current_page >= meta.last_page}
                        >
                            Sau →
                        </button>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
