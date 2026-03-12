import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Nháp' },
    { value: 'signed', label: 'Đã ký' },
    { value: 'success', label: 'Thành công' },
    { value: 'active', label: 'Đang hiệu lực' },
    { value: 'expired', label: 'Hết hạn' },
    { value: 'cancelled', label: 'Hủy' },
];

const APPROVAL_LABELS = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
};

const approvalLabel = (value) => APPROVAL_LABELS[value] || APPROVAL_LABELS.pending;

export default function Contracts(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canManage = ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'].includes(userRole);
    const canDelete = userRole === 'admin';
    const canApprove = ['admin', 'ke_toan'].includes(userRole);

    const [contracts, setContracts] = useState([]);
    const [clients, setClients] = useState([]);
    const [projects, setProjects] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [filters, setFilters] = useState({ search: '', status: '', client_id: '', approval_status: '' });
    const [form, setForm] = useState({
        code: '',
        title: '',
        client_id: '',
        project_id: '',
        value: '',
        status: 'draft',
        signed_at: '',
        start_date: '',
        end_date: '',
        notes: '',
    });
    const [items, setItems] = useState([]);

    const fetchClients = async () => {
        try {
            const res = await axios.get('/api/v1/crm/clients', { params: { per_page: 200 } });
            setClients(res.data?.data || []);
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

    const fetchProducts = async () => {
        try {
            const res = await axios.get('/api/v1/products', { params: { per_page: 200 } });
            setProducts(res.data?.data || []);
        } catch {
            // ignore
        }
    };

    const fetchContracts = async (nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/contracts', {
                params: {
                    per_page: 50,
                    with_items: true,
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.client_id ? { client_id: nextFilters.client_id } : {}),
                    ...(nextFilters.approval_status ? { approval_status: nextFilters.approval_status } : {}),
                },
            });
            setContracts(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách hợp đồng.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
        fetchProjects();
        fetchProducts();
        fetchContracts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const total = contracts.length;
        const active = contracts.filter((c) => c.status === 'active').length;
        const signed = contracts.filter((c) => c.status === 'signed').length;
        const pendingApproval = contracts.filter((c) => c.approval_status === 'pending').length;
        return [
            { label: 'Tổng hợp đồng', value: String(total) },
            { label: 'Đang hiệu lực', value: String(active) },
            { label: 'Đã ký', value: String(signed) },
            { label: 'Chờ duyệt', value: String(pendingApproval) },
        ];
    }, [contracts]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            code: '',
            title: '',
            client_id: '',
            project_id: '',
            value: '',
            status: 'draft',
            signed_at: '',
            start_date: '',
            end_date: '',
            notes: '',
        });
        setItems([]);
    };

    const startEdit = (c) => {
        setEditingId(c.id);
        setForm({
            code: c.code || '',
            title: c.title || '',
            client_id: c.client_id || '',
            project_id: c.project_id || '',
            value: c.value ?? '',
            status: c.status || 'draft',
            signed_at: c.signed_at ? String(c.signed_at).slice(0, 10) : '',
            start_date: c.start_date ? String(c.start_date).slice(0, 10) : '',
            end_date: c.end_date ? String(c.end_date).slice(0, 10) : '',
            notes: c.notes || '',
        });
        setItems(
            (c.items || []).map((item) => ({
                product_id: item.product_id || '',
                product_name: item.product_name || '',
                unit: item.unit || '',
                unit_price: item.unit_price ?? '',
                quantity: item.quantity ?? 1,
                note: item.note || '',
            }))
        );
        setShowForm(true);
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const addItem = () => {
        setItems((prev) => [
            ...prev,
            { product_id: '', product_name: '', unit: '', unit_price: '', quantity: 1, note: '' },
        ]);
    };

    const updateItem = (index, changes) => {
        setItems((prev) =>
            prev.map((item, idx) => {
                if (idx !== index) return item;
                return { ...item, ...changes };
            })
        );
    };

    const removeItem = (index) => {
        setItems((prev) => prev.filter((_, idx) => idx !== index));
    };

    const itemsTotal = useMemo(() => {
        return items.reduce((sum, item) => {
            const price = Number(item.unit_price || 0);
            const qty = Number(item.quantity || 1);
            return sum + price * qty;
        }, 0);
    }, [items]);

    const save = async () => {
        if (!canManage) return toast.error('Bạn không có quyền quản lý hợp đồng.');
        if (!form.title?.trim() || !form.client_id) {
            return toast.error('Vui lòng chọn khách hàng và nhập tiêu đề hợp đồng.');
        }
        const payload = {
            code: form.code || null,
            title: form.title,
            client_id: Number(form.client_id),
            project_id: form.project_id ? Number(form.project_id) : null,
            value: items.length ? itemsTotal : form.value === '' ? null : Number(form.value),
            status: form.status,
            signed_at: form.signed_at || null,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            notes: form.notes || null,
            items: items.map((item) => ({
                product_id: item.product_id ? Number(item.product_id) : null,
                product_name: item.product_name || null,
                unit: item.unit || null,
                unit_price: item.unit_price === '' ? 0 : Number(item.unit_price),
                quantity: item.quantity === '' ? 1 : Number(item.quantity),
                note: item.note || null,
            })),
        };
        try {
            if (editingId) {
                await axios.put(`/api/v1/contracts/${editingId}`, payload);
                toast.success('Đã cập nhật hợp đồng.');
            } else {
                await axios.post('/api/v1/contracts', payload);
                toast.success('Đã tạo hợp đồng.');
            }
            closeForm();
            await fetchContracts();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu hợp đồng thất bại.');
        }
    };

    const remove = async (id) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa hợp đồng.');
        if (!confirm('Xóa hợp đồng này?')) return;
        try {
            await axios.delete(`/api/v1/contracts/${id}`);
            toast.success('Đã xóa hợp đồng.');
            await fetchContracts();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa hợp đồng thất bại.');
        }
    };

    const approve = async (contract) => {
        if (!canApprove) return toast.error('Bạn không có quyền duyệt.');
        try {
            await axios.post(`/api/v1/contracts/${contract.id}/approve`, {});
            toast.success('Đã duyệt hợp đồng.');
            await fetchContracts(filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Duyệt hợp đồng thất bại.');
        }
    };

    const applyFilters = () => fetchContracts(filters);

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý hợp đồng"
            description="Theo dõi hợp đồng, duyệt kế toán và quản lý sản phẩm kèm theo."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <h3 className="font-semibold">Danh sách hợp đồng</h3>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        {canManage && (
                            <button
                                type="button"
                                className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                onClick={openCreate}
                            >
                                Thêm mới
                            </button>
                        )}
                        <input className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm" placeholder="Tìm theo mã/tiêu đề" value={filters.search} onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))} />
                        <select className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm" value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}>
                            <option value="">Tất cả trạng thái</option>
                            {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <select className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm" value={filters.approval_status} onChange={(e) => setFilters((s) => ({ ...s, approval_status: e.target.value }))}>
                            <option value="">Tất cả duyệt</option>
                            <option value="pending">Chờ duyệt</option>
                            <option value="approved">Đã duyệt</option>
                            <option value="rejected">Từ chối</option>
                        </select>
                        <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" onClick={applyFilters}>Lọc</button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                    <th className="py-2">Hợp đồng</th>
                                    <th className="py-2">Khách hàng</th>
                                    <th className="py-2">Giá trị</th>
                                    <th className="py-2">Trạng thái</th>
                                    <th className="py-2">Duyệt</th>
                                    <th className="py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {contracts.map((c) => (
                                    <tr key={c.id} className="border-b border-slate-100">
                                        <td className="py-2">
                                            <div className="font-medium text-slate-900">{c.code || `CTR-${c.id}`}</div>
                                            <div className="text-xs text-text-muted">{c.title}</div>
                                        </td>
                                        <td className="py-2 text-slate-700">{c.client?.name || '—'}</td>
                                        <td className="py-2 text-slate-700">{Number(c.value || 0).toLocaleString('vi-VN')}</td>
                                        <td className="py-2">
                                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                                {STATUS_OPTIONS.find((s) => s.value === c.status)?.label || c.status}
                                            </span>
                                        </td>
                                        <td className="py-2">
                                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${c.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {approvalLabel(c.approval_status)}
                                            </span>
                                        </td>
                                        <td className="py-2 text-right space-x-2">
                                            {canManage && (
                                                <button type="button" className="text-xs font-semibold text-primary" onClick={() => startEdit(c)}>Sửa</button>
                                            )}
                                            {canApprove && c.approval_status !== 'approved' && (
                                                <button type="button" className="text-xs font-semibold text-emerald-600" onClick={() => approve(c)}>Duyệt</button>
                                            )}
                                            {canDelete && (
                                                <button type="button" className="text-xs font-semibold text-rose-500" onClick={() => remove(c.id)}>Xóa</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {contracts.length === 0 && (
                                    <tr>
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={6}>
                                            Chưa có hợp đồng nào.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa hợp đồng #${editingId}` : 'Tạo hợp đồng'}
                description="Thiết lập thông tin hợp đồng và danh sách sản phẩm."
                size="xl"
            >
                <div className="space-y-3 text-sm">
                    <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" placeholder="Mã hợp đồng (tự sinh nếu để trống)" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
                    <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" placeholder="Tiêu đề hợp đồng *" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
                    <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.client_id} onChange={(e) => setForm((s) => ({ ...s, client_id: e.target.value }))}>
                        <option value="">Chọn khách hàng *</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>)}
                    </select>
                    <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.project_id} onChange={(e) => setForm((s) => ({ ...s, project_id: e.target.value }))}>
                        <option value="">Liên kết dự án (tuỳ chọn)</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="number" placeholder="Giá trị (VNĐ)" value={items.length ? itemsTotal : form.value} onChange={(e) => setForm((s) => ({ ...s, value: e.target.value }))} disabled={items.length > 0} />
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                            {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.signed_at} onChange={(e) => setForm((s) => ({ ...s, signed_at: e.target.value }))} />
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.start_date} onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} />
                    </div>
                    <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.end_date} onChange={(e) => setForm((s) => ({ ...s, end_date: e.target.value }))} />
                    <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} placeholder="Ghi chú" value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold">Sản phẩm trong hợp đồng</h4>
                            <button type="button" className="text-xs text-primary" onClick={addItem}>+ Thêm sản phẩm</button>
                        </div>
                        <div className="space-y-2">
                            {items.map((item, index) => (
                                <div key={index} className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold text-slate-600">Sản phẩm #{index + 1}</p>
                                        <button type="button" className="text-xs text-rose-500" onClick={() => removeItem(index)}>Xóa</button>
                                    </div>
                                    <select
                                        className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                        value={item.product_id}
                                        onChange={(e) => {
                                            const selected = products.find((p) => String(p.id) === e.target.value);
                                            updateItem(index, {
                                                product_id: e.target.value,
                                                product_name: selected?.name || item.product_name,
                                                unit: selected?.unit || item.unit,
                                                unit_price: selected?.unit_price ?? item.unit_price,
                                            });
                                        }}
                                    >
                                        <option value="">Chọn sản phẩm</option>
                                        {products.map((product) => (
                                            <option key={product.id} value={product.id}>
                                                {product.name}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="grid grid-cols-3 gap-2">
                                        <input
                                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                            placeholder="Đơn vị"
                                            value={item.unit || ''}
                                            onChange={(e) => updateItem(index, { unit: e.target.value })}
                                        />
                                        <input
                                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                            placeholder="Đơn giá"
                                            type="number"
                                            value={item.unit_price}
                                            onChange={(e) => updateItem(index, { unit_price: e.target.value })}
                                        />
                                        <input
                                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                            placeholder="Số lượng"
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(index, { quantity: e.target.value })}
                                        />
                                    </div>
                                    <input
                                        className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                        placeholder="Ghi chú sản phẩm"
                                        value={item.note || ''}
                                        onChange={(e) => updateItem(index, { note: e.target.value })}
                                    />
                                </div>
                            ))}
                            {items.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200/80 px-3 py-3 text-xs text-text-muted text-center">
                                    Chưa có sản phẩm. Thêm để tự tính giá trị hợp đồng.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button type="button" className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold" onClick={save}>
                            {editingId ? 'Cập nhật hợp đồng' : 'Tạo hợp đồng'}
                        </button>
                        <button type="button" className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold" onClick={closeForm}>
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
