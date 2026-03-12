import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const DEFAULT_STATUSES = [
    { value: 'moi_tao', label: 'Mới tạo' },
    { value: 'dang_trien_khai', label: 'Đang triển khai' },
    { value: 'cho_duyet', label: 'Chờ duyệt' },
    { value: 'hoan_thanh', label: 'Hoàn thành' },
    { value: 'tam_dung', label: 'Tạm dừng' },
];

const DEFAULT_SERVICES = [
    { value: 'backlinks', label: 'Liên kết trỏ về' },
    { value: 'viet_content', label: 'Viết nội dung' },
    { value: 'audit_content', label: 'Rà soát nội dung' },
    { value: 'cham_soc_website_tong_the', label: 'Chăm sóc trang web tổng thể' },
];

const LABELS = {
    moi_tao: 'Mới tạo',
    dang_trien_khai: 'Đang triển khai',
    cho_duyet: 'Chờ duyệt',
    hoan_thanh: 'Hoàn thành',
    tam_dung: 'Tạm dừng',
    backlinks: 'Liên kết trỏ về',
    viet_content: 'Viết nội dung',
    audit_content: 'Rà soát nội dung',
    cham_soc_website_tong_the: 'Chăm sóc trang web tổng thể',
};

export default function ProjectsKanban(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'quan_ly'].includes(userRole);
    const canUpdate = ['admin', 'quan_ly'].includes(userRole);
    const canDelete = userRole === 'admin';

    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState([]);
    const [contracts, setContracts] = useState([]);
    const [meta, setMeta] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [viewMode, setViewMode] = useState('kanban');
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        service_type: '',
    });
    const [form, setForm] = useState({
        code: '',
        name: '',
        client_id: '',
        contract_id: '',
        service_type: DEFAULT_SERVICES[0].value,
        start_date: '',
        deadline: '',
        budget: '',
        status: DEFAULT_STATUSES[0].value,
        customer_requirement: '',
    });

    const statusOptions = useMemo(() => {
        const values = meta.project_statuses || [];
        if (!values.length) return DEFAULT_STATUSES;
        return values.map((value) => ({ value, label: LABELS[value] || value }));
    }, [meta]);

    const serviceOptions = useMemo(() => {
        const values = meta.service_types || [];
        if (!values.length) return DEFAULT_SERVICES;
        return values.map((value) => ({ value, label: LABELS[value] || value }));
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

    const fetchContracts = async () => {
        try {
            const res = await axios.get('/api/v1/contracts', { params: { per_page: 200 } });
            setContracts(res.data?.data || []);
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        fetchMeta();
        fetchProjects();
        fetchContracts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (serviceOptions.length && !form.service_type) {
            setForm((s) => ({ ...s, service_type: serviceOptions[0].value }));
        }
        if (statusOptions.length && !form.status) {
            setForm((s) => ({ ...s, status: statusOptions[0].value }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceOptions.length, statusOptions.length]);

    const columns = useMemo(() => {
        const buckets = {};
        for (const s of statusOptions) buckets[s.value] = [];
        for (const p of projects) {
            const key = p.status || statusOptions[0]?.value || 'moi_tao';
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(p);
        }
        return statusOptions.map((s) => ({
            key: s.value,
            title: s.label,
            items: buckets[s.value] || [],
        }));
    }, [projects, statusOptions]);

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
        [...projects].sort((a, b) => {
            const da = a.deadline ? new Date(a.deadline).getTime() : 0;
            const db = b.deadline ? new Date(b.deadline).getTime() : 0;
            return da - db;
        })
    ), [projects]);

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
            contract_id: '',
            service_type: serviceOptions[0]?.value || DEFAULT_SERVICES[0].value,
            start_date: '',
            deadline: '',
            budget: '',
            status: statusOptions[0]?.value || DEFAULT_STATUSES[0].value,
            customer_requirement: '',
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

    const startEdit = (p) => {
        setEditingId(p.id);
        setForm({
            code: p.code || '',
            name: p.name || '',
            client_id: p.client_id || '',
            contract_id: p.contract_id || '',
            service_type: p.service_type || serviceOptions[0]?.value || DEFAULT_SERVICES[0].value,
            start_date: p.start_date || '',
            deadline: p.deadline || '',
            budget: p.budget ?? '',
            status: p.status || statusOptions[0]?.value || DEFAULT_STATUSES[0].value,
            customer_requirement: p.customer_requirement || '',
        });
        setShowForm(true);
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
                contract_id: form.contract_id ? Number(form.contract_id) : null,
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
            closeForm();
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
                contract_id: p.contract_id,
                service_type: p.service_type,
                start_date: p.start_date,
                deadline: p.deadline,
                budget: p.budget,
                status: nextStatus,
                customer_requirement: p.customer_requirement,
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
            description="Theo dõi toàn bộ dự án theo trạng thái và phân bổ theo dịch vụ."
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
                        <input
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            placeholder="Tìm theo mã/tên"
                            value={filters.search}
                            onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
                        />
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.status}
                            onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.service_type}
                            onChange={(e) => setFilters((s) => ({ ...s, service_type: e.target.value }))}
                        >
                            <option value="">Tất cả dịch vụ</option>
                            {serviceOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
                            <button className="text-sm text-primary font-semibold" onClick={fetchProjects} type="button">
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
                                        {col.items.map((p) => (
                                            <div key={p.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                        {LABELS[p.service_type] || p.service_type}
                                                    </span>
                                                    <div className="flex items-center gap-2 text-xs text-text-muted">
                                                        <button className="hover:text-slate-900" onClick={() => startEdit(p)} type="button">Sửa</button>
                                                        {canDelete && (
                                                            <button className="hover:text-danger" onClick={() => remove(p.id)} type="button">Xoá</button>
                                                        )}
                                                    </div>
                                                </div>
                                                <h3 className="mt-3 font-semibold text-slate-900">{p.name}</h3>
                                                <p className="text-xs text-text-muted mt-1">{p.code} • {p.deadline ? `Hạn chót ${String(p.deadline).slice(0, 10)}` : 'Chưa có hạn chót'}</p>
                                                <p className={`text-xs mt-1 ${p.contract ? 'text-text-muted' : 'text-warning'}`}>
                                                    Hợp đồng: {p.contract?.code || 'Chưa có hợp đồng'}
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {statusOptions.map((s) => (
                                                        <button
                                                            key={s.value}
                                                            className={`text-xs px-2 py-1 rounded-full border ${p.status === s.value ? 'border-primary text-primary' : 'border-slate-200/80 text-text-muted'}`}
                                                            onClick={() => quickMove(p, s.value)}
                                                            type="button"
                                                        >
                                                            {s.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {viewMode === 'timeline' && (
                        <div className="space-y-4">
                            {sortedByDeadline.map((p) => (
                                <div key={p.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <span className="h-3 w-3 rounded-full bg-primary" />
                                        <span className="flex-1 w-px bg-slate-200 mt-2" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-slate-900">{p.name}</h3>
                                            <span className="text-xs text-text-muted">{formatDate(p.deadline)}</span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-1">{p.code} • {LABELS[p.service_type] || p.service_type}</p>
                                        <p className={`text-xs mt-1 ${p.contract ? 'text-text-muted' : 'text-warning'}`}>
                                            Hợp đồng: {p.contract?.code || 'Chưa có hợp đồng'}
                                        </p>
                                        <div className="mt-2 text-xs text-text-muted">Trạng thái: {LABELS[p.status] || p.status}</div>
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
                            {sortedByDeadline.map((p) => {
                                const start = p.start_date ? new Date(p.start_date) : (p.deadline ? new Date(p.deadline) : new Date());
                                const end = p.deadline ? new Date(p.deadline) : new Date(start.getTime() + 5 * 86400000);
                                const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
                                return (
                                    <div key={p.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                                    <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                                        <span>{p.name}</span>
                                        <span>{formatDate(p.deadline) || 'Chưa có hạn chót'}</span>
                                    </div>
                                    <div className={`text-xs mb-2 ${p.contract ? 'text-text-muted' : 'text-warning'}`}>
                                        Hợp đồng: {p.contract?.code || 'Chưa có hợp đồng'}
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-2 bg-primary" style={{ width: `${Math.min(100, totalDays * 8)}%` }} />
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
                title={editingId ? `Sửa dự án #${editingId}` : 'Tạo dự án'}
                description="Nhập thông tin dự án và gắn hợp đồng."
                size="lg"
            >
                <div className="space-y-3 text-sm">
                    <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" placeholder="Mã dự án *" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
                    <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" placeholder="Tên dự án *" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                    <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.service_type} onChange={(e) => setForm((s) => ({ ...s, service_type: e.target.value }))}>
                        {serviceOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.contract_id}
                        onChange={(e) => setForm((s) => ({ ...s, contract_id: e.target.value }))}
                    >
                        <option value="">Chọn hợp đồng (bắt buộc để tạo công việc)</option>
                        {contracts.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.code} • {c.title}
                            </option>
                        ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.start_date} onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} />
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.deadline} onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))} />
                    </div>
                    <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                        {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} placeholder="Yêu cầu khách hàng" value={form.customer_requirement} onChange={(e) => setForm((s) => ({ ...s, customer_requirement: e.target.value }))} />
                    <div className="flex items-center gap-3">
                        <button className="flex-1 bg-primary text-white rounded-2xl py-2.5 font-semibold" onClick={save} type="button">
                            {editingId ? 'Cập nhật dự án' : 'Tạo dự án'}
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
