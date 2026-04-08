import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from '@inertiajs/inertia-react';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate } from '@/lib/vietnamTime';

function StatusBadge({ status }) {
    const normalized = String(status || '').toLowerCase();
    const className = normalized === 'pending'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : normalized === 'accepted'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : normalized === 'rejected'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-slate-50 text-slate-700';
    const label = normalized === 'pending'
        ? 'Chờ xử lý'
        : normalized === 'accepted'
            ? 'Đã chấp nhận'
            : normalized === 'rejected'
                ? 'Đã từ chối'
                : normalized === 'cancelled'
                    ? 'Đã hủy'
                    : (status || '—');

    return (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
            {label}
        </span>
    );
}

export default function ClientStaffTransfers() {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actingId, setActingId] = useState(null);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/crm/staff-transfer-requests');
            setRows(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được danh sách phiếu chuyển phụ trách.');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const stats = useMemo(() => {
        const pending = rows.filter((row) => String(row.status || '') === 'pending').length;
        const departments = new Set(rows.map((row) => String(row?.client?.id || row?.client_id || ''))).size;
        return [
            { label: 'Phiếu đang chờ', value: String(pending) },
            { label: 'Tổng phiếu đang hiển thị', value: String(rows.length) },
            { label: 'Khách hàng liên quan', value: String(departments) },
        ];
    }, [rows]);

    const act = async (row, action) => {
        if (!row?.id || actingId) return;
        let rejectionNote = null;
        if (action === 'reject') {
            rejectionNote = window.prompt('Lý do từ chối (tuỳ chọn):') || null;
        }
        if (action === 'cancel' && !window.confirm('Hủy phiếu chuyển phụ trách này?')) {
            return;
        }

        setActingId(Number(row.id));
        try {
            if (action === 'accept') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${row.id}/accept`);
            } else if (action === 'reject') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${row.id}/reject`, { rejection_note: rejectionNote });
            } else if (action === 'cancel') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${row.id}/cancel`);
            }
            toast.success('Đã cập nhật phiếu chuyển phụ trách.');
            await fetchRows();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể xử lý phiếu chuyển phụ trách.');
        } finally {
            setActingId(null);
        }
    };

    return (
        <PageContainer
            title="Phiếu chuyển phụ trách"
            subtitle="Theo dõi toàn bộ phiếu chuyển giao khách hàng đang chờ xử lý và thao tác nhanh ngay trên một màn hình."
            stats={stats}
        >
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-900">Danh sách phiếu</h3>
                    <p className="mt-1 text-xs text-text-muted">
                        Mỗi phiếu đều dẫn về khách hàng và trang luồng để kiểm tra nghiệp vụ chi tiết.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-text-subtle">
                                <th className="py-3 pr-3">Khách hàng</th>
                                <th className="py-3 pr-3">Từ</th>
                                <th className="py-3 pr-3">Đến</th>
                                <th className="py-3 pr-3">Người tạo phiếu</th>
                                <th className="py-3 pr-3">Trạng thái</th>
                                <th className="py-3 pr-3">Ghi chú</th>
                                <th className="py-3 pr-3">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const permissions = row?.permissions || {};
                                const isActing = Number(actingId) === Number(row.id);
                                return (
                                    <tr key={row.id} className="border-b border-slate-100 align-top">
                                        <td className="py-3 pr-3">
                                            <div className="font-medium text-slate-900">{row?.client?.name || `Khách hàng #${row.client_id}`}</div>
                                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-muted">
                                                <Link href={route('crm.client.show', row.client_id)} className="text-primary hover:underline">
                                                    Mở khách hàng
                                                </Link>
                                                <Link href={route('crm.flow', row.client_id)} className="text-primary hover:underline">
                                                    Xem luồng khách
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="py-3 pr-3 text-xs text-slate-700">
                                            {row?.from_staff?.name || '—'}
                                        </td>
                                        <td className="py-3 pr-3 text-xs text-slate-700">
                                            {row?.to_staff?.name || '—'}
                                        </td>
                                        <td className="py-3 pr-3 text-xs text-slate-700">
                                            <div>{row?.requested_by?.name || '—'}</div>
                                            <div className="mt-1 text-text-muted">{formatVietnamDate(row?.responded_at || row?.cancelled_at || null, '') || 'Đang chờ phản hồi'}</div>
                                        </td>
                                        <td className="py-3 pr-3">
                                            <StatusBadge status={row?.status} />
                                        </td>
                                        <td className="py-3 pr-3 text-xs text-text-muted">
                                            {row?.note || row?.rejection_note || '—'}
                                        </td>
                                        <td className="py-3 pr-3">
                                            <div className="flex flex-wrap gap-2">
                                                {permissions.can_accept && (
                                                    <button
                                                        type="button"
                                                        onClick={() => act(row, 'accept')}
                                                        disabled={isActing}
                                                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                    >
                                                        Chấp nhận
                                                    </button>
                                                )}
                                                {permissions.can_reject && (
                                                    <button
                                                        type="button"
                                                        onClick={() => act(row, 'reject')}
                                                        disabled={isActing}
                                                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                                                    >
                                                        Từ chối
                                                    </button>
                                                )}
                                                {permissions.can_cancel && (
                                                    <button
                                                        type="button"
                                                        onClick={() => act(row, 'cancel')}
                                                        disabled={isActing}
                                                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                    >
                                                        Hủy phiếu
                                                    </button>
                                                )}
                                                {!permissions.can_accept && !permissions.can_reject && !permissions.can_cancel && (
                                                    <span className="text-xs text-text-muted">Chỉ xem</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {rows.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={7} className="py-10 text-center text-sm text-text-muted">
                                        Hiện chưa có phiếu chuyển phụ trách nào đang chờ xử lý.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageContainer>
    );
}
