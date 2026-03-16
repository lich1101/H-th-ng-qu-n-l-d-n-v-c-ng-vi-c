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

    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [filters, setFilters] = useState({ search: '', is_active: '', category_id: '' });
    const [form, setForm] = useState({
        code: '',
        name: '',
        category_id: '',
        unit: '',
        unit_price: '',
        description: '',
        is_active: true,
    });
    const [categoryFilters, setCategoryFilters] = useState({ search: '', is_active: '' });
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [categoryForm, setCategoryForm] = useState({
        code: '',
        name: '',
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

    const fetchCategories = async (nextFilters = categoryFilters) => {
        try {
            const res = await axios.get('/api/v1/product-categories', { params: { ...nextFilters, per_page: 200 } });
            setCategories(res.data?.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được danh mục sản phẩm.');
        }
    };

    useEffect(() => {
        fetchProducts();
        fetchCategories();
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
        setForm({ code: '', name: '', category_id: '', unit: '', unit_price: '', description: '', is_active: true });
    };

    const startEdit = (product) => {
        setEditingId(product.id);
        setForm({
            code: product.code || '',
            name: product.name || '',
            category_id: product.category_id ? String(product.category_id) : '',
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
            category_id: form.category_id ? Number(form.category_id) : null,
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

    const resetCategoryForm = () => {
        setEditingCategoryId(null);
        setCategoryForm({ code: '', name: '', description: '', is_active: true });
    };

    const openCategoryCreate = () => {
        resetCategoryForm();
        setShowCategoryForm(true);
    };

    const startEditCategory = (category) => {
        setEditingCategoryId(category.id);
        setCategoryForm({
            code: category.code || '',
            name: category.name || '',
            description: category.description || '',
            is_active: !!category.is_active,
        });
        setShowCategoryForm(true);
    };

    const closeCategoryForm = () => {
        setShowCategoryForm(false);
        resetCategoryForm();
    };

    const saveCategory = async () => {
        if (!canManage) return toast.error('Bạn không có quyền quản lý danh mục.');
        if (!categoryForm.name.trim()) return toast.error('Vui lòng nhập tên danh mục.');
        const payload = {
            code: categoryForm.code || null,
            name: categoryForm.name,
            description: categoryForm.description || null,
            is_active: !!categoryForm.is_active,
        };
        try {
            if (editingCategoryId) {
                await axios.put(`/api/v1/product-categories/${editingCategoryId}`, payload);
                toast.success('Đã cập nhật danh mục.');
            } else {
                await axios.post('/api/v1/product-categories', payload);
                toast.success('Đã tạo danh mục.');
            }
            closeCategoryForm();
            await fetchCategories();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu danh mục thất bại.');
        }
    };

    const removeCategory = async (category) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa danh mục.');
        if (!confirm('Xóa danh mục này?')) return;
        try {
            await axios.delete(`/api/v1/product-categories/${category.id}`);
            toast.success('Đã xóa danh mục.');
            await fetchCategories();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa danh mục thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Danh mục sản phẩm"
            description="Quản lý sản phẩm và đơn giá để gắn vào hợp đồng."
            stats={stats}
        >
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="font-semibold">Danh mục sản phẩm</h3>
                            <p className="text-xs text-text-muted mt-1">Quản lý nhóm sản phẩm để lọc nhanh.</p>
                        </div>
                        {canManage && (
                            <button
                                type="button"
                                className="rounded-xl bg-primary text-white px-3 py-2 text-xs font-semibold"
                                onClick={openCategoryCreate}
                            >
                                Thêm danh mục
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                        <input
                            className="flex-1 rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                            placeholder="Tìm danh mục"
                            value={categoryFilters.search}
                            onChange={(e) => setCategoryFilters((s) => ({ ...s, search: e.target.value }))}
                        />
                        <select
                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={categoryFilters.is_active}
                            onChange={(e) => setCategoryFilters((s) => ({ ...s, is_active: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="1">Đang hoạt động</option>
                            <option value="0">Ngưng</option>
                        </select>
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                            onClick={() => fetchCategories(categoryFilters)}
                        >
                            Lọc
                        </button>
                    </div>
                    <div className="space-y-3">
                        {categories.map((c) => (
                            <div key={c.id} className="rounded-2xl border border-slate-200/80 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-900">{c.name}</p>
                                        <p className="text-xs text-text-muted">Mã: {c.code || '—'}</p>
                                    </div>
                                    <span
                                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                                            c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {c.is_active ? 'Hoạt động' : 'Ngưng'}
                                    </span>
                                </div>
                                {c.description && (
                                    <p className="text-xs text-text-muted mt-2">{c.description}</p>
                                )}
                                <div className="mt-3 flex items-center gap-2 text-xs">
                                    {canManage && (
                                        <button
                                            type="button"
                                            className="font-semibold text-primary"
                                            onClick={() => startEditCategory(c)}
                                        >
                                            Sửa
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button
                                            type="button"
                                            className="font-semibold text-rose-500"
                                            onClick={() => removeCategory(c)}
                                        >
                                            Xóa
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {categories.length === 0 && (
                            <p className="text-sm text-text-muted">Chưa có danh mục nào.</p>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:col-span-2">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                        <div>
                            <h3 className="font-semibold">Danh sách sản phẩm</h3>
                            <p className="text-xs text-text-muted mt-1">Quản lý sản phẩm và đơn giá gắn hợp đồng.</p>
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
                                value={filters.category_id}
                                onChange={(e) => setFilters((s) => ({ ...s, category_id: e.target.value }))}
                            >
                                <option value="">Tất cả danh mục</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
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
                                    <th className="py-2">Danh mục</th>
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
                                        <td className="py-2 text-text-muted">{p.category?.name || '—'}</td>
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
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={7}>
                                            Chưa có sản phẩm nào.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
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
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.category_id}
                        onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value }))}
                    >
                        <option value="">Chọn danh mục</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
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

            <Modal
                open={showCategoryForm}
                onClose={closeCategoryForm}
                title={editingCategoryId ? `Sửa danh mục #${editingCategoryId}` : 'Tạo danh mục'}
                description="Quản lý nhóm sản phẩm để lọc và phân loại."
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Mã danh mục"
                        value={categoryForm.code}
                        onChange={(e) => setCategoryForm((s) => ({ ...s, code: e.target.value }))}
                    />
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Tên danh mục *"
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm((s) => ({ ...s, name: e.target.value }))}
                    />
                    <textarea
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        rows={3}
                        placeholder="Mô tả"
                        value={categoryForm.description}
                        onChange={(e) => setCategoryForm((s) => ({ ...s, description: e.target.value }))}
                    />
                    <label className="flex items-center gap-2 text-xs text-text-muted">
                        <input
                            type="checkbox"
                            checked={categoryForm.is_active}
                            onChange={(e) => setCategoryForm((s) => ({ ...s, is_active: e.target.checked }))}
                        />
                        Đang hoạt động
                    </label>
                    {!canManage && (
                        <p className="text-xs text-text-muted">
                            Chỉ Admin/Kế toán có thể chỉnh sửa danh mục.
                        </p>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={saveCategory}
                        >
                            {editingCategoryId ? 'Cập nhật danh mục' : 'Tạo danh mục'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={closeCategoryForm}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
