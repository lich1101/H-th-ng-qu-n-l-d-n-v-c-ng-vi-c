import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import FilterToolbar, {
    FILTER_GRID_WITH_SUBMIT,
    FILTER_SUBMIT_BUTTON_CLASS,
    FilterActionGroup,
    FilterField,
    filterControlClass,
} from '@/Components/FilterToolbar';
import PaginationControls from '@/Components/PaginationControls';
import Modal from '@/Components/Modal';
import ClientSelect from '@/Components/ClientSelect';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { useToast } from '@/Contexts/ToastContext';

const toColorStyle = (hex) => {
    const color = hex || '#64748B';
    return {
        backgroundColor: `${color}20`,
        color,
        borderColor: `${color}55`,
    };
};

const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const emptyOpportunityForm = (defaultStatus = '') => ({
    title: '',
    opportunity_type: '',
    client_id: '',
    source: '',
    amount: '',
    status: defaultStatus,
    success_probability: '',
    product_id: '',
    assigned_to: '',
    watcher_ids: [],
    expected_close_date: '',
    notes: '',
});

function Field({ label, required = false, children, hint = '' }) {
    return (
        <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
            {hint ? <p className="mt-1.5 text-xs text-text-muted">{hint}</p> : null}
        </div>
    );
}

export default function Opportunities(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const currentUserId = Number(props?.auth?.user?.id || 0) || null;
    const canCreate = ['admin', 'administrator', 'quan_ly', 'nhan_vien'].includes(userRole);
    const canManageStatuses = ['admin', 'administrator'].includes(userRole);
    const canDelete = canCreate;

    const [opportunities, setOpportunities] = useState([]);
    const [opportunityMeta, setOpportunityMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        client_id: '',
        staff_ids: [],
        per_page: 20,
        page: 1,
    });

    const [statuses, setStatuses] = useState([]);
    const [clients, setClients] = useState([]);
    const [users, setUsers] = useState([]);
    const [products, setProducts] = useState([]);

    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [savingOpportunity, setSavingOpportunity] = useState(false);
    const [form, setForm] = useState(emptyOpportunityForm(''));

    const [showStatusModal, setShowStatusModal] = useState(false);
    const [editingStatusId, setEditingStatusId] = useState(null);
    const [savingStatus, setSavingStatus] = useState(false);
    const [statusForm, setStatusForm] = useState({ name: '', color_hex: '#04BC5C', sort_order: 0 });

    const statusMap = useMemo(() => {
        return statuses.reduce((acc, item) => {
            acc[item.code] = item;
            return acc;
        }, {});
    }, [statuses]);

    const userMap = useMemo(() => {
        return users.reduce((acc, item) => {
            acc[Number(item.id)] = item;
            return acc;
        }, {});
    }, [users]);

    const staffFilterOptions = useMemo(() => (
        users.map((user) => ({
            id: Number(user.id || 0),
            label: user.name || `Nhân sự #${user.id}`,
            meta: user.email || '',
        })).filter((user) => user.id > 0)
    ), [users]);

    const defaultStatusCode = useMemo(() => {
        return statuses.length > 0 ? String(statuses[0].code) : '';
    }, [statuses]);

    const editingOpportunityClient = useMemo(() => {
        if (!editingId) {
            return null;
        }
        const row = opportunities.find((o) => Number(o.id) === Number(editingId));
        return row?.client || null;
    }, [opportunities, editingId]);

    const statusCounts = useMemo(() => {
        const counts = {};
        opportunities.forEach((item) => {
            const code = String(item?.status || '');
            if (!code) return;
            counts[code] = (counts[code] || 0) + 1;
        });
        return counts;
    }, [opportunities]);

    const stats = useMemo(() => {
        return [
            { label: 'Tổng cơ hội', value: String(opportunityMeta.total || 0) },
            { label: 'Trạng thái', value: String(statuses.length) },
            { label: 'Khách hàng', value: String(clients.length) },
            { label: 'Vai trò', value: userRole || '—' },
        ];
    }, [opportunityMeta.total, statuses.length, clients.length, userRole]);

    const fetchOptions = async () => {
        try {
            const [statusRes, clientRes, userRes, productRes] = await Promise.all([
                axios.get('/api/v1/opportunity-statuses'),
                axios.get('/api/v1/crm/clients', {
                    params: {
                        per_page: 300,
                        page: 1,
                    },
                }),
                axios.get('/api/v1/users/lookup', {
                    params: {
                        purpose: 'operational_assignee',
                    },
                }),
                axios.get('/api/v1/products', {
                    params: {
                        per_page: 300,
                        page: 1,
                    },
                }),
            ]);

            const nextStatuses = statusRes.data || [];
            setStatuses(nextStatuses);
            setClients(clientRes.data?.data || []);
            setUsers(userRes.data?.data || []);
            setProducts(productRes.data?.data || []);

            setForm((prev) => {
                if (prev.status) return prev;
                if (!nextStatuses.length) return prev;
                return {
                    ...prev,
                    status: String(nextStatuses[0].code),
                };
            });
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được dữ liệu cấu hình cơ hội.');
        }
    };

    const handleOpportunitySearch = (val) => {
        const next = { ...filters, search: val, page: 1 };
        setFilters(next);
    };

    const applyOpportunityFilters = () => {
        setFilters((prev) => {
            const next = { ...prev, page: 1 };
            fetchOpportunities(1, next);
            return next;
        });
    };

    const fetchOpportunities = async (pageOrFilters = filters.page, maybeFilters = filters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);

        setLoading(true);
        try {
            const res = await axios.get('/api/v1/opportunities', {
                params: {
                    per_page: Number(nextFilters.per_page || 20),
                    page: nextPage,
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.client_id ? { client_id: nextFilters.client_id } : {}),
                    ...(Array.isArray(nextFilters.staff_ids) && nextFilters.staff_ids.length > 0 ? { staff_ids: nextFilters.staff_ids } : {}),
                },
            });

            setOpportunities(res.data?.data || []);
            setOpportunityMeta({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((prev) => ({
                ...prev,
                page: res.data?.current_page || nextPage,
            }));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được danh sách cơ hội.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOptions();
        fetchOpportunities();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openCreateForm = () => {
        setEditingId(null);
        const nextForm = emptyOpportunityForm(defaultStatusCode);
        if (currentUserId) {
            nextForm.assigned_to = String(currentUserId);
        }
        setForm(nextForm);
        setShowForm(true);
    };

    const openEditForm = (item) => {
        setEditingId(item.id);
        setForm({
            title: item.title || '',
            opportunity_type: item.opportunity_type || '',
            client_id: item.client_id ? String(item.client_id) : '',
            source: item.source || '',
            amount: item.amount ?? '',
            status: item.status || defaultStatusCode,
            success_probability: item.success_probability != null && item.success_probability !== ''
                ? String(item.success_probability)
                : '',
            product_id: item.product_id ? String(item.product_id) : '',
            assigned_to: item.assigned_to ? String(item.assigned_to) : '',
            watcher_ids: Array.isArray(item.watcher_ids)
                ? item.watcher_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
                : [],
            expected_close_date: item.expected_close_date || '',
            notes: item.notes || '',
        });
        setShowForm(true);
    };

    const submitOpportunity = async () => {
        if (!canCreate) return;

        if (!String(form.title || '').trim()) {
            toast.error('Vui lòng nhập tên cơ hội.');
            return;
        }
        if (!form.client_id) {
            toast.error('Vui lòng chọn khách hàng.');
            return;
        }
        const amountParsed = numberOrNull(form.amount);
        if (amountParsed === null || amountParsed < 0) {
            toast.error('Vui lòng nhập doanh số dự kiến (số ≥ 0).');
            return;
        }
        const probParsed = numberOrNull(form.success_probability);
        if (probParsed === null || !Number.isInteger(probParsed) || probParsed < 0 || probParsed > 100) {
            toast.error('Vui lòng chọn tỷ lệ thành công (0–100%).');
            return;
        }

        const payload = {
            title: String(form.title || '').trim(),
            opportunity_type: String(form.opportunity_type || '').trim() || null,
            client_id: Number(form.client_id),
            source: String(form.source || '').trim() || null,
            amount: amountParsed,
            status: form.status || null,
            success_probability: probParsed,
            product_id: form.product_id ? Number(form.product_id) : null,
            assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
            watcher_ids: (form.watcher_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
            expected_close_date: form.expected_close_date || null,
            notes: String(form.notes || '').trim() || null,
        };

        setSavingOpportunity(true);
        try {
            if (editingId) {
                await axios.put(`/api/v1/opportunities/${editingId}`, payload);
                toast.success('Đã cập nhật cơ hội.');
            } else {
                await axios.post('/api/v1/opportunities', payload);
                toast.success('Đã thêm cơ hội mới.');
            }
            setShowForm(false);
            await fetchOpportunities(filters.page, filters);
        } catch (error) {
            const message = error?.response?.data?.message || 'Lưu cơ hội thất bại.';
            const fallbackValidation = error?.response?.data?.errors
                ? Object.values(error.response.data.errors).flat().join(' ')
                : '';
            toast.error(message === 'The given data was invalid.' && fallbackValidation ? fallbackValidation : message);
        } finally {
            setSavingOpportunity(false);
        }
    };

    const deleteOpportunity = async (item) => {
        if (!canDelete) return;
        if (!window.confirm(`Xóa cơ hội "${item?.title || '#' + item?.id}"?`)) return;
        try {
            await axios.delete(`/api/v1/opportunities/${item.id}`);
            toast.success('Đã xóa cơ hội.');
            await fetchOpportunities(filters.page, filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa cơ hội thất bại.');
        }
    };

    const openCreateStatus = () => {
        setEditingStatusId(null);
        setStatusForm({ name: '', color_hex: '#04BC5C', sort_order: statuses.length + 1 });
    };

    const openEditStatus = (item) => {
        setEditingStatusId(item.id);
        setStatusForm({
            name: item.name || '',
            color_hex: item.color_hex || '#04BC5C',
            sort_order: item.sort_order ?? 0,
        });
    };

    const saveStatus = async () => {
        if (!canManageStatuses) return;
        if (!String(statusForm.name || '').trim()) {
            toast.error('Vui lòng nhập tên trạng thái cơ hội.');
            return;
        }

        setSavingStatus(true);
        try {
            const payload = {
                name: String(statusForm.name || '').trim(),
                color_hex: statusForm.color_hex || '#6B7280',
                sort_order: Number(statusForm.sort_order || 0),
            };
            if (editingStatusId) {
                await axios.put(`/api/v1/opportunity-statuses/${editingStatusId}`, payload);
                toast.success('Đã cập nhật trạng thái cơ hội.');
            } else {
                await axios.post('/api/v1/opportunity-statuses', payload);
                toast.success('Đã tạo trạng thái cơ hội.');
            }
            await fetchOptions();
            openCreateStatus();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không lưu được trạng thái cơ hội.');
        } finally {
            setSavingStatus(false);
        }
    };

    const removeStatus = async (item) => {
        if (!canManageStatuses) return;
        if (!window.confirm(`Xóa trạng thái "${item?.name || ''}"?`)) return;
        try {
            await axios.delete(`/api/v1/opportunity-statuses/${item.id}`);
            toast.success('Đã xóa trạng thái cơ hội.');
            await fetchOptions();
            setForm((prev) => {
                if (prev.status !== item.code) return prev;
                return {
                    ...prev,
                    status: '',
                };
            });
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không xóa được trạng thái cơ hội.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Cơ hội"
            description="Quản lý cơ hội bán hàng theo từng khách hàng, có form thêm nhanh và trạng thái màu cấu hình riêng."
            stats={stats}
        >
            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                {canManageStatuses ? (
                    <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                        onClick={() => {
                            setShowStatusModal(true);
                            openCreateStatus();
                        }}
                    >
                        Trạng thái cơ hội
                    </button>
                ) : null}
                {canCreate ? (
                    <button
                        type="button"
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                        onClick={() => {
                            if (!showForm) {
                                openCreateForm();
                            } else if (editingId) {
                                openCreateForm();
                            } else {
                                setShowForm(false);
                            }
                        }}
                    >
                        {showForm && !editingId ? 'Đóng form' : (editingId ? 'Tạo cơ hội mới' : 'Thêm cơ hội')}
                    </button>
                ) : null}
            </div>
            <FilterToolbar enableSearch
                title="Danh sách cơ hội"
                description="Lọc theo trạng thái, khách hàng và tìm kiếm nhanh theo tên cơ hội, ghi chú hoặc khách hàng."
                searchValue={filters.search}
                onSearch={handleOpportunitySearch}
                onSubmitFilters={applyOpportunityFilters}
            >
                <div className={FILTER_GRID_WITH_SUBMIT}>
                    <FilterField label="Trạng thái cơ hội">
                        <select
                            className={filterControlClass}
                            value={filters.status}
                            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            {statuses.map((status) => (
                                <option key={status.id} value={status.code}>
                                    {status.name}
                                </option>
                            ))}
                        </select>
                    </FilterField>
                    <FilterField label="Khách hàng">
                        <ClientSelect
                            className="bg-slate-50/70"
                            value={filters.client_id}
                            onChange={(id) => setFilters((prev) => ({ ...prev, client_id: id }))}
                            allowClear
                            clearLabel="Tất cả khách hàng"
                            placeholder="Tất cả khách hàng"
                        />
                    </FilterField>
                    <FilterField label="Nhân sự phụ trách">
                        <TagMultiSelect
                            options={staffFilterOptions}
                            selectedIds={filters.staff_ids}
                            onChange={(selectedIds) => setFilters((prev) => ({ ...prev, staff_ids: selectedIds }))}
                            addPlaceholder="Tìm và thêm nhân sự"
                            emptyLabel="Để trống để xem toàn bộ nhân sự trong phạm vi."
                        />
                    </FilterField>
                    <FilterActionGroup className="xl:self-end xl:justify-end">
                        <button type="submit" className={FILTER_SUBMIT_BUTTON_CLASS}>
                            Lọc
                        </button>
                    </FilterActionGroup>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!filters.status ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600 bg-white'
                            }`}
                        onClick={() => {
                            const next = { ...filters, status: '', page: 1 };
                            setFilters(next);
                            fetchOpportunities(1, next);
                        }}
                    >
                        Tất cả ({opportunities.length})
                    </button>
                    {statuses.map((status) => (
                        <button
                            key={status.id}
                            type="button"
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filters.status === status.code ? 'ring-2 ring-primary/30' : ''
                                }`}
                            style={toColorStyle(status.color_hex)}
                            onClick={() => {
                                const next = { ...filters, status: status.code, page: 1 };
                                setFilters(next);
                                fetchOpportunities(1, next);
                            }}
                        >
                            {status.name} ({statusCounts[status.code] || 0})
                        </button>
                    ))}
                </div>
            </FilterToolbar>

            <Modal
                open={Boolean(showForm && canCreate)}
                onClose={() => {
                    setShowForm(false);
                    setEditingId(null);
                }}
                title={editingId ? `Sửa cơ hội #${editingId}` : 'Thêm cơ hội mới'}
                description="Form cơ hội theo chuẩn CRM: khách hàng, trạng thái, doanh số dự kiến và người phụ trách."
                size="md"
            >
                <div className="grid gap-4 xl:grid-cols-2">
                    <Field label="Tên cơ hội" required>
                        <input
                            className={filterControlClass}
                            value={form.title}
                            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                            placeholder="Nhập tên cơ hội"
                        />
                    </Field>

                    <Field label="Nguồn cơ hội">
                        <input
                            className={filterControlClass}
                            value={form.source}
                            onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                            placeholder="Ví dụ: Facebook, Form, Telesale"
                        />
                    </Field>

                    <Field label="Loại cơ hội">
                        <input
                            className={filterControlClass}
                            value={form.opportunity_type}
                            onChange={(event) => setForm((prev) => ({ ...prev, opportunity_type: event.target.value }))}
                            placeholder="Ví dụ: Dịch vụ SEO, Backlink"
                        />
                    </Field>

                    <Field label="Doanh số dự kiến (VNĐ)" required>
                        <input
                            type="number"
                            className={filterControlClass}
                            value={form.amount}
                            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                            min="0"
                            placeholder="0"
                            required
                        />
                    </Field>

                    <Field label="Khách hàng" required>
                        <ClientSelect
                            className="bg-white"
                            value={form.client_id}
                            onChange={(id) => setForm((prev) => ({ ...prev, client_id: id }))}
                            placeholder="Chọn khách hàng"
                            clientPreview={editingOpportunityClient}
                        />
                    </Field>

                    <Field label="Tỷ lệ thành công (%)" required>
                        <select
                            className={filterControlClass}
                            value={form.success_probability}
                            onChange={(event) => setForm((prev) => ({ ...prev, success_probability: event.target.value }))}
                            required
                        >
                            <option value="">Chọn tỷ lệ</option>
                            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => (
                                <option key={value} value={value}>{value}%</option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Ngày kết thúc dự kiến">
                        <input
                            type="date"
                            className={filterControlClass}
                            value={form.expected_close_date}
                            onChange={(event) => setForm((prev) => ({ ...prev, expected_close_date: event.target.value }))}
                        />
                    </Field>

                    <Field label="Sản phẩm">
                        <select
                            className={filterControlClass}
                            value={form.product_id}
                            onChange={(event) => setForm((prev) => ({ ...prev, product_id: event.target.value }))}
                        >
                            <option value="">Chọn sản phẩm</option>
                            {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.name} {product.code ? `• ${product.code}` : ''}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Trạng thái cơ hội">
                        <select
                            className={filterControlClass}
                            value={form.status}
                            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            {statuses.map((status) => (
                                <option key={status.id} value={status.code}>
                                    {status.name}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Người quản lý/phụ trách" hint="Mặc định hệ thống gán tài khoản đang tạo cơ hội.">
                        <select
                            className={filterControlClass}
                            value={form.assigned_to}
                            onChange={(event) => setForm((prev) => ({ ...prev, assigned_to: event.target.value }))}
                        >
                            <option value="">Chọn nhân sự</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} • {user.role}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <div className="xl:col-span-2">
                        <Field label="Người theo dõi">
                            <TagMultiSelect
                                options={users.map((user) => ({
                                    id: user.id,
                                    label: user.name || `Nhân sự #${user.id}`,
                                    meta: [user.role, user.email].filter(Boolean).join(' • '),
                                }))}
                                selectedIds={form.watcher_ids}
                                onChange={(next) => setForm((prev) => ({ ...prev, watcher_ids: next }))}
                                addPlaceholder="Tìm và thêm người theo dõi"
                                emptyLabel="Chưa chọn người theo dõi."
                            />
                        </Field>
                    </div>

                    <div className="xl:col-span-2">
                        <Field label="Ghi chú">
                            <textarea
                                className={`${filterControlClass} min-h-[108px] resize-y`}
                                value={form.notes}
                                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                                placeholder="Nhập ghi chú cơ hội"
                            />
                        </Field>
                    </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 xl:col-span-2">
                    <button
                        type="button"
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                        onClick={submitOpportunity}
                        disabled={savingOpportunity}
                    >
                        {savingOpportunity ? 'Đang lưu...' : (editingId ? 'Cập nhật cơ hội' : 'Lưu cơ hội')}
                    </button>
                    <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                        onClick={() => {
                            setShowForm(false);
                            setEditingId(null);
                        }}
                    >
                        Đóng
                    </button>
                </div>
            </Modal>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-text-subtle">
                                <th className="py-2">Tên cơ hội</th>
                                <th className="py-2">Khách hàng</th>
                                <th className="py-2">Trạng thái</th>
                                <th className="py-2">Doanh số</th>
                                <th className="py-2">Nguồn</th>
                                <th className="py-2">Phụ trách</th>
                                <th className="py-2">Dự kiến chốt</th>
                                <th className="py-2 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {opportunities.map((item) => {
                                const status = statusMap[item.status] || item.status_config || null;
                                const assignee = item.assignee?.name || item.creator?.name || '—';
                                const client = item.client?.name || `KH #${item.client_id}`;
                                const clientId = Number(item.client_id || item.client?.id || 0);
                                const watcherNames = (item.watcher_ids || [])
                                    .map((id) => userMap[Number(id)]?.name)
                                    .filter(Boolean);

                                return (
                                    <tr
                                        key={item.id}
                                        role="link"
                                        tabIndex={0}
                                        aria-label={`Mở chi tiết cơ hội: ${item.title || 'Không tiêu đề'}`}
                                        className="cursor-pointer border-b border-slate-100 align-top transition-colors hover:bg-slate-50/90 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                                        onClick={() => {
                                            window.location.href = route('opportunities.detail', item.id);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                window.location.href = route('opportunities.detail', item.id);
                                            }
                                        }}
                                    >
                                        <td className="py-3">
                                            <div className="text-left font-semibold text-slate-900">
                                                {item.title || '—'}
                                            </div>
                                            <div className="mt-1 text-xs text-text-muted">
                                                {item.opportunity_type || 'Chưa phân loại'}
                                            </div>
                                            {watcherNames.length > 0 ? (
                                                <div className="mt-1 text-xs text-text-muted">
                                                    Theo dõi: {watcherNames.join(', ')}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="py-3 text-xs text-slate-700">
                                            {clientId > 0 ? (
                                                <button
                                                    type="button"
                                                    className="font-semibold text-primary hover:underline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.location.href = route('crm.flow', clientId);
                                                    }}
                                                >
                                                    {client}
                                                </button>
                                            ) : (
                                                client
                                            )}
                                        </td>
                                        <td className="py-3">
                                            <span
                                                className="inline-flex rounded-full border px-2 py-1 text-xs font-semibold"
                                                style={toColorStyle(status?.color_hex || '#64748B')}
                                            >
                                                {status?.name || item.status || '—'}
                                            </span>
                                        </td>
                                        <td className="py-3 text-xs text-slate-700">
                                            {Number(item.amount || 0).toLocaleString('vi-VN')} VNĐ
                                        </td>
                                        <td className="py-3 text-xs text-slate-700">
                                            {item.source || '—'}
                                            {item.success_probability !== null && item.success_probability !== undefined
                                                ? ` • ${item.success_probability}%`
                                                : ''}
                                        </td>
                                        <td className="py-3 text-xs text-slate-700">{assignee}</td>
                                        <td className="py-3 text-xs text-slate-700">{item.expected_close_date || '—'}</td>
                                        <td className="py-3">
                                            <div className="flex justify-end gap-2 text-xs">
                                                {canCreate ? (
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openEditForm(item);
                                                        }}
                                                    >
                                                        Sửa
                                                    </button>
                                                ) : null}
                                                {canDelete ? (
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border border-rose-200 px-2.5 py-1.5 font-semibold text-rose-600"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteOpportunity(item);
                                                        }}
                                                    >
                                                        Xóa
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!loading && opportunities.length === 0 ? (
                                <tr>
                                    <td className="py-8 text-center text-sm text-text-muted" colSpan={8}>
                                        Chưa có cơ hội nào theo bộ lọc hiện tại.
                                    </td>
                                </tr>
                            ) : null}

                            {loading ? (
                                <tr>
                                    <td className="py-8 text-center text-sm text-text-muted" colSpan={8}>
                                        Đang tải dữ liệu cơ hội...
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>

                <PaginationControls
                    page={opportunityMeta.current_page}
                    lastPage={opportunityMeta.last_page}
                    total={opportunityMeta.total}
                    perPage={filters.per_page}
                    label="cơ hội"
                    loading={loading}
                    onPageChange={(page) => fetchOpportunities(page, filters)}
                    onPerPageChange={(perPage) => {
                        const next = { ...filters, per_page: perPage, page: 1 };
                        setFilters(next);
                        fetchOpportunities(1, next);
                    }}
                />
            </div>

            <Modal
                open={showStatusModal}
                onClose={() => setShowStatusModal(false)}
                title="Cấu hình trạng thái cơ hội"
                description="Quản lý danh sách trạng thái và màu thẻ hiển thị ở trang cơ hội."
                size="md"
            >
                <div className="space-y-4 text-sm">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3">
                        <div className="grid gap-3 md:grid-cols-3">
                            <Field label="Tên trạng thái" required>
                                <input
                                    className={filterControlClass}
                                    placeholder="Ví dụ: Chờ báo giá"
                                    value={statusForm.name}
                                    onChange={(event) => setStatusForm((prev) => ({ ...prev, name: event.target.value }))}
                                />
                            </Field>
                            <Field label="Màu thẻ">
                                <input
                                    type="color"
                                    className="h-[48px] w-full rounded-2xl border border-slate-200/80 bg-white px-2"
                                    value={statusForm.color_hex}
                                    onChange={(event) => setStatusForm((prev) => ({ ...prev, color_hex: event.target.value }))}
                                />
                            </Field>
                            <Field label="Thứ tự">
                                <input
                                    type="number"
                                    className={filterControlClass}
                                    value={statusForm.sort_order}
                                    onChange={(event) => setStatusForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                                />
                            </Field>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                disabled={savingStatus}
                                onClick={saveStatus}
                            >
                                {savingStatus ? 'Đang lưu...' : (editingStatusId ? 'Cập nhật trạng thái' : 'Thêm trạng thái')}
                            </button>
                            {editingStatusId ? (
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                    onClick={openCreateStatus}
                                >
                                    Hủy sửa
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-2">
                        {statuses.map((status) => (
                            <div key={status.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full border px-2.5 py-1 text-xs font-semibold" style={toColorStyle(status.color_hex)}>
                                        {status.name}
                                    </span>
                                    <span className="text-xs text-text-muted">Code: {status.code}</span>
                                    <span className="text-xs text-text-muted">Thứ tự: {status.sort_order || 0}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700"
                                        onClick={() => openEditStatus(status)}
                                    >
                                        Sửa
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg border border-rose-200 px-2.5 py-1.5 font-semibold text-rose-600"
                                        onClick={() => removeStatus(status)}
                                    >
                                        Xóa
                                    </button>
                                </div>
                            </div>
                        ))}

                        {statuses.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                                Chưa có trạng thái cơ hội. Vui lòng tạo mới ít nhất 1 trạng thái.
                            </div>
                        ) : null}
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
