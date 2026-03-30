import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PaginationControls from '@/Components/PaginationControls';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const toColorStyle = (hex) => ({
    backgroundColor: `${hex}20`,
    color: hex,
    borderColor: `${hex}55`,
});

export default function Opportunities(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canEdit = ['admin', 'quan_ly', 'nhan_vien'].includes(userRole);
    const canManageStatuses = userRole === 'admin';

    const [leadTypes, setLeadTypes] = useState([]);
    const [clients, setClients] = useState([]);
    const [clientMeta, setClientMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [filters, setFilters] = useState({ search: '', lead_type_id: '', per_page: 20, page: 1 });
    const [loading, setLoading] = useState(true);
    const [showStatusForm, setShowStatusForm] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [statusForm, setStatusForm] = useState({
        name: '',
        color_hex: '#04BC5C',
        sort_order: 0,
    });

    const fetchData = async (pageOrFilters = filters.page, maybeFilters = filters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);
        setLoading(true);
        try {
            const [typesRes, clientsRes] = await Promise.all([
                axios.get('/api/v1/lead-types'),
                axios.get('/api/v1/crm/clients', {
                    params: {
                        lead_only: true,
                        per_page: nextFilters.per_page || 20,
                        page: nextPage,
                        ...(nextFilters.search ? { search: nextFilters.search } : {}),
                        ...(nextFilters.lead_type_id ? { lead_type_id: nextFilters.lead_type_id } : {}),
                    },
                }),
            ]);
            setLeadTypes(typesRes.data || []);
            setClients(clientsRes.data?.data || []);
            setClientMeta({
                current_page: clientsRes.data?.current_page || 1,
                last_page: clientsRes.data?.last_page || 1,
                total: clientsRes.data?.total || 0,
            });
            setFilters((prev) => ({ ...prev, page: clientsRes.data?.current_page || nextPage }));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được dữ liệu cơ hội.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const leadTypeMap = useMemo(() => {
        const map = {};
        leadTypes.forEach((type) => {
            map[type.id] = type;
        });
        return map;
    }, [leadTypes]);

    const leadTypeCounts = useMemo(() => {
        const counts = {};
        clients.forEach((client) => {
            if (!client.lead_type_id) return;
            counts[client.lead_type_id] = (counts[client.lead_type_id] || 0) + 1;
        });
        return counts;
    }, [clients]);

    const stats = useMemo(() => {
        const total = clientMeta.total || clients.length;
        const caring = clients.filter((c) => c.lead_type_id).length;
        return [
            { label: 'Tổng cơ hội', value: String(total) },
            { label: 'Có trạng thái', value: String(caring) },
            { label: 'Vai trò', value: userRole || '—' },
            { label: 'Cập nhật', value: loading ? '...' : 'OK' },
        ];
    }, [clientMeta.total, clients, userRole, loading]);

    const updateLeadType = async (client, leadTypeId) => {
        if (!canEdit) return;
        try {
            await axios.put(`/api/v1/crm/clients/${client.id}`, {
                name: client.name,
                company: client.company,
                email: client.email,
                phone: client.phone,
                notes: client.notes,
                sales_owner_id: client.sales_owner_id,
                lead_type_id: leadTypeId ? Number(leadTypeId) : null,
                lead_source: client.lead_source,
                lead_channel: client.lead_channel,
                lead_message: client.lead_message,
            });
            await fetchData(filters.page, filters);
            toast.success('Đã cập nhật trạng thái cơ hội.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Cập nhật trạng thái thất bại.');
        }
    };

    const submitStatus = async () => {
        if (!canManageStatuses) return;
        if (!statusForm.name.trim()) {
            toast.error('Vui lòng nhập tên trạng thái.');
            return;
        }
        setSavingStatus(true);
        try {
            await axios.post('/api/v1/lead-types', {
                name: statusForm.name.trim(),
                color_hex: statusForm.color_hex || '#04BC5C',
                sort_order: Number(statusForm.sort_order || 0),
            });
            setStatusForm({ name: '', color_hex: '#04BC5C', sort_order: 0 });
            setShowStatusForm(false);
            await fetchData(filters.page, filters);
            toast.success('Đã thêm trạng thái cơ hội.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thêm được trạng thái.');
        } finally {
            setSavingStatus(false);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Cơ hội bán hàng"
            description="Theo dõi khách hàng tiềm năng theo trạng thái, hiển thị dạng danh sách và tag."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 mb-6">
                <FilterToolbar
                    title="Danh sách cơ hội"
                    description="Lọc nhanh theo khách hàng tiềm năng, trạng thái và phạm vi theo dõi hiện tại."
                    actions={(
                        <FilterActionGroup>
                            {canManageStatuses && (
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                                    onClick={() => setShowStatusForm(true)}
                                >
                                    Thêm trạng thái
                                </button>
                            )}
                            <button
                                type="button"
                                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                                onClick={() => {
                                    const next = { ...filters, page: 1 };
                                    setFilters(next);
                                    fetchData(1, next);
                                }}
                            >
                                Lọc
                            </button>
                        </FilterActionGroup>
                    )}
                >
                    <FilterField label="Tìm kiếm">
                        <input
                            className={filterControlClass}
                            placeholder="Tìm theo tên, email, công ty..."
                            value={filters.search}
                            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                        />
                    </FilterField>
                    <FilterField label="Trạng thái lead">
                        <select
                            className={filterControlClass}
                            value={filters.lead_type_id}
                            onChange={(e) => setFilters((prev) => ({ ...prev, lead_type_id: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            {leadTypes.map((type) => (
                                <option key={type.id} value={type.id}>
                                    {type.name}
                                </option>
                            ))}
                        </select>
                    </FilterField>
                    <FilterField label="Ghi chú thao tác">
                        <div className="flex min-h-[48px] items-center rounded-2xl border border-dashed border-slate-200/80 px-4 py-3 text-sm text-text-muted">
                            {canEdit ? 'Chọn trạng thái ngay trong danh sách để cập nhật phễu khách hàng.' : 'Bạn đang ở chế độ chỉ xem dữ liệu.'}
                        </div>
                    </FilterField>
                </FilterToolbar>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            const next = { ...filters, lead_type_id: '', page: 1 };
                            setFilters(next);
                            fetchData(1, next);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            filters.lead_type_id === '' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600 bg-white'
                        }`}
                    >
                        Tất cả ({clients.length})
                    </button>
                    {leadTypes.map((type) => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => {
                                const next = { ...filters, lead_type_id: String(type.id), page: 1 };
                                setFilters(next);
                                fetchData(1, next);
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                String(filters.lead_type_id) === String(type.id) ? 'ring-2 ring-primary/30' : ''
                            }`}
                            style={type.color_hex ? toColorStyle(type.color_hex) : undefined}
                        >
                            {type.name} ({leadTypeCounts[type.id] || 0})
                        </button>
                    ))}
                </div>
            </div>

            {leadTypes.length === 0 ? (
                <div className="w-full rounded-2xl border border-dashed border-slate-200/80 bg-white p-8 text-center text-sm text-text-muted">
                    Chưa có trạng thái khách hàng. Vui lòng tạo trạng thái ở mục quản trị.
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                    <th className="py-2">Khách hàng</th>
                                    <th className="py-2">Trạng thái</th>
                                    <th className="py-2">Hạng</th>
                                    <th className="py-2">Phụ trách</th>
                                    <th className="py-2">Nguồn</th>
                                    <th className="py-2">Cập nhật</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clients.map((client) => {
                                    const leadType = leadTypeMap[client.lead_type_id];
                                    const assigneeName = client.assigned_staff?.name || client.sales_owner?.name || '—';
                                    return (
                                        <tr key={client.id} className="border-b border-slate-100">
                                            <td className="py-3">
                                                <div className="font-medium text-slate-900">{client.name || '—'}</div>
                                                <div className="text-xs text-text-muted">
                                                    {client.company || 'Chưa có công ty'} • {client.phone || 'Chưa có số điện thoại'}
                                                </div>
                                                <div className="text-xs text-text-muted">{client.email || 'Chưa có email'}</div>
                                                {client.lead_message && (
                                                    <div className="mt-1 text-xs text-slate-600">
                                                        {client.lead_message}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3">
                                                {leadType ? (
                                                    <span
                                                        className="rounded-full border px-2 py-1 text-xs font-semibold"
                                                        style={leadType.color_hex ? toColorStyle(leadType.color_hex) : undefined}
                                                    >
                                                        {leadType.name}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="py-3">
                                                {client.revenue_tier ? (
                                                    <span
                                                        className="rounded-full border px-2 py-1 text-xs font-semibold"
                                                        style={toColorStyle(client.revenue_tier.color_hex || '#94A3B8')}
                                                    >
                                                        {client.revenue_tier.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 text-xs text-text-muted">{assigneeName}</td>
                                            <td className="py-3 text-xs text-text-muted">
                                                {client.lead_source || '—'} {client.lead_channel ? `• ${client.lead_channel}` : ''}
                                            </td>
                                            <td className="py-3">
                                                {canEdit ? (
                                                    <select
                                                        className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                                        value={client.lead_type_id || ''}
                                                        onChange={(e) => updateLeadType(client, e.target.value)}
                                                    >
                                                        {leadTypes.map((item) => (
                                                            <option key={item.id} value={item.id}>
                                                                {item.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {clients.length === 0 && (
                                    <tr>
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={6}>
                                            Chưa có cơ hội nào theo bộ lọc hiện tại.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls
                        page={clientMeta.current_page}
                        lastPage={clientMeta.last_page}
                        total={clientMeta.total}
                        perPage={filters.per_page}
                        label="cơ hội"
                        loading={loading}
                        onPageChange={(page) => fetchData(page, filters)}
                        onPerPageChange={(perPage) => {
                            const next = { ...filters, per_page: perPage, page: 1 };
                            setFilters(next);
                            fetchData(1, next);
                        }}
                    />
                </div>
            )}

            <Modal
                open={showStatusForm}
                onClose={() => setShowStatusForm(false)}
                title="Thêm trạng thái cơ hội"
                description="Chỉ admin có quyền thêm trạng thái để dùng chung trong toàn hệ thống."
                size="sm"
            >
                <div className="space-y-4 text-sm">
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                            Tên trạng thái *
                        </label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: Chờ chăm sóc"
                            value={statusForm.name}
                            onChange={(e) => setStatusForm((prev) => ({ ...prev, name: e.target.value }))}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                Màu tag
                            </label>
                            <input
                                type="color"
                                className="h-11 w-full rounded-2xl border border-slate-200/80 p-1"
                                value={statusForm.color_hex}
                                onChange={(e) => setStatusForm((prev) => ({ ...prev, color_hex: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                Thứ tự
                            </label>
                            <input
                                type="number"
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={statusForm.sort_order}
                                onChange={(e) => setStatusForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                            disabled={savingStatus}
                            onClick={submitStatus}
                        >
                            {savingStatus ? 'Đang lưu...' : 'Lưu trạng thái'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                            onClick={() => setShowStatusForm(false)}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
