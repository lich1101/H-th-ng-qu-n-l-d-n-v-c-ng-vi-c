import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import Modal from '@/Components/Modal';
import PageContainer from '@/Components/PageContainer';
import PaginationControls from '@/Components/PaginationControls';
import AutoCodeBadge from '@/Components/AutoCodeBadge';
import { useToast } from '@/Contexts/ToastContext';

function FormField({ label, required = false, children }) {
    return (
        <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
        </div>
    );
}

export default function ProductCategories(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canManage = userRole === 'admin';

    const [categories, setCategories] = useState([]);
    const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [filters, setFilters] = useState({ search: '', is_active: '', per_page: 10, page: 1 });
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        name: '',
        description: '',
        is_active: true,
    });

    const handleSearch = (val) => {
        const next = { ...filters, search: val, page: 1 };
        setFilters(next);
    };

    const fetchCategories = async (pageOrFilters = filters.page, maybeFilters = filters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);

        setLoading(true);
        try {
            const response = await axios.get('/api/v1/product-categories', {
                params: {
                    ...nextFilters,
                    page: nextPage,
                    per_page: nextFilters.per_page || 10,
                },
            });
            setCategories(response.data?.data || []);
            setMeta({
                current_page: response.data?.current_page || 1,
                last_page: response.data?.last_page || 1,
                total: response.data?.total || 0,
            });
            setFilters((prev) => ({ ...prev, page: response.data?.current_page || nextPage }));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được danh mục sản phẩm.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const total = meta.total || categories.length;
        const active = categories.filter((item) => item.is_active).length;
        const inactive = Math.max(total - active, 0);

        return [
            { label: 'Tổng danh mục', value: String(total) },
            { label: 'Đang hoạt động', value: String(active) },
            { label: 'Ngưng', value: String(inactive) },
            { label: 'Quyền quản trị', value: canManage ? 'Admin' : 'Chỉ xem' },
        ];
    }, [categories, canManage, meta.total]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            name: '',
            description: '',
            is_active: true,
        });
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const openEdit = (category) => {
        setEditingId(category.id);
        setForm({
            name: category.name || '',
            description: category.description || '',
            is_active: !!category.is_active,
        });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const saveCategory = async () => {
        if (!canManage) {
            toast.error('Chỉ admin mới có quyền quản lý danh mục sản phẩm.');
            return;
        }
        if (!form.name.trim()) {
            toast.error('Vui lòng nhập tên danh mục.');
            return;
        }

        const payload = {
            name: form.name.trim(),
            description: form.description || null,
            is_active: !!form.is_active,
        };

        try {
            if (editingId) {
                await axios.put(`/api/v1/product-categories/${editingId}`, payload);
                toast.success('Đã cập nhật danh mục sản phẩm.');
            } else {
                await axios.post('/api/v1/product-categories', payload);
                toast.success('Đã tạo danh mục sản phẩm.');
            }
            closeForm();
            await fetchCategories(filters.page, filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu danh mục sản phẩm thất bại.');
        }
    };

    const removeCategory = async (category) => {
        if (!canManage) {
            toast.error('Chỉ admin mới có quyền xóa danh mục sản phẩm.');
            return;
        }
        if (!window.confirm(`Xóa danh mục "${category.name}"?`)) return;

        try {
            await axios.delete(`/api/v1/product-categories/${category.id}`);
            toast.success('Đã xóa danh mục sản phẩm.');
            await fetchCategories(filters.page, filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa danh mục sản phẩm thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý danh mục sản phẩm"
            description="Danh mục dùng để gom nhóm sản phẩm. Mã danh mục được hệ thống tự sinh và luôn tránh trùng lặp."
            stats={stats}
        >
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                {canManage && (
                    <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                        <button
                            type="button"
                            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
                            onClick={openCreate}
                        >
                            Thêm danh mục
                        </button>
                    </div>
                )}
                <FilterToolbar enableSearch
                    className="mb-4 border-0 p-0 shadow-none"
                    title="Danh sách danh mục"
                    description="Tìm nhanh danh mục qua tên hoặc mã tự sinh."
                    searchValue={filters.search}
                    onSearch={handleSearch}
                    actions={(
                        <FilterActionGroup>
                            <button
                                type="button"
                                className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                                onClick={() => fetchCategories(1, { ...filters, page: 1 })}
                            >
                                Lọc
                            </button>
                        </FilterActionGroup>
                    )}
                >
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                        <FilterField label="Trạng thái">
                            <select
                                className={filterControlClass}
                                value={filters.is_active}
                                onChange={(e) => setFilters((prev) => ({ ...prev, is_active: e.target.value }))}
                            >
                                <option value="">Tất cả trạng thái</option>
                                <option value="1">Đang hoạt động</option>
                                <option value="0">Ngưng</option>
                            </select>
                        </FilterField>
                    </div>
                </FilterToolbar>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-text-subtle">
                                <th className="py-2">Mã tự sinh</th>
                                <th className="py-2">Tên danh mục</th>
                                <th className="py-2">Mô tả</th>
                                <th className="py-2">Trạng thái</th>
                                <th className="py-2 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((category) => (
                                <tr key={category.id} className="border-b border-slate-100 align-top">
                                    <td className="py-3">
                                        <AutoCodeBadge code={category.code} />
                                    </td>
                                    <td className="py-3 font-semibold text-slate-900">
                                        {category.name}
                                    </td>
                                    <td className="py-3 text-text-muted">
                                        {category.description || '—'}
                                    </td>
                                    <td className="py-3">
                                        <span
                                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                category.is_active
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-100 text-slate-500'
                                            }`}
                                        >
                                            {category.is_active ? 'Hoạt động' : 'Ngưng'}
                                        </span>
                                    </td>
                                    <td className="py-3 text-right">
                                        {canManage ? (
                                            <div className="flex justify-end gap-3 text-xs font-semibold">
                                                <button
                                                    type="button"
                                                    className="text-primary"
                                                    onClick={() => openEdit(category)}
                                                >
                                                    Sửa
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-rose-500"
                                                    onClick={() => removeCategory(category)}
                                                >
                                                    Xóa
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-text-muted">Chỉ xem</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {categories.length === 0 && !loading && (
                                <tr>
                                    <td className="py-8 text-center text-sm text-text-muted" colSpan={5}>
                                        Chưa có danh mục sản phẩm nào.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <PaginationControls
                    page={meta.current_page}
                    lastPage={meta.last_page}
                    total={meta.total}
                    perPage={filters.per_page}
                    label="danh mục"
                    loading={loading}
                    onPageChange={(page) => fetchCategories(page, filters)}
                    onPerPageChange={(perPage) => {
                        const next = { ...filters, per_page: perPage, page: 1 };
                        setFilters(next);
                        fetchCategories(1, next);
                    }}
                />
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa danh mục #${editingId}` : 'Thêm danh mục sản phẩm'}
                description="Mã danh mục sẽ tự sinh sau khi lưu. Bạn chỉ cần nhập thông tin nghiệp vụ cần hiển thị."
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <FormField label="Tên danh mục" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: Backlink báo chí"
                            value={form.name}
                            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Mô tả">
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Ghi chú ngắn về phạm vi danh mục"
                            value={form.description}
                            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </FormField>
                    <label className="flex items-center gap-2 text-xs text-text-muted">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                        />
                        Đang hoạt động
                    </label>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-white"
                            onClick={saveCategory}
                        >
                            {editingId ? 'Cập nhật danh mục' : 'Tạo danh mục'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"
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
