import React, { useEffect, useMemo, useRef, useState } from 'react';
import FilterStatusHelpIcon from '@/Components/FilterStatusHelpIcon';
import axios from 'axios';
import FilterDateInput from '@/Components/FilterDateInput';
import PageContainer from '@/Components/PageContainer';
import FilterToolbar, {
    FILTER_GRID_SUBMIT_ROW,
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
import { formatVietnamDate, toDateInputValue } from '@/lib/vietnamTime';
import { fetchStaffFilterOptions } from '@/lib/staffFilterOptions';

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

const COMPUTED_STATUS_FILTER_OPTIONS = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'undetermined', label: 'Chưa xác định' },
    { value: 'open', label: 'Đang mở' },
    { value: 'overdue', label: 'Quá hạn' },
    { value: 'success', label: 'Thành công' },
];

/** Giải thích trạng thái tính toán (OpportunityComputedStatus) */
const OPPORTUNITY_COMPUTED_STATUS_HELP = [
    { value: 'undetermined', label: 'Chưa xác định', description: 'Chưa có ngày dự kiến chốt nên chưa phân loại thời hạn.' },
    { value: 'open', label: 'Đang mở', description: 'Còn trong hạn đến ngày dự kiến chốt và chưa có hợp đồng liên kết.' },
    { value: 'overdue', label: 'Quá hạn', description: 'Đã qua ngày dự kiến chốt nhưng chưa có hợp đồng liên kết.' },
    { value: 'success', label: 'Thành công', description: 'Đã có hợp đồng gắn với cơ hội.' },
];

const computedStatusBadgeHex = (code) => ({
    undetermined: '#64748B',
    open: '#0ea5e9',
    overdue: '#f59e0b',
    success: '#10b981',
}[String(code || '')] || '#64748B');

const emptyOpportunityForm = () => ({
    title: '',
    opportunity_type: '',
    client_id: '',
    contract_id: '',
    source: '',
    amount: '',
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
    const userRole = String(props?.auth?.user?.role || '').toLowerCase();
    const currentUserId = Number(props?.auth?.user?.id || 0) || null;
    const canCreate = ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'].includes(userRole);
    const canDelete = canCreate;

    const canMutateOpportunityRow = (row) => {
        if (['admin', 'administrator', 'ke_toan', 'quan_ly'].includes(userRole)) {
            return true;
        }
        if (userRole !== 'nhan_vien') {
            return false;
        }
        const uid = Number(currentUserId || 0);
        if (!uid) return false;
        const assignedId = Number(row?.client?.assigned_staff_id ?? 0);
        return assignedId > 0 && assignedId === uid;
    };

    const [opportunities, setOpportunities] = useState([]);
    const [opportunityMeta, setOpportunityMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [listAggregates, setListAggregates] = useState({
        revenue_total: 0,
        status_counts: {
            all: 0,
            undetermined: 0,
            open: 0,
            overdue: 0,
            success: 0,
        },
    });
    const [filters, setFilters] = useState({
        search: '',
        computed_status: '',
        client_id: '',
        staff_ids: [],
        expected_close_from: '',
        expected_close_to: '',
        per_page: 20,
        page: 1,
    });

    const [clients, setClients] = useState([]);
    const [users, setUsers] = useState([]);
    const [opportunityStaffFilterUsers, setOpportunityStaffFilterUsers] = useState([]);
    const [products, setProducts] = useState([]);

    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [savingOpportunity, setSavingOpportunity] = useState(false);
    const [form, setForm] = useState(emptyOpportunityForm());
    const [linkableContracts, setLinkableContracts] = useState([]);
    const opportunitiesFetchRequestId = useRef(0);

    const userMap = useMemo(() => {
        return users.reduce((acc, item) => {
            acc[Number(item.id)] = item;
            return acc;
        }, {});
    }, [users]);

    const staffFilterOptions = useMemo(() => {
        const rows = opportunityStaffFilterUsers.length > 0 ? opportunityStaffFilterUsers : users;
        return rows.map((user) => ({
            id: Number(user.id || 0),
            label: user.name || `Nhân sự #${user.id}`,
            meta: user.email || '',
        })).filter((user) => user.id > 0);
    }, [opportunityStaffFilterUsers, users]);

    const editingOpportunityClient = useMemo(() => {
        if (!editingId) {
            return null;
        }
        const row = opportunities.find((o) => Number(o.id) === Number(editingId));
        return row?.client || null;
    }, [opportunities, editingId]);

    const computedStatusCounts = useMemo(() => {
        const toSafeCount = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
        };

        return {
            all: toSafeCount(listAggregates?.status_counts?.all ?? opportunityMeta.total ?? 0),
            undetermined: toSafeCount(listAggregates?.status_counts?.undetermined),
            open: toSafeCount(listAggregates?.status_counts?.open),
            overdue: toSafeCount(listAggregates?.status_counts?.overdue),
            success: toSafeCount(listAggregates?.status_counts?.success),
        };
    }, [listAggregates?.status_counts, opportunityMeta.total]);

    const stats = useMemo(() => {
        return [
            { label: 'Tổng cơ hội', value: String(opportunityMeta.total || 0) },
            { label: 'Doanh số (lọc)', value: `${Number(listAggregates.revenue_total || 0).toLocaleString('vi-VN')} VNĐ` },
            { label: 'Khách hàng', value: String(clients.length) },
            { label: 'Vai trò', value: userRole || '—' },
        ];
    }, [opportunityMeta.total, listAggregates.revenue_total, clients.length, userRole]);

    const fetchOptions = async () => {
        try {
            const [clientRes, userRes, productRes, staffFilterRows] = await Promise.all([
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
                fetchStaffFilterOptions('opportunities'),
            ]);

            setClients(clientRes.data?.data || []);
            setUsers(userRes.data?.data || []);
            setOpportunityStaffFilterUsers(staffFilterRows);
            setProducts(productRes.data?.data || []);
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
        const requestId = opportunitiesFetchRequestId.current + 1;
        opportunitiesFetchRequestId.current = requestId;

        setLoading(true);
        try {
            const res = await axios.get('/api/v1/opportunities', {
                params: {
                    per_page: Number(nextFilters.per_page || 20),
                    page: nextPage,
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.computed_status ? { computed_status: nextFilters.computed_status } : {}),
                    ...(nextFilters.client_id ? { client_id: nextFilters.client_id } : {}),
                    ...(Array.isArray(nextFilters.staff_ids) && nextFilters.staff_ids.length > 0 ? { staff_ids: nextFilters.staff_ids } : {}),
                    ...(nextFilters.expected_close_from ? { expected_close_from: nextFilters.expected_close_from } : {}),
                    ...(nextFilters.expected_close_to ? { expected_close_to: nextFilters.expected_close_to } : {}),
                },
            });
            if (requestId !== opportunitiesFetchRequestId.current) {
                return;
            }

            setOpportunities(res.data?.data || []);
            const agg = res.data?.aggregates;
            setListAggregates({
                revenue_total: Number(agg?.revenue_total ?? 0),
                status_counts: {
                    all: Number(agg?.status_counts?.all ?? res.data?.total ?? 0),
                    undetermined: Number(agg?.status_counts?.undetermined ?? 0),
                    open: Number(agg?.status_counts?.open ?? 0),
                    overdue: Number(agg?.status_counts?.overdue ?? 0),
                    success: Number(agg?.status_counts?.success ?? 0),
                },
            });
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
            if (requestId !== opportunitiesFetchRequestId.current) {
                return;
            }
            toast.error(error?.response?.data?.message || 'Không tải được danh sách cơ hội.');
        } finally {
            if (requestId === opportunitiesFetchRequestId.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        fetchOptions();
        fetchOpportunities();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!showForm || !form.client_id) {
            setLinkableContracts([]);
            return;
        }
        const clientId = Number(form.client_id);
        if (!clientId) {
            setLinkableContracts([]);
            return;
        }
        let cancelled = false;
        axios.get('/api/v1/contracts', {
            params: {
                linkable_for_opportunity: 1,
                client_id: clientId,
                per_page: 200,
                ...(editingId ? { opportunity_id: editingId } : {}),
            },
        }).then((res) => {
            if (!cancelled) {
                setLinkableContracts(res.data?.data || []);
            }
        }).catch(() => {
            if (!cancelled) {
                setLinkableContracts([]);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [showForm, form.client_id, editingId]);

    const openCreateForm = () => {
        setEditingId(null);
        const nextForm = emptyOpportunityForm();
        if (currentUserId) {
            nextForm.assigned_to = String(currentUserId);
        }
        setForm(nextForm);
        setShowForm(true);
    };

    const mapApiToOpportunityForm = (row) => ({
        title: row.title || '',
        opportunity_type: row.opportunity_type || '',
        client_id: row.client_id ? String(row.client_id) : '',
        source: row.source || '',
        amount: row.amount !== null && row.amount !== undefined && row.amount !== ''
            ? String(row.amount)
            : '',
        success_probability: row.success_probability != null && row.success_probability !== ''
            ? String(row.success_probability)
            : '',
        product_id: (row.product_id ?? row.product?.id) ? String(row.product_id ?? row.product?.id) : '',
        assigned_to: row.assigned_to ? String(row.assigned_to) : '',
        watcher_ids: Array.isArray(row.watcher_ids)
            ? row.watcher_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
            : [],
        expected_close_date: toDateInputValue(row.expected_close_date),
        notes: row.notes || '',
        contract_id: row.contract?.id ? String(row.contract.id) : '',
    });

    const openEditForm = (item) => {
        setEditingId(item.id);
        setForm(mapApiToOpportunityForm(item));
        setShowForm(true);
        axios.get(`/api/v1/opportunities/${item.id}`)
            .then((res) => {
                if (res.data?.id) {
                    setForm(mapApiToOpportunityForm(res.data));
                }
            })
            .catch(() => {});
    };

    const submitOpportunity = async () => {
        if (!canCreate) return;

        if (userRole === 'nhan_vien') {
            const client = clients.find((c) => String(c.id) === String(form.client_id));
            const uid = Number(currentUserId || 0);
            const assignedId = Number(client?.assigned_staff_id ?? 0);
            if (!client || !uid || assignedId !== uid) {
                toast.error('Chỉ nhân viên phụ trách khách hàng (phụ trách KH) mới được tạo hoặc sửa cơ hội cho khách đó.');
                return;
            }
        }

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
            success_probability: probParsed,
            product_id: form.product_id ? Number(form.product_id) : null,
            assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
            watcher_ids: (form.watcher_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
            expected_close_date: form.expected_close_date || null,
            notes: String(form.notes || '').trim() || null,
            contract_id: form.contract_id ? Number(form.contract_id) : null,
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
        if (!canMutateOpportunityRow(item)) {
            toast.error('Bạn không có quyền xóa cơ hội này.');
            return;
        }
        if (!window.confirm(`Xóa cơ hội "${item?.title || '#' + item?.id}"?`)) return;
        try {
            await axios.delete(`/api/v1/opportunities/${item.id}`);
            toast.success('Đã xóa cơ hội.');
            await fetchOpportunities(filters.page, filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa cơ hội thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Cơ hội"
            description="Quản lý cơ hội bán hàng theo từng khách hàng; trạng thái hiển thị theo ngày chốt và hợp đồng liên kết."
            stats={stats}
        >
            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
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
                description="Lọc theo trạng thái tính toán, khách hàng và tìm kiếm nhanh theo tên cơ hội, ghi chú hoặc khách hàng."
                searchValue={filters.search}
                onSearch={handleOpportunitySearch}
                onSubmitFilters={applyOpportunityFilters}
            >
                <div className={FILTER_GRID_WITH_SUBMIT}>
                    <FilterField
                        label={(
                            <span className="inline-flex items-center gap-1.5">
                                Trạng thái (tính toán)
                                <FilterStatusHelpIcon items={OPPORTUNITY_COMPUTED_STATUS_HELP} ariaLabel="Giải thích trạng thái cơ hội" />
                            </span>
                        )}
                    >
                        <select
                            className={filterControlClass}
                            value={filters.computed_status}
                            onChange={(event) => setFilters((prev) => ({ ...prev, computed_status: event.target.value }))}
                        >
                            {COMPUTED_STATUS_FILTER_OPTIONS.map((opt) => (
                                <option key={opt.value || 'all'} value={opt.value}>
                                    {opt.label}
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
                    <FilterField label="Dự kiến chốt từ">
                        <FilterDateInput
                            className={filterControlClass}
                            value={filters.expected_close_from}
                            onChange={(event) => setFilters((prev) => ({ ...prev, expected_close_from: event.target.value }))}
                        />
                    </FilterField>
                    <FilterField label="Dự kiến chốt đến">
                        <FilterDateInput
                            className={filterControlClass}
                            value={filters.expected_close_to}
                            onChange={(event) => setFilters((prev) => ({ ...prev, expected_close_to: event.target.value }))}
                        />
                    </FilterField>
                    <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                        <button type="submit" className={FILTER_SUBMIT_BUTTON_CLASS}>
                            Lọc
                        </button>
                    </FilterActionGroup>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!filters.computed_status ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600 bg-white'
                            }`}
                        onClick={() => {
                            const next = { ...filters, computed_status: '', page: 1 };
                            setFilters(next);
                            fetchOpportunities(1, next);
                        }}
                    >
                        Tất cả (lọc: {computedStatusCounts.all})
                    </button>
                    {COMPUTED_STATUS_FILTER_OPTIONS.filter((o) => o.value).map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filters.computed_status === opt.value ? 'ring-2 ring-primary/30' : ''
                                }`}
                            style={toColorStyle(computedStatusBadgeHex(opt.value))}
                            onClick={() => {
                                const next = { ...filters, computed_status: opt.value, page: 1 };
                                setFilters(next);
                                fetchOpportunities(1, next);
                            }}
                        >
                            {opt.label} ({computedStatusCounts[opt.value] || 0})
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
                description="Form cơ hội theo chuẩn CRM: khách hàng, doanh số dự kiến và người phụ trách. Trạng thái hiển thị được tính tự động."
                size="md"
            >
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
                            onChange={(id) => setForm((prev) => ({ ...prev, client_id: id, contract_id: '' }))}
                            placeholder="Chọn khách hàng"
                            clientPreview={editingOpportunityClient}
                        />
                    </Field>

                    <Field label="Hợp đồng liên kết" hint="Hợp đồng cùng khách, chưa gắn cơ hội khác hoặc đang gắn cơ hội này. Để trống nếu không liên kết.">
                        <select
                            className={filterControlClass}
                            value={form.contract_id}
                            onChange={(event) => setForm((prev) => ({ ...prev, contract_id: event.target.value }))}
                            disabled={!form.client_id}
                        >
                            <option value="">— Không chọn —</option>
                            {linkableContracts.map((ct) => (
                                <option key={ct.id} value={String(ct.id)}>
                                    {(ct.code || `CTR-${ct.id}`)} — {ct.title || '(Không tiêu đề)'}
                                </option>
                            ))}
                        </select>
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

                    <div className="md:col-span-2">
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

                    <div className="md:col-span-2">
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

                <div className="mt-2 flex flex-wrap items-center gap-3 md:col-span-2">
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
                                <th className="py-2">Hợp đồng</th>
                                <th className="py-2">Doanh số</th>
                                <th className="py-2">Nguồn</th>
                                <th className="py-2">Phụ trách</th>
                                <th className="py-2">Dự kiến chốt</th>
                                <th className="py-2 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {opportunities.map((item) => {
                                const cStatus = String(item.computed_status || '');
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
                                                style={toColorStyle(computedStatusBadgeHex(cStatus))}
                                            >
                                                {item.computed_status_label || item.computed_status || '—'}
                                            </span>
                                        </td>
                                        <td className="py-3 text-xs text-slate-700">
                                            {item.contract?.code ? (
                                                <button
                                                    type="button"
                                                    className="font-semibold text-primary hover:underline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.location.href = `/hop-dong/${item.contract.id}`;
                                                    }}
                                                >
                                                    {item.contract.code}
                                                </button>
                                            ) : (
                                                '—'
                                            )}
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
                                        <td className="py-3 text-xs text-slate-700">
                                            {item.expected_close_date ? formatVietnamDate(item.expected_close_date) : '—'}
                                        </td>
                                        <td className="py-3">
                                            <div className="flex justify-end gap-2 text-xs">
                                                {canCreate && canMutateOpportunityRow(item) ? (
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
                                                {canDelete && canMutateOpportunityRow(item) ? (
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
                                    <td className="py-8 text-center text-sm text-text-muted" colSpan={9}>
                                        Chưa có cơ hội nào theo bộ lọc hiện tại.
                                    </td>
                                </tr>
                            ) : null}

                            {loading ? (
                                <tr>
                                    <td className="py-8 text-center text-sm text-text-muted" colSpan={9}>
                                        Đang tải dữ liệu cơ hội...
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                        {!loading && (opportunityMeta.total || 0) > 0 ? (
                            <tfoot>
                                <tr className="border-t-2 border-slate-200 bg-slate-50/90 text-sm font-semibold text-slate-900">
                                    <td colSpan={4} className="py-2.5 pr-2 text-xs uppercase tracking-[0.12em] text-text-subtle">
                                        Tổng doanh số theo bộ lọc (tất cả trang)
                                    </td>
                                    <td className="py-2.5">
                                        {Number(listAggregates.revenue_total || 0).toLocaleString('vi-VN')} VNĐ
                                    </td>
                                    <td className="py-2.5 text-text-muted">—</td>
                                    <td className="py-2.5 text-text-muted">—</td>
                                    <td className="py-2.5 text-text-muted">—</td>
                                    <td className="py-2.5 text-text-muted">—</td>
                                </tr>
                            </tfoot>
                        ) : null}
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
        </PageContainer>
    );
}
