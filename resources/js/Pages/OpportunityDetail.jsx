import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { filterControlClass } from '@/Components/FilterToolbar';
import ClientSelect from '@/Components/ClientSelect';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate, toDateInputValue } from '@/lib/vietnamTime';

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

const emptyForm = {
    title: '',
    opportunity_type: '',
    client_id: '',
    status: '',
    source: '',
    amount: '',
    success_probability: '',
    product_id: '',
    assigned_to: '',
    watcher_ids: [],
    expected_close_date: '',
    notes: '',
};

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

const formatDate = (value) => formatVietnamDate(value, '—');
const formatCurrency = (value) => `${Number(value || 0).toLocaleString('vi-VN')} VNĐ`;

export default function OpportunityDetail({ auth, opportunityId }) {
    const toast = useToast();
    const userRole = String(auth?.user?.role || '').toLowerCase();
    const currentUserId = Number(auth?.user?.id || 0) || null;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);

    const [opportunity, setOpportunity] = useState(null);
    const [users, setUsers] = useState([]);
    const [products, setProducts] = useState([]);
    const [statusOptions, setStatusOptions] = useState([]);
    const [form, setForm] = useState(emptyForm);

    const statusMap = useMemo(() => {
        return (statusOptions || []).reduce((acc, option) => {
            const code = String(option?.code || '');
            if (!code) return acc;
            acc[code] = option;
            return acc;
        }, {});
    }, [statusOptions]);

    const opportunityStatusCode = String(opportunity?.status || opportunity?.computed_status || '');
    const opportunityStatusLabel = String(
        opportunity?.status_label
        || opportunity?.computed_status_label
        || opportunityStatusCode
        || '—',
    );
    const opportunityStatusHex = String(
        opportunity?.status_color_hex
        || statusMap?.[opportunityStatusCode]?.color_hex
        || '#64748B',
    );

    const canEdit = useMemo(() => {
        if (['admin', 'administrator', 'ke_toan', 'quan_ly'].includes(userRole)) {
            return true;
        }
        if (userRole !== 'nhan_vien') {
            return false;
        }
        const uid = Number(currentUserId || 0);
        if (!uid) return false;
        const assignedId = Number(opportunity?.client?.assigned_staff_id ?? 0);
        return assignedId > 0 && assignedId === uid;
    }, [userRole, opportunity, currentUserId]);

    const stats = useMemo(() => ([
        { label: 'Khách hàng', value: opportunity?.client?.name || '—' },
        { label: 'Trạng thái', value: opportunityStatusLabel },
        { label: 'Phụ trách', value: opportunity?.assignee?.name || opportunity?.creator?.name || '—' },
        { label: 'Doanh số', value: formatCurrency(opportunity?.amount || 0) },
    ]), [opportunity, opportunityStatusLabel]);

    const watcherOptions = useMemo(() => (
        users.map((user) => ({
            id: Number(user?.id || 0),
            label: user?.name || `Nhân sự #${user?.id}`,
            meta: [user?.role, user?.email].filter(Boolean).join(' • '),
        })).filter((user) => user.id > 0)
    ), [users]);

    const hydrateForm = (item) => {
        if (!item) {
            setForm(emptyForm);
            return;
        }
        setForm({
            title: item.title || '',
            opportunity_type: item.opportunity_type || '',
            client_id: item.client_id ? String(item.client_id) : '',
            status: item.status ? String(item.status) : '',
            source: item.source || '',
            amount: item.amount !== null && item.amount !== undefined ? String(item.amount) : '',
            success_probability: item.success_probability != null && item.success_probability !== ''
                ? String(item.success_probability)
                : '',
            product_id: (item.product_id ?? item.product?.id) ? String(item.product_id ?? item.product?.id) : '',
            assigned_to: item.assigned_to ? String(item.assigned_to) : '',
            watcher_ids: Array.isArray(item.watcher_ids)
                ? item.watcher_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
                : [],
            expected_close_date: toDateInputValue(item.expected_close_date),
            notes: item.notes || '',
        });
    };

    const fetchDetail = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/opportunities/${opportunityId}`);
            setOpportunity(res.data || null);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được chi tiết cơ hội.');
            setOpportunity(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchLookups = async () => {
        try {
            const [userRes, productRes, statusRes] = await Promise.all([
                axios.get('/api/v1/users/lookup', { params: { purpose: 'operational_assignee' } }),
                axios.get('/api/v1/products', { params: { per_page: 300, page: 1 } }),
                axios.get('/api/v1/opportunity-statuses').catch(() => ({ data: [] })),
            ]);
            setUsers(userRes.data?.data || []);
            setProducts(productRes.data?.data || []);
            setStatusOptions(Array.isArray(statusRes.data) ? statusRes.data : []);
        } catch {
            // ignore lookup failure, detail is still usable
        }
    };

    useEffect(() => {
        fetchDetail();
        fetchLookups();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opportunityId]);

    const openEditModal = () => {
        hydrateForm(opportunity);
        setShowEditModal(true);
    };

    const submitEdit = async () => {
        if (!opportunity?.id) return;
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
        setSaving(true);
        try {
            await axios.put(`/api/v1/opportunities/${opportunity.id}`, {
                title: String(form.title || '').trim(),
                opportunity_type: String(form.opportunity_type || '').trim() || null,
                client_id: Number(form.client_id),
                status: String(form.status || '').trim() || null,
                source: String(form.source || '').trim() || null,
                amount: amountParsed,
                success_probability: probParsed,
                product_id: form.product_id ? Number(form.product_id) : null,
                assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
                watcher_ids: (form.watcher_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
                expected_close_date: form.expected_close_date || null,
                notes: String(form.notes || '').trim() || null,
            });
            toast.success('Đã cập nhật cơ hội.');
            setShowEditModal(false);
            await fetchDetail();
        } catch (error) {
            const message = error?.response?.data?.message || 'Cập nhật cơ hội thất bại.';
            const validation = error?.response?.data?.errors
                ? Object.values(error.response.data.errors).flat().join(' ')
                : '';
            toast.error(message === 'The given data was invalid.' && validation ? validation : message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <PageContainer
            auth={auth}
            title="Chi tiết cơ hội"
            description="Theo dõi thông tin cơ hội, liên kết khách hàng/hợp đồng và cập nhật trực tiếp tại màn hình chi tiết."
            stats={stats}
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                        onClick={() => { window.location.href = route('opportunities.index'); }}
                    >
                        Quay lại danh sách
                    </button>
                    {canEdit ? (
                        <button
                            type="button"
                            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                            onClick={openEditModal}
                            disabled={!opportunity}
                        >
                            Sửa cơ hội
                        </button>
                    ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    {loading ? (
                        <div className="py-10 text-center text-sm text-text-muted">Đang tải chi tiết cơ hội...</div>
                    ) : !opportunity ? (
                        <div className="py-10 text-center text-sm text-text-muted">Không tìm thấy cơ hội.</div>
                    ) : (
                        <div className="space-y-5">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-900">{opportunity.title || '—'}</h2>
                                <p className="mt-1 text-sm text-slate-500">{opportunity.opportunity_type || 'Chưa phân loại'} • {opportunity.source || 'Chưa có nguồn'}</p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Trạng thái</div>
                                    <span className="mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold" style={toColorStyle(opportunityStatusHex)}>
                                        {opportunityStatusLabel}
                                    </span>
                                </div>
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Doanh số</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(opportunity.amount || 0)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Khả năng thành công</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-900">{Number(opportunity.success_probability || 0)}%</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Dự kiến chốt</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-900">{formatDate(opportunity.expected_close_date)}</div>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200/80 p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Khách hàng</div>
                                    {opportunity.client?.id ? (
                                        <button
                                            type="button"
                                            className="mt-2 text-left text-sm font-semibold text-primary hover:underline"
                                            onClick={() => { window.location.href = route('crm.flow', opportunity.client.id); }}
                                        >
                                            {opportunity.client.name || `KH #${opportunity.client.id}`}
                                        </button>
                                    ) : (
                                        <div className="mt-2 text-sm text-slate-700">—</div>
                                    )}
                                    <p className="mt-1 text-xs text-slate-500">{opportunity.client?.company || '—'} • {opportunity.client?.phone || '—'}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200/80 p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Nhân sự phụ trách</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-900">{opportunity.assignee?.name || opportunity.creator?.name || '—'}</div>
                                    <p className="mt-1 text-xs text-slate-500">Người tạo: {opportunity.creator?.name || '—'}</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/80 p-4">
                                <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Ghi chú</div>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{opportunity.notes || 'Chưa có ghi chú.'}</p>
                            </div>

                            <div className="rounded-2xl border border-slate-200/80 p-4">
                                <div className="mb-2 text-xs uppercase tracking-[0.14em] text-text-subtle">Hợp đồng liên kết</div>
                                {opportunity.contract?.id ? (
                                    <button
                                        type="button"
                                        className="text-left text-sm font-semibold text-primary hover:underline"
                                        onClick={() => { window.location.href = route('contracts.detail', opportunity.contract.id); }}
                                    >
                                        {opportunity.contract.code || `HD-${opportunity.contract.id}`}
                                        {opportunity.contract.title ? ` — ${opportunity.contract.title}` : ''}
                                    </button>
                                ) : (
                                    <div className="text-sm text-text-muted">Chưa có hợp đồng liên kết.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                title={`Sửa cơ hội #${opportunity?.id || ''}`}
                description="Cập nhật thông tin cơ hội trực tiếp từ trang chi tiết."
                size="md"
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Tên cơ hội" required>
                        <input
                            className={filterControlClass}
                            value={form.title}
                            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                        />
                    </Field>
                    <Field label="Nguồn cơ hội">
                        <input
                            className={filterControlClass}
                            value={form.source}
                            onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                        />
                    </Field>
                    <Field label="Loại cơ hội">
                        <input
                            className={filterControlClass}
                            value={form.opportunity_type}
                            onChange={(event) => setForm((prev) => ({ ...prev, opportunity_type: event.target.value }))}
                        />
                    </Field>
                    <Field label="Trạng thái cơ hội">
                        <select
                            className={filterControlClass}
                            value={form.status}
                            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            <option value="">Chọn trạng thái</option>
                            {statusOptions.map((option) => (
                                <option key={option.code} value={option.code}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Doanh số dự kiến (VNĐ)" required>
                        <input
                            type="number"
                            min="0"
                            className={filterControlClass}
                            value={form.amount}
                            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                            required
                        />
                    </Field>
                    <Field label="Khách hàng" required>
                        <ClientSelect
                            className="bg-white"
                            value={form.client_id}
                            onChange={(id) => setForm((prev) => ({ ...prev, client_id: id }))}
                            placeholder="Chọn khách hàng"
                            clientPreview={opportunity?.client}
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
                    <Field label="Người quản lý/phụ trách">
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
                                options={watcherOptions}
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
                            />
                        </Field>
                    </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 md:col-span-2">
                    <button
                        type="button"
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                        onClick={submitEdit}
                        disabled={saving}
                    >
                        {saving ? 'Đang lưu...' : 'Lưu cập nhật'}
                    </button>
                    <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                        onClick={() => setShowEditModal(false)}
                    >
                        Đóng
                    </button>
                </div>
            </Modal>
        </PageContainer>
    );
}
