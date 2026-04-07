import React from 'react';

/**
 * Quyền xử lý phiếu chuyển phụ trách (khớp logic ClientFlow).
 */
export function getClientTransferPendingPermissions(pt, myUserId, normalizedRole) {
    if (!pt || String(pt.status || '').toLowerCase() !== 'pending') {
        return {
            transferPending: false,
            iAmReceiver: false,
            canCancelTransfer: false,
            canAcceptOrRejectTransfer: false,
            accessMode: 'full',
        };
    }

    const myId = Number(myUserId || 0);
    const iAmReceiver = Number(pt?.to_staff?.id) === myId;
    const iAmRequesterSide = Number(pt?.requested_by?.id) === myId
        || Number(pt?.from_staff?.id) === myId;
    const iAmAdmin = ['admin', 'administrator'].includes(normalizedRole);
    const iAmManager = normalizedRole === 'quan_ly';
    const canCancelTransfer = iAmRequesterSide || iAmAdmin || iAmManager;
    const canAcceptOrRejectTransfer = iAmReceiver || iAmAdmin || iAmManager;
    const accessMode = (iAmReceiver && !iAmAdmin && !iAmManager)
        ? 'transfer_receiver_pending'
        : 'full';

    return {
        transferPending: true,
        iAmReceiver,
        canCancelTransfer,
        canAcceptOrRejectTransfer,
        accessMode,
    };
}

/**
 * @param {object} props
 * @param {object|null} props.transfer — pending_staff_transfer từ API
 * @param {number} props.myUserId
 * @param {string} props.normalizedRole
 * @param {boolean} props.loading
 * @param {'compact'|'emphasized'} props.density
 * @param {(action: 'accept'|'reject'|'cancel') => void} props.onAction
 */
export default function ClientStaffTransferPendingBanner({
    transfer: pt,
    myUserId,
    normalizedRole,
    loading = false,
    density = 'compact',
    onAction,
}) {
    const {
        transferPending,
        canCancelTransfer,
        canAcceptOrRejectTransfer,
        accessMode,
    } = getClientTransferPendingPermissions(pt, myUserId, normalizedRole);

    if (!transferPending) {
        return null;
    }

    const isEmphasized = density === 'emphasized' || accessMode === 'transfer_receiver_pending';
    const btnSm = isEmphasized
        ? 'rounded-xl px-4 py-2 text-sm font-semibold'
        : 'rounded-lg px-3 py-1.5 text-xs font-semibold';

    if (accessMode === 'transfer_receiver_pending') {
        return (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm">
                <p className="font-semibold text-sm">Phiếu chuyển phụ trách chờ bạn xác nhận</p>
                <p className="mt-1 text-sm">
                    Từ <span className="font-semibold">{pt?.from_staff?.name || '—'}</span>
                    {' → '}
                    <span className="font-semibold">{pt?.to_staff?.name || '—'}</span>
                    {pt?.note ? <span className="mt-2 block text-amber-900/90">Ghi chú: {pt.note}</span> : null}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => onAction?.('accept')}
                        className={`${btnSm} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}
                    >
                        Chấp nhận phụ trách
                    </button>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => onAction?.('reject')}
                        className={`${btnSm} border border-amber-400 bg-white text-amber-900 hover:bg-amber-100 disabled:opacity-60`}
                    >
                        Từ chối
                    </button>
                </div>
                <p className="mt-2 text-xs text-amber-900/80">
                    Trước khi chấp nhận, bạn chưa thể thao tác đầy đủ trên khách hàng này (chỉ xử lý phiếu).
                </p>
            </div>
        );
    }

    return (
        <div className={`rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950 ${isEmphasized ? 'p-5' : ''}`}>
            <p className="font-semibold">Phiếu chuyển phụ trách đang chờ xử lý</p>
            <p className="mt-1">
                <span className="font-medium">{pt?.from_staff?.name || '—'}</span>
                {' → '}
                <span className="font-medium">{pt?.to_staff?.name || '—'}</span>
                {pt?.note ? <span className="mt-1 block text-amber-900/85 text-xs">Ghi chú: {pt.note}</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
                {canAcceptOrRejectTransfer && (
                    <>
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => onAction?.('accept')}
                            className={`${btnSm} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}
                        >
                            {isEmphasized ? 'Chấp nhận (thay mặt)' : 'Chấp nhận'}
                        </button>
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => onAction?.('reject')}
                            className={`${btnSm} border border-amber-400 bg-white text-amber-900 hover:bg-amber-100 disabled:opacity-60`}
                        >
                            Từ chối
                        </button>
                    </>
                )}
                {canCancelTransfer && (
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => onAction?.('cancel')}
                        className={`${btnSm} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60`}
                    >
                        Hủy phiếu
                    </button>
                )}
            </div>
        </div>
    );
}
