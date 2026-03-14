import React from 'react';

const palette = ['#10B981', '#F59E0B', '#3B82F6', '#F97316', '#8B5CF6', '#EF4444', '#14B8A6'];

export default function DonutChart({
    data = [],
    size = 160,
    thickness = 18,
    centerLabel = 'Tổng',
}) {
    const normalized = data.map((item, idx) => ({
        label: item.label,
        value: Math.max(0, Number(item.value || 0)),
        color: item.color || palette[idx % palette.length],
    }));
    const total = normalized.reduce((sum, item) => sum + item.value, 0);

    let offset = 0;
    const segments = normalized.map((item) => {
        const percent = total > 0 ? (item.value / total) * 100 : 0;
        const start = offset;
        offset += percent;
        return {
            ...item,
            start,
            end: offset,
        };
    });

    const gradient = total === 0
        ? 'conic-gradient(#e2e8f0 0% 100%)'
        : `conic-gradient(${segments.map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`).join(',')})`;

    const innerSize = size - thickness * 2;

    return (
        <div className="flex flex-col items-center gap-3">
            <div
                className="relative rounded-full"
                style={{
                    width: size,
                    height: size,
                    background: gradient,
                }}
            >
                <div
                    className="absolute rounded-full bg-white flex flex-col items-center justify-center text-center"
                    style={{
                        width: innerSize,
                        height: innerSize,
                        top: thickness,
                        left: thickness,
                    }}
                >
                    <p className="text-xs text-text-muted">{centerLabel}</p>
                    <p className="text-lg font-semibold text-slate-900">{total.toLocaleString('vi-VN')}</p>
                </div>
            </div>
            <div className="w-full space-y-2 text-xs">
                {normalized.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                            <span className="text-slate-700">{item.label}</span>
                        </div>
                        <span className="font-semibold text-slate-900">{item.value.toLocaleString('vi-VN')}</span>
                    </div>
                ))}
                {normalized.length === 0 && (
                    <p className="text-xs text-text-muted text-center">Chưa có dữ liệu.</p>
                )}
            </div>
        </div>
    );
}
