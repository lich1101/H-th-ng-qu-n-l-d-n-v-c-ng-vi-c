import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

export default function Products(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canManage = ['admin', 'ke_toan'].includes(userRole);
    const canDelete = userRole === 'admin';

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [filters, setFilters] = useState({ search: '', is_active: '' });
    const [form, setForm] = useState({
        code: '',
        name: '',
        unit: '',
        unit_price: '',
        description: '',
        is_active: true,
    });

    const fetchProducts = async (nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/products', { params: { ...nextFilters, per_page: 200 } });
            setProducts(res.data?.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được sản phẩm.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const total = products.length;
        const active = products.filter((p) => p.is_active).length;
        return [
            { label: 'Tổng sản phẩm', value: String(total) },
            { label: 'Đang hoạt động', value: String(active) },
            { label: 'Ngưng', value: String(total - active) },
            { label: 'Vai trò', value: userRole || '—' },
        ];
    }, [products, userRole]);

    const resetForm = () => {
        setEditingId(null);
        setForm({ code: '', name: '', unit: '', unit_price: '', description: '', is_active: true });
    };

    const startEdit = (product) => {
        setEditingId(product.id);
        setForm({
            code: product.code || '',
            name: product.name || '',
            unit: product.unit || '',
            unit_price: product.unit_price ?? '',
            description: product.description || '',
            is_active: !!product.is_active,
        });
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

    const save = async () => {
        if (!canManage) return toast.error('Bạn không có quyền quản lý sản phẩm.');
        if (!form.name.trim()) return toast.error('Vui lòng nhập tên sản phẩm.');
        const payload = {
            code: form.code || null,
            name: form.name,
            unit: form.unit || null,
            unit_price: form.unit_price === '' ? null : Number(form.unit_price),
            description: form.description || null,
            is_active: !!form.is_active,
        };
        try {
            if (editingId) {
                await axios.put(`/api/v1/products/${editingId}`, payload);
                toast.success('Đã cập nhật sản phẩm.');
            } else {
                await axios.post('/api/v1/products', payload);
                toast.success('Đã tạo sản phẩm.');
            }
            closeForm();
            await fetchProducts();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu sản phẩm thất bại.');
        }
    };

    const remove = async (product) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa sản phẩm.');
        if (!confirm('Xóa sản phẩm này?')) return;
        try {
            await axios.delete(`/api/v1/products/${product.id}`);
            toast.success('Đã xóa sản phẩm.');
            await fetchProducts();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa sản phẩm thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Danh mục sản phẩm"
            description="Quản lý sản phẩm và đơn giá để gắn vào hợp đồng."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <div>
                        <h3 className="font-semibold">Danh sách sản phẩm</h3>
                        <p className="text-xs text-text-muted mt-1">Quản lý danh mục và đơn giá gắn hợp đồng.</p>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <button
                            type="button"
                            className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                            onClick={openCreate}
                        >
                            Thêm mới
                        </button>
                        <input
                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                            placeholder="Tìm theo tên hoặc mã"
                            value={filters.search}
                            onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
                        />
                        <select
                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.is_active}
                            onChange={(e) => setFilters((s) => ({ ...s, is_active: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="1">Đang hoạt động</option>
                            <option value="0">Ngưng</option>
                        </select>
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                            onClick={() => fetchProducts(filters)}
                        >
                            Lọc
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                <th className="py-2">Mã</th>
                                <th className="py-2">Tên sản phẩm</th>
                                <th className="py-2">Đơn vị</th>
                                <th className="py-2">Đơn giá</th>
                                <th className="py-2">Trạng thái</th>
                                <th className="py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((p) => (
                                <tr key={p.id} className="border-b border-slate-100">
                                    <td className="py-2 text-text-muted">{p.code || '—'}</td>
                                    <td className="py-2 font-medium text-slate-900">{p.name}</td>
                                    <td className="py-2 text-text-muted">{p.unit || '—'}</td>
                                    <td className="py-2 text-slate-700">
                                        {p.unit_price ? Number(p.unit_price).toLocaleString('vi-VN') : '—'}
                                    </td>
                                    <td className="py-2">
                                        <span
                                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                                p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                            }`}
                                        >
                                            {p.is_active ? 'Hoạt động' : 'Ngưng'}
                                        </span>
                                    </td>
                                    <td className="py-2 text-right space-x-2">
                                        {canManage && (
                                            <button
                                                type="button"
                                                className="text-xs font-semibold text-primary"
                                                onClick={() => startEdit(p)}
                                            >
                                                Sửa
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button
                                                type="button"
                                                className="text-xs font-semibold text-rose-500"
                                                onClick={() => remove(p)}
                                            >
                                                Xóa
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {products.length === 0 && !loading && (
                                <tr>
                                    <td className="py-6 text-center text-sm text-text-muted" colSpan={6}>
                                        Chưa có sản phẩm nào.
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
                title={editingId ? `Sửa sản phẩm #${editingId}` : 'Tạo sản phẩm'}
                description="Cập nhật mã, tên, đơn giá và trạng thái sản phẩm."
                size="lg"
            >
                <div className="space-y-3 text-sm">
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Mã sản phẩm"
                        value={form.code}
                        onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
                    />
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Tên sản phẩm *"
                        value={form.name}
                        onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Đơn vị"
                            value={form.unit}
                            onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
                        />
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Đơn giá"
                            type="number"
                            value={form.unit_price}
                            onChange={(e) => setForm((s) => ({ ...s, unit_price: e.target.value }))}
                        />
                    </div>
                    <textarea
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        rows={3}
                        placeholder="Mô tả"
                        value={form.description}
                        onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    />
                    <label className="flex items-center gap-2 text-xs text-text-muted">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
                        />
                        Đang hoạt động
                    </label>
                    {!canManage && (
                        <p className="text-xs text-text-muted">
                            Chỉ Admin/Kế toán có thể chỉnh sửa sản phẩm.
                        </p>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={save}
                        >
                            {editingId ? 'Cập nhật sản phẩm' : 'Tạo sản phẩm'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={closeForm}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
