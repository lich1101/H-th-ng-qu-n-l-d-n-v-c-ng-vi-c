import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const PROJECT_STATUSES = [
    { value: 'moi_tao', label: 'Mới tạo' },
    { value: 'dang_trien_khai', label: 'Đang triển khai' },
    { value: 'cho_duyet', label: 'Chờ duyệt' },
    { value: 'hoan_thanh', label: 'Hoàn thành' },
    { value: 'tam_dung', label: 'Tạm dừng' },
];

const SERVICE_TYPES = [
    { value: 'backlinks', label: 'Backlinks' },
    { value: 'viet_content', label: 'Viết content' },
    { value: 'audit_content', label: 'Audit content' },
    { value: 'cham_soc_website_tong_the', label: 'Chăm sóc website tổng thể' },
];

export default function ProjectsKanban(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'nhan_su_kinh_doanh', 'truong_phong_san_xuat'].includes(userRole);
    const canUpdate = ['admin', 'nhan_su_kinh_doanh', 'truong_phong_san_xuat'].includes(userRole);
    const canDelete = userRole === 'admin';

    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        service_type: '',
    });
    const [form, setForm] = useState({
        code: '',
        name: '',
        client_id: '',
        service_type: SERVICE_TYPES[0].value,
        start_date: '',
        deadline: '',
        budget: '',
        status: PROJECT_STATUSES[0].value,
        customer_requirement: '',
    });

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/projects', {
                params: {
                    per_page: 200,
                    ...(filters.search ? { search: filters.search } : {}),
                    ...(filters.status ? { status: filters.status } : {}),
                    ...(filters.service_type ? { service_type: filters.service_type } : {}),
                },
            });
            setProjects(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách dự án.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const columns = useMemo(() => {
        const buckets = {};
        for (const s of PROJECT_STATUSES) buckets[s.value] = [];
        for (const p of projects) {
            const key = p.status || 'moi_tao';
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(p);
        }
        return PROJECT_STATUSES.map((s) => ({
            key: s.value,
            title: s.label,
            items: buckets[s.value] || [],
        }));
    }, [projects]);

    const stats = useMemo(() => {
        const total = projects.length;
        const inProgress = projects.filter((p) => p.status === 'dang_trien_khai').length;
        const waiting = projects.filter((p) => p.status === 'cho_duyet').length;
        const risky = projects.filter((p) => {
            if (!p.deadline) return false;
            try {
                const d = new Date(p.deadline);
                const diffDays = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                return diffDays <= 3 && (p.status === 'dang_trien_khai' || p.status === 'cho_duyet');
            } catch {
                return false;
            }
        }).length;
        return [
            { label: 'Tổng dự án', value: String(total) },
            { label: 'Đang triển khai', value: String(inProgress) },
            { label: 'Chờ duyệt', value: String(waiting) },
            { label: 'Nguy cơ trễ', value: String(risky), note: risky ? 'Cần họp điều phối' : '' },
        ];
    }, [projects]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            code: '',
            name: '',
            client_id: '',
            service_type: SERVICE_TYPES[0].value,
            start_date: '',
            deadline: '',
            budget: '',
            status: PROJECT_STATUSES[0].value,
            customer_requirement: '',
        });
    };

    const startEdit = (p) => {
        setEditingId(p.id);
        setForm({
            code: p.code || '',
            name: p.name || '',
            client_id: p.client_id || '',
            service_type: p.service_type || SERVICE_TYPES[0].value,
            start_date: p.start_date || '',
            deadline: p.deadline || '',
            budget: p.budget ?? '',
            status: p.status || PROJECT_STATUSES[0].value,
            customer_requirement: p.customer_requirement || '',
        });
    };

    const save = async () => {
        if (!canCreate && editingId == null) {
            toast.error('Bạn không có quyền tạo dự án.');
            return;
        }
        if (!canUpdate && editingId != null) {
            toast.error('Bạn không có quyền cập nhật dự án.');
            return;
        }
        if (!form.code?.trim() || !form.name?.trim()) {
            toast.error('Vui lòng nhập Mã dự án và Tên dự án.');
            return;
        }
        try {
            const payload = {
                ...form,
                client_id: form.client_id ? Number(form.client_id) : null,
                budget: form.budget === '' ? null : Number(form.budget),
                start_date: form.start_date || null,
                deadline: form.deadline || null,
            };
            if (editingId) {
                await axios.put(`/api/v1/projects/${editingId}`, payload);
                toast.success('Đã cập nhật dự án.');
            } else {
                await axios.post('/api/v1/projects', payload);
                toast.success('Đã tạo dự án.');
            }
            resetForm();
            await fetchProjects();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu dự án thất bại.');
        }
    };

    const remove = async (id) => {
        if (!canDelete) {
            toast.error('Bạn không có quyền xóa dự án.');
            return;
        }
        if (!confirm('Xóa dự án này?')) return;
        try {
            await axios.delete(`/api/v1/projects/${id}`);
            toast.success('Đã xóa dự án.');
            await fetchProjects();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa dự án thất bại.');
        }
    };

    const quickMove = async (p, nextStatus) => {
        if (!canUpdate) return toast.error('Bạn không có quyền cập nhật dự án.');
        try {
            await axios.put(`/api/v1/projects/${p.id}`, {
                code: p.code,
                name: p.name,
                client_id: p.client_id,
                service_type: p.service_type,
                start_date: p.start_date,
                deadline: p.deadline,
                budget: p.budget,
                status: nextStatus,
                handover_status: p.handover_status,
                customer_requirement: p.customer_requirement,
                approved_by: p.approved_by,
                approved_at: p.approved_at,
            });
            toast.success('Đã cập nhật trạng thái.');
            await fetchProjects();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Cập nhật trạng thái thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý dự án"
            description="Theo dõi pipeline dự án theo trạng thái, loại dịch vụ và deadline tổng. (Admin có đầy đủ CRUD)"
            stats={stats}
        >
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">{editingId ? `Sửa dự án #${editingId}` : 'Tạo dự án'}</h3>
                        <button
                            className="text-xs text-slate-600 hover:text-slate-900"
                            onClick={resetForm}
                            type="button"
                        >
                            Reset
                        </button>
                    </div>
                    <div className="space-y-2 text-sm">
                        <input className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Mã dự án (code)*" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
                        <input className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Tên dự án*" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                        <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={form.service_type} onChange={(e) => setForm((s) => ({ ...s, service_type: e.target.value }))}>
                            {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                            {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                            <input className="w-full rounded-lg border border-slate-200 px-3 py-2" type="date" value={form.start_date} onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} />
                            <input className="w-full rounded-lg border border-slate-200 px-3 py-2" type="date" value={form.deadline} onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))} />
                        </div>
                        <input className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Ngân sách" value={form.budget} onChange={(e) => setForm((s) => ({ ...s, budget: e.target.value }))} />
                        <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2" rows={3} placeholder="Yêu cầu khách hàng" value={form.customer_requirement} onChange={(e) => setForm((s) => ({ ...s, customer_requirement: e.target.value }))} />
                        <button
                            className={`w-full rounded-lg px-3 py-2 font-semibold text-white ${editingId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-sky-600 hover:bg-sky-700'} disabled:opacity-50`}
                            onClick={save}
                            type="button"
                            disabled={loading}
                        >
                            {editingId ? 'Cập nhật' : 'Tạo dự án'}
                        </button>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="flex gap-2">
                            <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Tìm theo tên/mã..." value={filters.search} onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))} />
                            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="button" onClick={fetchProjects}>Lọc</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}>
                                <option value="">-- Trạng thái --</option>
                                {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.service_type} onChange={(e) => setFilters((s) => ({ ...s, service_type: e.target.value }))}>
                                <option value="">-- Dịch vụ --</option>
                                {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2">
                    {loading && <div className="text-sm text-slate-500 mb-2">Đang tải...</div>}
                    <div className="grid gap-4 xl:grid-cols-2">
                        {columns.map((col) => (
                            <div key={col.key} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                    <h3 className="font-semibold text-slate-900">{col.title}</h3>
                                    <span className="text-xs text-slate-500">{col.items.length}</span>
                                </div>
                                <div className="p-3 space-y-3">
                                    {col.items.map((p) => (
                                        <div key={p.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold">{p.name}</p>
                                                    <p className="text-xs text-slate-600 mt-1">Mã: {p.code} • Dịch vụ: {p.service_type}</p>
                                                    <p className="text-xs text-slate-500 mt-1">Deadline: {p.deadline || '—'}</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    {canUpdate && (
                                                        <button className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100" type="button" onClick={() => startEdit(p)}>
                                                            Sửa
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button className="text-xs px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" type="button" onClick={() => remove(p.id)}>
                                                            Xóa
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {canUpdate && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {PROJECT_STATUSES.filter((s) => s.value !== p.status).slice(0, 3).map((s) => (
                                                        <button
                                                            key={s.value}
                                                            className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100"
                                                            type="button"
                                                            onClick={() => quickMove(p, s.value)}
                                                        >
                                                            → {s.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {!col.items.length && (
                                        <div className="text-xs text-slate-500 p-3 border border-dashed border-slate-200 rounded-lg">
                                            Chưa có dự án.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
