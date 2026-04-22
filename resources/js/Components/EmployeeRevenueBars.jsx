import React, { useEffect, useMemo, useState } from 'react';

function CellBar({ value, max, tone = 'blue', animate = false, delay = 0 }) {
    const width = max > 0 ? Math.max(6, (Number(value || 0) / max) * 100) : 0;
    const numericValue = Number(value || 0);
    const palette = {
        blue: {
            fill: 'from-sky-500 via-blue-500 to-blue-400',
            glow: 'bg-sky-100/70 text-sky-700',
        },
        amber: {
            fill: 'from-amber-400 via-orange-400 to-amber-300',
            glow: 'bg-amber-100/80 text-amber-700',
        },
        emerald: {
            fill: 'from-emerald-500 via-teal-500 to-emerald-400',
            glow: 'bg-emerald-100/80 text-emerald-700',
        },
    };
    const resolvedTone = palette[tone] || palette.blue;

    return (
        <div className="relative h-11 overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <div
                className={`absolute inset-y-1 left-1 rounded-[14px] bg-gradient-to-r ${resolvedTone.fill} shadow-[0_12px_24px_-18px_rgba(15,23,42,0.55)]`}
                style={{
                    width: numericValue > 0 ? `${animate ? width : 0}%` : 0,
                    transition: `width 620ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
                }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,_rgba(255,255,255,0.34),transparent_48%)]" />
            <div className="relative z-10 flex h-full items-center justify-between gap-2 px-3">
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${resolvedTone.glow}`}>
                    {max > 0 ? `${((numericValue / max) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}% max` : '0%'}
                </span>
                <span className="tabular-nums text-xs font-semibold text-slate-800">
                    {numericValue.toLocaleString('vi-VN')}
                </span>
            </div>
        </div>
    );
}

export default function EmployeeRevenueBars({ data = [] }) {
    const [isReady, setIsReady] = useState(false);
    const rows = useMemo(() => (
        (Array.isArray(data) ? data : []).filter((item) => (
            Number(item?.revenue || 0) > 0
            || Number(item?.cashflow || 0) > 0
            || Number(item?.contracts_count || 0) > 0
        ))
    ), [data]);
    const totals = useMemo(() => {
        return {
            revenueMax: Math.max(1, ...rows.map((item) => Number(item.revenue || 0))),
            cashflowMax: Math.max(1, ...rows.map((item) => Number(item.cashflow || 0))),
            contractMax: Math.max(1, ...rows.map((item) => Number(item.contracts_count || 0))),
            revenueTotal: rows.reduce((sum, item) => sum + Number(item.revenue || 0), 0),
            cashflowTotal: rows.reduce((sum, item) => sum + Number(item.cashflow || 0), 0),
        };
    }, [rows]);

    useEffect(() => {
        setIsReady(false);
        const frame = requestAnimationFrame(() => setIsReady(true));
        return () => cancelAnimationFrame(frame);
    }, [rows]);

    if (rows.length === 0) {
        return <p className="text-sm text-text-muted">Chưa có dữ liệu doanh số.</p>;
    }

    return (
        <div className="h-[min(70vh,520px)] w-full max-w-full overflow-auto rounded-[22px] border border-slate-200/80 bg-white shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)]">
            {/* Tổng tách khỏi tbody để không cạnh tranh z-index / sticky với thead */}
            <div className="min-w-[920px] border-b border-slate-200 bg-[linear-gradient(90deg,rgba(239,246,255,0.78),rgba(248,250,252,0.98))] px-4 py-3">
                <div
                    className="grid w-full items-center gap-3 text-sm font-semibold text-slate-900 sm:gap-4"
                    style={{
                        gridTemplateColumns: 'minmax(200px,1.1fr) minmax(160px,1fr) minmax(160px,1fr) minmax(100px,0.75fr)',
                    }}
                >
                    <span>Tổng</span>
                    <span className="tabular-nums text-right">{totals.revenueTotal.toLocaleString('vi-VN')}</span>
                    <span className="tabular-nums text-right">{totals.cashflowTotal.toLocaleString('vi-VN')}</span>
                    <span className="tabular-nums text-right text-slate-500">—</span>
                </div>
            </div>
            <table className="min-w-[920px] w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100 text-xs uppercase tracking-[0.12em] text-slate-600 shadow-[0_2px_0_0_rgba(226,232,240,1)]">
                    <tr>
                        <th className="px-4 py-3 text-left font-semibold">Nhân viên</th>
                        <th className="px-4 py-3 text-left font-semibold">Doanh số ký</th>
                        <th className="px-4 py-3 text-left font-semibold">Thu tiền</th>
                        <th className="px-4 py-3 text-left font-semibold">Hợp đồng</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                    {rows.map((item, index) => (
                        <tr key={item.staff_id || item.staff_name} className="odd:bg-white even:bg-slate-50/45 hover:bg-cyan-50/40">
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                    {item.avatar_url ? (
                                        <img src={item.avatar_url} alt={item.staff_name} className="h-9 w-9 rounded-full border border-slate-200 object-cover" />
                                    ) : (
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                                            {(item.staff_name || 'N').slice(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-semibold text-slate-900">{item.staff_name}</div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                            <span>Tỷ trọng {Number(item.share_percent || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span>
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                                {Number(item.contracts_count || 0).toLocaleString('vi-VN')} hợp đồng
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3 min-w-[180px]"><CellBar value={item.revenue} max={totals.revenueMax} tone="blue" animate={isReady} delay={index * 45} /></td>
                            <td className="px-4 py-3 min-w-[180px]"><CellBar value={item.cashflow} max={totals.cashflowMax} tone="amber" animate={isReady} delay={70 + (index * 45)} /></td>
                            <td className="px-4 py-3 min-w-[120px]"><CellBar value={item.contracts_count} max={totals.contractMax} tone="emerald" animate={isReady} delay={140 + (index * 45)} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
