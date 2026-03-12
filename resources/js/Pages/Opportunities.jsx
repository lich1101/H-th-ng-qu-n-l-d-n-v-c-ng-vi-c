import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
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

    const filteredClients = useMemo(() => {
        return clients.filter((client) => {
            if (selectedLead && String(client.lead_type_id) !== String(selectedLead)) {
                return false;
            }
            if (!search.trim()) return true;
            const keyword = search.trim().toLowerCase();
            return (
                (client.name || '').toLowerCase().includes(keyword) ||
                (client.company || '').toLowerCase().includes(keyword) ||
                (client.email || '').toLowerCase().includes(keyword) ||
                (client.phone || '').toLowerCase().includes(keyword)
            );
        });
    }, [clients, search, selectedLead]);

    const groupedClients = useMemo(() => {
        return leadTypes.map((type) => ({
            ...type,
            items: filteredClients.filter((client) => client.lead_type_id === type.id),
        }));
    }, [leadTypes, filteredClients]);

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
            description="Theo dõi khách hàng tiềm năng theo từng trạng thái và pipeline chăm sóc."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 mb-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Pipeline trạng thái</h3>
                        <p className="text-sm text-text-muted">
                            Kéo lọc nhanh theo trạng thái và tìm kiếm khách hàng.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={fetchData}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        Làm mới
                    </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                        placeholder="Tìm theo tên, email, công ty..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
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
                    <div className="rounded-2xl border border-dashed border-slate-200/80 px-3 py-2 text-xs text-text-muted">
                        {canEdit ? 'Chọn trạng thái trong thẻ khách hàng để cập nhật.' : 'Chỉ xem dữ liệu.'}
                    </div>
                </div>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4">
                {groupedClients.map((type) => (
                    <div key={type.id} className="min-w-[260px] max-w-[320px] flex-1">
                        <div
                            className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card"
                            style={type.color_hex ? toColorStyle(type.color_hex) : undefined}
                        >
                            <div>
                                <p className="text-sm font-semibold">{type.name}</p>
                                <p className="text-xs opacity-80">{type.items.length} khách hàng</p>
                            </div>
                            <span className="text-xs font-semibold">{type.items.length}</span>
                        </div>
                        <div className="mt-3 space-y-3">
                            {type.items.map((client) => (
                                <div key={client.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-slate-900">{client.name}</p>
                                            <p className="text-xs text-text-muted">{client.company || 'Chưa có công ty'}</p>
                                        </div>
                                        {client.revenue_tier && (
                                            <span
                                                className="rounded-full border px-2 py-1 text-[11px] font-semibold"
                                                style={toColorStyle(client.revenue_tier.color_hex || '#94A3B8')}
                                            >
                                                {client.revenue_tier.label}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-3 space-y-1 text-xs text-text-muted">
                                        <p>{client.phone || 'Chưa có số điện thoại'}</p>
                                        <p>{client.email || 'Chưa có email'}</p>
                                        {client.lead_source && (
                                            <p>
                                                Nguồn: {client.lead_source} • {client.lead_channel || 'Không có'}
                                            </p>
                                        )}
                                    </div>
                                    {client.lead_message && (
                                        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                            {client.lead_message}
                                        </div>
                                    )}
                                    {canEdit && (
                                        <div className="mt-3">
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
                                        </div>
                                    )}
                                </div>
                            ))}
                            {type.items.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-3 py-4 text-center text-xs text-text-muted">
                                    Chưa có khách hàng ở trạng thái này.
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {groupedClients.length === 0 && (
                    <div className="w-full rounded-2xl border border-dashed border-slate-200/80 bg-white p-8 text-center text-sm text-text-muted">
                        Chưa có trạng thái khách hàng. Vui lòng tạo trạng thái ở mục quản trị.
                    </div>
                )}
            </div>
        </PageContainer>
    );
}
