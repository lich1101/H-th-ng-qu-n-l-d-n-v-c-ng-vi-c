import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import ClientStaffTransferPendingBanner from '@/Components/ClientStaffTransferPendingBanner';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDateTime } from '@/lib/vietnamTime';

export default function CustomerDetail({ auth, clientId }) {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [flow, setFlow] = useState(null);
    const [transferActionLoading, setTransferActionLoading] = useState(false);
    const myUserId = Number(auth?.user?.id || 0);
    const normalizedRole = String(auth?.user?.role || '').toLowerCase();

    const fetchFlow = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/crm/clients/${clientId}/flow`);
            setFlow(res.data || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được chi tiết khách hàng.');
            setFlow(null);
        } finally {
            setLoading(false);
        }
    }, [clientId, toast]);

    useEffect(() => {
        fetchFlow();
    }, [fetchFlow]);

    const actOnPendingTransfer = async (action) => {
        const pt = flow?.pending_staff_transfer;
        if (!pt?.id) return;
        let rejectionNote = null;
        if (action === 'reject') {
            rejectionNote = window.prompt('Lý do từ chối (tuỳ chọn):') || null;
        }
        if (action === 'cancel' && !window.confirm('Hủy phiếu chuyển phụ trách này?')) {
            return;
        }
        setTransferActionLoading(true);
        try {
            if (action === 'accept') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${pt.id}/accept`);
            } else if (action === 'reject') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${pt.id}/reject`, { rejection_note: rejectionNote });
            } else if (action === 'cancel') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${pt.id}/cancel`);
            }
            toast.success('Đã cập nhật phiếu chuyển phụ trách.');
            await fetchFlow();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thực hiện được.');
        } finally {
            setTransferActionLoading(false);
        }
    };

    const client = flow?.client;
    const rotation = flow?.client_rotation;
    const rotationHistory = Array.isArray(flow?.rotation_history) ? flow.rotation_history : [];

    return (
        <PageContainer
            auth={auth}
            title="Chi tiết khách hàng"
            description="Xử lý phiếu chuyển phụ trách và xem nhanh thông tin. Luồng đầy đủ (cơ hội, hợp đồng, dự án…) nằm ở trang luồng."
        >
            <div className="space-y-5">
                {loading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                        Đang tải…
                    </div>
                ) : (
                    <>
                        <ClientStaffTransferPendingBanner
                            transfer={flow?.pending_staff_transfer}
                            myUserId={myUserId}
                            normalizedRole={normalizedRole}
                            loading={transferActionLoading}
                            density="emphasized"
                            onAction={actOnPendingTransfer}
                        />

                        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Khách hàng</p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{client?.name || '—'}</h1>
                            <p className="mt-1 text-sm text-slate-600">
                                {client?.company || 'Chưa có công ty'}
                                {' • '}
                                {client?.phone || 'Chưa có số điện thoại'}
                            </p>
                            {client?.email ? (
                                <p className="mt-1 text-sm text-slate-600">{client.email}</p>
                            ) : null}

                            <div className="mt-6 flex flex-wrap gap-3">
                                <a
                                    href={route('crm.flow', clientId)}
                                    className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
                                >
                                    Mở luồng khách hàng đầy đủ
                                </a>
                                <a
                                    href={route('crm.index')}
                                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    ← Danh sách khách hàng
                                </a>
                            </div>
                        </div>

                        {rotation ? (
                            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Theo dõi xoay khách</p>
                                        <h2 className="mt-2 text-lg font-semibold text-slate-900">{rotation.status_label || 'Chưa có trạng thái'}</h2>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {rotation.trigger_label || rotation.protecting_label || 'Khách chỉ bị xoay khi đồng thời quá hạn bình luận, cơ hội và hợp đồng theo cấu hình hiện tại.'}
                                        </p>
                                    </div>
                                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                        rotation.eligible_for_auto_rotation
                                            ? 'bg-rose-100 text-rose-700'
                                            : rotation.warning_due
                                                ? 'bg-amber-100 text-amber-700'
                                                : rotation.in_scope
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-100 text-slate-700'
                                    }`}>
                                        {rotation.eligible_for_auto_rotation
                                            ? 'Đủ điều kiện xoay'
                                            : rotation.warning_due
                                                ? `Còn ${rotation.days_until_rotation || 0} ngày`
                                                : rotation.in_scope
                                                    ? 'Đang theo dõi'
                                                    : 'Ngoài phạm vi'}
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-slate-500">Bình luận / ghi chú gần nhất</div>
                                        <div className="mt-1 text-lg font-semibold text-slate-900">{rotation.days_since_comment ?? '—'} ngày</div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            Mốc xoay: {rotation.thresholds?.comment_stale_days ?? '—'} ngày
                                        </div>
                                        <div className="mt-1 text-xs text-slate-400">
                                            Tính từ: {rotation.effective_comment_at ? formatVietnamDateTime(rotation.effective_comment_at) : '—'}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-slate-500">Cơ hội gần nhất</div>
                                        <div className="mt-1 text-lg font-semibold text-slate-900">{rotation.days_since_opportunity ?? '—'} ngày</div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            Mốc xoay: {rotation.thresholds?.opportunity_stale_days ?? '—'} ngày
                                        </div>
                                        <div className="mt-1 text-xs text-slate-400">
                                            Tính từ: {rotation.effective_opportunity_at ? formatVietnamDateTime(rotation.effective_opportunity_at) : '—'}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-slate-500">Hợp đồng gần nhất</div>
                                        <div className="mt-1 text-lg font-semibold text-slate-900">{rotation.days_since_contract ?? '—'} ngày</div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            Mốc xoay: {rotation.thresholds?.contract_stale_days ?? '—'} ngày
                                        </div>
                                        <div className="mt-1 text-xs text-slate-400">
                                            Tính từ: {rotation.effective_contract_at ? formatVietnamDateTime(rotation.effective_contract_at) : '—'}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200/80 px-4 py-3">
                                        <div className="text-xs text-slate-500">Mốc reset chung</div>
                                        <div className="mt-1 text-sm font-semibold text-slate-900">
                                            {rotation.rotation_anchor_at ? formatVietnamDateTime(rotation.rotation_anchor_at) : '—'}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            {rotation.rotation_anchor_label || 'Hệ thống lấy mốc reset hiện tại để tính lại các ngày quá hạn.'}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 px-4 py-3">
                                        <div className="text-xs text-slate-500">Ưu tiên khi đưa vào hàng chờ xoay</div>
                                        <div className="mt-1 text-sm font-semibold text-slate-900">
                                            {rotation.priority_label || 'Khách tiềm năng thuần'}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            {rotation.priority_rule_label || 'Ưu tiên số hợp đồng giảm dần, nếu bằng nhau thì xét số cơ hội; nếu cả hai đều là khách tiềm năng thì random.'}
                                        </div>
                                    </div>
                                </div>

                                {flow?.permissions?.can_view_rotation_history ? (
                                    <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className="text-sm font-semibold text-slate-900">Lịch sử điều chuyển</h3>
                                            <span className="text-xs text-slate-500">{rotationHistory.length} bản ghi</span>
                                        </div>
                                        <div className="mt-3 space-y-2">
                                            {rotationHistory.length === 0 ? (
                                                <div className="text-sm text-slate-500">Khách hàng này chưa có lịch sử điều chuyển.</div>
                                            ) : rotationHistory.slice(0, 5).map((row) => (
                                                <div key={row.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                                    <div className="text-sm font-semibold text-slate-900">{row.action_label || 'Điều chuyển'}</div>
                                                    <div className="mt-1 text-xs text-slate-600">
                                                        {row.from_staff?.name || 'Chưa rõ'} → {row.to_staff?.name || 'Chưa rõ'} • {formatVietnamDateTime(row.transferred_at)}
                                                    </div>
                                                    {row.note ? <div className="mt-1 text-xs text-slate-500">{row.note}</div> : null}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </PageContainer>
    );
}
