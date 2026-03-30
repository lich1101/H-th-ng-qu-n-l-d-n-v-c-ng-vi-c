import React, { useMemo } from 'react';

function CellBar({ value, max, tone = 'blue' }) {
    const width = max > 0 ? Math.max(6, (Number(value || 0) / max) * 100) : 0;
    const palette = {
        blue: 'bg-gradient-to-r from-blue-500 to-blue-400',
        amber: 'bg-gradient-to-r from-amber-400 to-amber-300',
        emerald: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    };

    return (
        <div className="relative h-9 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100/80">
            <div className={`absolute inset-y-0 left-0 rounded-xl ${palette[tone] || palette.blue}`} style={{ width: `${width}%` }} />
            <div className="relative z-10 flex h-full items-center justify-end px-2.5 text-xs font-semibold text-slate-800">
                {Number(value || 0).toLocaleString('vi-VN')}
            </div>
        </div>
    );
}

export default function EmployeeRevenueBars({ data = [] }) {
    const totals = useMemo(() => {
        const rows = Array.isArray(data) ? data : [];
        return {
            revenueMax: Math.max(1, ...rows.map((item) => Number(item.revenue || 0))),
            cashflowMax: Math.max(1, ...rows.map((item) => Number(item.cashflow || 0))),
            contractMax: Math.max(1, ...rows.map((item) => Number(item.contracts_count || 0))),
            revenueTotal: rows.reduce((sum, item) => sum + Number(item.revenue || 0), 0),
            cashflowTotal: rows.reduce((sum, item) => sum + Number(item.cashflow || 0), 0),
        };
    }, [data]);

    if (!Array.isArray(data) || data.length === 0) {
        return <p className="text-sm text-text-muted">Chưa có dữ liệu doanh số theo nhân viên.</p>;
    }

    return (
        <div className="overflow-x-auto rounded-[20px] border border-slate-200/80 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100/90 text-xs uppercase tracking-[0.12em] text-slate-600">
                    <tr>
                        <th className="px-4 py-3 text-left font-semibold">Nhân viên</th>
                        <th className="px-4 py-3 text-left font-semibold">Doanh số ký</th>
                        <th className="px-4 py-3 text-left font-semibold">Thu tiền</th>
                        <th className="px-4 py-3 text-left font-semibold">Hợp đồng</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                    <tr className="bg-slate-100/90">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">Tổng</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{totals.revenueTotal.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{totals.cashflowTotal.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">—</td>
                    </tr>
                    {data.map((item) => (
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
                                        <div className="text-xs text-slate-500">Tỷ trọng {Number(item.share_percent || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3 min-w-[180px]"><CellBar value={item.revenue} max={totals.revenueMax} tone="blue" /></td>
                            <td className="px-4 py-3 min-w-[180px]"><CellBar value={item.cashflow} max={totals.cashflowMax} tone="amber" /></td>
                            <td className="px-4 py-3 min-w-[120px]"><CellBar value={item.contracts_count} max={totals.contractMax} tone="emerald" /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
