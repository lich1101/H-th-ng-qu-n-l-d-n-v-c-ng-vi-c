import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
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

    const [leadTypes, setLeadTypes] = useState([]);
    const [clients, setClients] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedLead, setSelectedLead] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [typesRes, clientsRes] = await Promise.all([
                axios.get('/api/v1/lead-types'),
                axios.get('/api/v1/crm/clients', { params: { lead_only: true, per_page: 200 } }),
            ]);
            setLeadTypes(typesRes.data || []);
            setClients(clientsRes.data?.data || []);
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

    const searchFilteredClients = useMemo(() => {
        return clients.filter((client) => {
            if (!search.trim()) return true;
            const keyword = search.trim().toLowerCase();
            return (
                (client.name || '').toLowerCase().includes(keyword) ||
                (client.company || '').toLowerCase().includes(keyword) ||
                (client.email || '').toLowerCase().includes(keyword) ||
                (client.phone || '').toLowerCase().includes(keyword)
            );
        });
    }, [clients, search]);

    const filteredClients = useMemo(() => {
        return searchFilteredClients.filter((client) => {
            if (selectedLead && String(client.lead_type_id) !== String(selectedLead)) {
                return false;
            }
            return true;
        });
    }, [searchFilteredClients, selectedLead]);

    const leadTypeMap = useMemo(() => {
        const map = {};
        leadTypes.forEach((type) => {
            map[type.id] = type;
        });
        return map;
    }, [leadTypes]);

    const leadTypeCounts = useMemo(() => {
        const counts = {};
        searchFilteredClients.forEach((client) => {
            if (!client.lead_type_id) return;
            counts[client.lead_type_id] = (counts[client.lead_type_id] || 0) + 1;
        });
        return counts;
    }, [searchFilteredClients]);

    const stats = useMemo(() => {
        const total = filteredClients.length;
        const caring = filteredClients.filter((c) => c.lead_type_id).length;
        return [
            { label: 'Tổng cơ hội', value: String(total) },
            { label: 'Có trạng thái', value: String(caring) },
            { label: 'Vai trò', value: userRole || '—' },
            { label: 'Cập nhật', value: loading ? '...' : 'OK' },
        ];
    }, [filteredClients, userRole, loading]);

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
            setClients((prev) =>
                prev.map((item) =>
                    item.id === client.id ? { ...item, lead_type_id: Number(leadTypeId) } : item
                )
            );
            toast.success('Đã cập nhật trạng thái cơ hội.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Cập nhật trạng thái thất bại.');
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
                            <button
                                type="button"
                                onClick={fetchData}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Làm mới
                            </button>
                        </FilterActionGroup>
                    )}
                >
                    <FilterField label="Tìm kiếm">
                        <input
                            className={filterControlClass}
                            placeholder="Tìm theo tên, email, công ty..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </FilterField>
                    <FilterField label="Trạng thái lead">
                        <select
                            className={filterControlClass}
                            value={selectedLead}
                            onChange={(e) => setSelectedLead(e.target.value)}
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
                        onClick={() => setSelectedLead('')}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            selectedLead === '' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600 bg-white'
                        }`}
                    >
                        Tất cả ({searchFilteredClients.length})
                    </button>
                    {leadTypes.map((type) => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => setSelectedLead(String(type.id))}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                String(selectedLead) === String(type.id) ? 'ring-2 ring-primary/30' : ''
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
                                {filteredClients.map((client) => {
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
                                {filteredClients.length === 0 && (
                                    <tr>
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={6}>
                                            Chưa có cơ hội nào theo bộ lọc hiện tại.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </PageContainer>
    );
}
