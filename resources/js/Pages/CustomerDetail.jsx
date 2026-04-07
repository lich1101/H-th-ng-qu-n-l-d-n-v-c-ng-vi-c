import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import ClientStaffTransferPendingBanner from '@/Components/ClientStaffTransferPendingBanner';
import { useToast } from '@/Contexts/ToastContext';

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
                    </>
                )}
            </div>
        </PageContainer>
    );
}
