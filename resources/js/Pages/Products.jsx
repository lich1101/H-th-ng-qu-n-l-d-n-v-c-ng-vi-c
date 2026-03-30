import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';

function FormField({ label, required = false, children, className = '' }) {
    return (
        <div className={className}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
        </div>
    );
}

export default function Products(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canManage = ['admin', 'ke_toan'].includes(userRole);
    const canDelete = userRole === 'admin';
    const canBulkActions = canManage || canDelete;

    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [productMeta, setProductMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [filters, setFilters] = useState({ search: '', is_active: '', category_id: '', per_page: 20, page: 1 });
    const [form, setForm] = useState({
        code: '',
        name: '',
        category_id: '',
        unit: '',
        unit_price: '',
        description: '',
        is_active: true,
    });
    const [categoryMeta, setCategoryMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [categoryFilters, setCategoryFilters] = useState({ search: '', is_active: '', per_page: 10, page: 1 });
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [categoryForm, setCategoryForm] = useState({
        code: '',
        name: '',
        description: '',
        is_active: true,
    });
    const [selectedProductIds, setSelectedProductIds] = useState([]);
    const [bulkLoading, setBulkLoading] = useState(false);

    const fetchProducts = async (pageOrFilters = filters.page, maybeFilters = filters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/products', {
                params: {
                    ...nextFilters,
                    page: nextPage,
                    per_page: nextFilters.per_page || 20,
                },
            });
            const rows = res.data?.data || [];
            setProducts(rows);
            setSelectedProductIds((prev) => prev.filter((id) => rows.some((product) => Number(product.id) === Number(id))));
            setProductMeta({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((prev) => ({ ...prev, page: res.data?.current_page || nextPage }));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được sản phẩm.');
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async (pageOrFilters = categoryFilters.page, maybeFilters = categoryFilters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);
        try {
            const res = await axios.get('/api/v1/product-categories', {
                params: {
                    ...nextFilters,
                    page: nextPage,
                    per_page: nextFilters.per_page || 10,
                },
            });
            setCategories(res.data?.data || []);
            setCategoryMeta({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setCategoryFilters((prev) => ({ ...prev, page: res.data?.current_page || nextPage }));
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
        const total = productMeta.total || products.length;
        const active = products.filter((p) => p.is_active).length;
        return [
            { label: 'Tổng sản phẩm', value: String(total) },
            { label: 'Đang hoạt động', value: String(active) },
            { label: 'Ngưng', value: String(total - active) },
            { label: 'Vai trò', value: userRole || '—' },
        ];
    }, [productMeta.total, products, userRole]);

    const visibleProductIds = useMemo(
        () => products.map((product) => Number(product.id)).filter((id) => id > 0),
        [products]
    );
    const selectedProductSet = useMemo(
        () => new Set(selectedProductIds.map((id) => Number(id))),
        [selectedProductIds]
    );
    const allVisibleSelected = visibleProductIds.length > 0
        && visibleProductIds.every((id) => selectedProductSet.has(id));

    const toggleProductSelection = (productId) => {
        const normalizedId = Number(productId || 0);
        if (normalizedId <= 0) return;
        setSelectedProductIds((prev) => (
            prev.includes(normalizedId)
                ? prev.filter((id) => id !== normalizedId)
                : [...prev, normalizedId]
        ));
    };

    const toggleSelectAllVisibleProducts = () => {
        if (allVisibleSelected) {
            setSelectedProductIds((prev) => prev.filter((id) => !visibleProductIds.includes(Number(id))));
            return;
        }

        setSelectedProductIds((prev) => {
            const set = new Set(prev.map((id) => Number(id)));
            visibleProductIds.forEach((id) => set.add(id));
            return Array.from(set.values());
        });
    };

    const bulkUpdateProducts = async (patch, successLabel) => {
        if (!canManage) return toast.error('Bạn không có quyền thao tác nhanh sản phẩm.');
        if (!selectedProductIds.length) return toast.error('Vui lòng chọn sản phẩm cần xử lý.');

        setBulkLoading(true);
        try {
            await Promise.all(selectedProductIds.map((id) => axios.put(`/api/v1/products/${id}`, patch)));
            toast.success(successLabel);
            setSelectedProductIds([]);
            await fetchProducts(filters.page, filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể cập nhật hàng loạt sản phẩm.');
        } finally {
            setBulkLoading(false);
        }
    };

    const bulkDeleteProducts = async () => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa sản phẩm.');
        if (!selectedProductIds.length) return toast.error('Vui lòng chọn sản phẩm cần xóa.');
        if (!confirm(`Xóa ${selectedProductIds.length} sản phẩm đã chọn?`)) return;

        setBulkLoading(true);
        try {
            await Promise.all(selectedProductIds.map((id) => axios.delete(`/api/v1/products/${id}`)));
            toast.success(`Đã xóa ${selectedProductIds.length} sản phẩm đã chọn.`);
            setSelectedProductIds([]);
            await fetchProducts(filters.page, filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể xóa hàng loạt sản phẩm.');
        } finally {
            setBulkLoading(false);
        }
    };

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
            await fetchProducts(filters.page, filters);
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
            await fetchProducts(filters.page, filters);
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
            await fetchCategories(categoryFilters.page, categoryFilters);
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
            await fetchCategories(categoryFilters.page, categoryFilters);
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
                    <FilterToolbar
                        title="Danh mục sản phẩm"
                        description="Quản lý nhóm sản phẩm để lọc nhanh."
                        actions={(
                            <FilterActionGroup>
                                {canManage && (
                                    <button
                                        type="button"
                                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                                        onClick={openCategoryCreate}
                                    >
                                        Thêm danh mục
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                                    onClick={() => {
                                        const next = { ...categoryFilters, page: 1 };
                                        setCategoryFilters(next);
                                        fetchCategories(1, next);
                                    }}
                                >
                                    Lọc
                                </button>
                            </FilterActionGroup>
                        )}
                    >
                        <div className="grid gap-3 md:grid-cols-2">
                            <FilterField label="Tìm danh mục">
                                <input
                                    className={filterControlClass}
                                    placeholder="Tên hoặc mã danh mục"
                                    value={categoryFilters.search}
                                    onChange={(e) => setCategoryFilters((s) => ({ ...s, search: e.target.value }))}
                                />
                            </FilterField>
                            <FilterField label="Trạng thái">
                                <select
                                    className={filterControlClass}
                                    value={categoryFilters.is_active}
                                    onChange={(e) => setCategoryFilters((s) => ({ ...s, is_active: e.target.value }))}
                                >
                                    <option value="">Tất cả trạng thái</option>
                                    <option value="1">Đang hoạt động</option>
                                    <option value="0">Ngưng</option>
                                </select>
                            </FilterField>
                        </div>
                    </FilterToolbar>
                    <div className="mb-4" />
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
                    <PaginationControls
                        page={categoryMeta.current_page}
                        lastPage={categoryMeta.last_page}
                        total={categoryMeta.total}
                        perPage={categoryFilters.per_page}
                        label="danh mục"
                        className="border-0 bg-transparent px-0"
                        onPageChange={(page) => fetchCategories(page, categoryFilters)}
                        onPerPageChange={(perPage) => {
                            const next = { ...categoryFilters, per_page: perPage, page: 1 };
                            setCategoryFilters(next);
                            fetchCategories(1, next);
                        }}
                    />
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:col-span-2">
                    <FilterToolbar
                        title="Danh sách sản phẩm"
                        description="Quản lý sản phẩm và đơn giá gắn hợp đồng."
                        actions={(
                            <FilterActionGroup>
                                <button
                                    type="button"
                                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                                    onClick={openCreate}
                                >
                                    Thêm mới
                                </button>
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                                    onClick={() => {
                                        const next = { ...filters, page: 1 };
                                        setFilters(next);
                                        fetchProducts(1, next);
                                    }}
                                >
                                    Lọc
                                </button>
                            </FilterActionGroup>
                        )}
                    >
                        <div className="grid gap-3 md:grid-cols-3">
                            <FilterField label="Tìm kiếm">
                                <input
                                    className={filterControlClass}
                                    placeholder="Tên hoặc mã sản phẩm"
                                    value={filters.search}
                                    onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
                                />
                            </FilterField>
                            <FilterField label="Danh mục">
                                <select
                                    className={filterControlClass}
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
                            </FilterField>
                            <FilterField label="Trạng thái">
                                <select
                                    className={filterControlClass}
                                    value={filters.is_active}
                                    onChange={(e) => setFilters((s) => ({ ...s, is_active: e.target.value }))}
                                >
                                    <option value="">Tất cả trạng thái</option>
                                    <option value="1">Đang hoạt động</option>
                                    <option value="0">Ngưng</option>
                                </select>
                            </FilterField>
                        </div>
                    </FilterToolbar>
                    <div className="mb-4" />
                    {canBulkActions && selectedProductIds.length > 0 && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                            <div className="text-sm font-medium text-cyan-900">
                                Đã chọn {selectedProductIds.length} sản phẩm.
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    className="rounded-xl border border-cyan-300 bg-white px-3 py-2 text-xs font-semibold text-cyan-700"
                                    onClick={() => setSelectedProductIds([])}
                                    disabled={bulkLoading}
                                >
                                    Bỏ chọn
                                </button>
                                {canManage && (
                                    <>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800"
                                            onClick={() => bulkUpdateProducts({ is_active: true }, `Đã kích hoạt ${selectedProductIds.length} sản phẩm.`)}
                                            disabled={bulkLoading}
                                        >
                                            {bulkLoading ? 'Đang xử lý...' : 'Kích hoạt đã chọn'}
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800"
                                            onClick={() => bulkUpdateProducts({ is_active: false }, `Đã ngưng ${selectedProductIds.length} sản phẩm.`)}
                                            disabled={bulkLoading}
                                        >
                                            {bulkLoading ? 'Đang xử lý...' : 'Ngưng đã chọn'}
                                        </button>
                                    </>
                                )}
                                {canDelete && (
                                    <button
                                        type="button"
                                        className="rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800"
                                        onClick={bulkDeleteProducts}
                                        disabled={bulkLoading}
                                    >
                                        {bulkLoading ? 'Đang xử lý...' : 'Xóa đã chọn'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                    {canBulkActions && (
                                        <th className="py-2 pr-3">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                                                checked={allVisibleSelected}
                                                onChange={toggleSelectAllVisibleProducts}
                                                aria-label="Chọn tất cả sản phẩm đang hiển thị"
                                            />
                                        </th>
                                    )}
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
                                    <tr key={p.id} className={`border-b border-slate-100 ${selectedProductSet.has(Number(p.id)) ? 'bg-primary/5' : ''}`}>
                                        {canBulkActions && (
                                            <td className="py-2 pr-3 align-top">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                                                    checked={selectedProductSet.has(Number(p.id))}
                                                    onChange={() => toggleProductSelection(p.id)}
                                                    aria-label={`Chọn sản phẩm ${p.name}`}
                                                />
                                            </td>
                                        )}
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
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={canBulkActions ? 8 : 7}>
                                            Chưa có sản phẩm nào.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls
                        page={productMeta.current_page}
                        lastPage={productMeta.last_page}
                        total={productMeta.total}
                        perPage={filters.per_page}
                        label="sản phẩm"
                        loading={loading}
                        onPageChange={(page) => fetchProducts(page, filters)}
                        onPerPageChange={(perPage) => {
                            const next = { ...filters, per_page: perPage, page: 1 };
                            setFilters(next);
                            fetchProducts(1, next);
                        }}
                    />
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
                    <FormField label="Mã sản phẩm">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Nhập mã nội bộ nếu cần"
                            value={form.code}
                            onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Tên sản phẩm" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: Gói SEO tổng thể"
                            value={form.name}
                            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Danh mục sản phẩm">
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
                    </FormField>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Đơn vị">
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                placeholder="Ví dụ: bài, tháng, gói"
                                value={form.unit}
                                onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
                            />
                        </FormField>
                        <FormField label="Đơn giá (VNĐ)">
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                placeholder="Nhập giá bán"
                                type="number"
                                value={form.unit_price}
                                onChange={(e) => setForm((s) => ({ ...s, unit_price: e.target.value }))}
                            />
                        </FormField>
                    </div>
                    <FormField label="Mô tả">
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Mô tả ngắn về phạm vi hoặc cách dùng sản phẩm"
                            value={form.description}
                            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                        />
                    </FormField>
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
                    <FormField label="Mã danh mục">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: backlink, content"
                            value={categoryForm.code}
                            onChange={(e) => setCategoryForm((s) => ({ ...s, code: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Tên danh mục" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Tên hiển thị cho người dùng"
                            value={categoryForm.name}
                            onChange={(e) => setCategoryForm((s) => ({ ...s, name: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Mô tả">
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Mô tả ngắn về nhóm sản phẩm"
                            value={categoryForm.description}
                            onChange={(e) => setCategoryForm((s) => ({ ...s, description: e.target.value }))}
                        />
                    </FormField>
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
