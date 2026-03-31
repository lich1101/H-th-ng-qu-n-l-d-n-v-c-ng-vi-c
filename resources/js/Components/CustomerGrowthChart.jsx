import React, { useMemo } from 'react';

const svgWidth = 760;
const svgHeight = 312;
const padding = { top: 18, right: 24, bottom: 48, left: 46 };

export default function CustomerGrowthChart({ data = [] }) {
    const chart = useMemo(() => {
        const normalized = Array.isArray(data) ? data : [];
        const maxValue = Math.max(
            1,
            ...normalized.map((item) => Math.max(
                Number(item.first_purchase || 0) + Number(item.repeat_purchase || 0),
                Number(item.created_clients || 0),
            )),
        );
        const innerWidth = svgWidth - padding.left - padding.right;
        const innerHeight = svgHeight - padding.top - padding.bottom;
        const slotWidth = normalized.length > 0 ? innerWidth / normalized.length : innerWidth;
        const barWidth = Math.min(30, Math.max(14, slotWidth * 0.28));
        const tickValues = maxValue <= 4
            ? Array.from({ length: maxValue + 1 }, (_, index) => index)
            : [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio));
        const uniqueTicks = Array.from(new Set(tickValues)).sort((a, b) => a - b);
        const linePoints = normalized.map((item, index) => {
            const x = padding.left + (slotWidth * index) + (slotWidth / 2);
            const value = Number(item.created_clients || 0);
            const y = padding.top + innerHeight - ((value / maxValue) * innerHeight);
            return { x, y, value };
        });

        return {
            normalized,
            maxValue,
            innerHeight,
            slotWidth,
            barWidth,
            linePoints,
            gridValues: uniqueTicks.map((value) => ({
                value,
                y: padding.top + innerHeight - ((value / maxValue) * innerHeight),
            })),
        };
    }, [data]);

    if (!chart.normalized.length) {
        return <p className="text-sm text-text-muted">Chưa có dữ liệu tăng trưởng khách hàng.</p>;
    }

    const linePath = chart.linePoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');

    return (
        <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
                <div className="inline-flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                    <span className="h-3 w-3 rounded-[4px] bg-emerald-500" />
                    <span>Mua lần đầu</span>
                </div>
                <div className="inline-flex items-center gap-2.5 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700">
                    <span className="h-3 w-3 rounded-[4px] bg-cyan-500" />
                    <span>Mua lại</span>
                </div>
                <div className="inline-flex items-center gap-2.5 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700">
                    <span className="h-3 w-3 rounded-full bg-violet-500" />
                    <span>Tạo mới (đường)</span>
                </div>
            </div>
            <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-4">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="min-w-[720px]">
                    {chart.gridValues.map((grid) => (
                        <g key={`grid-${grid.y}`}>
                            <line
                                x1={padding.left}
                                y1={grid.y}
                                x2={svgWidth - padding.right}
                                y2={grid.y}
                                stroke="#E2E8F0"
                                strokeDasharray="3 5"
                            />
                            <text
                                x={padding.left - 8}
                                y={grid.y + 5}
                                textAnchor="end"
                                fontSize="13"
                                fontWeight="600"
                                fill="#94A3B8"
                            >
                                {grid.value}
                            </text>
                        </g>
                    ))}

                    {chart.normalized.map((item, index) => {
                        const x = padding.left + (chart.slotWidth * index) + (chart.slotWidth / 2) - (chart.barWidth / 2);
                        const firstValue = Number(item.first_purchase || 0);
                        const repeatValue = Number(item.repeat_purchase || 0);
                        const firstHeight = (firstValue / chart.maxValue) * chart.innerHeight;
                        const repeatHeight = (repeatValue / chart.maxValue) * chart.innerHeight;
                        const firstY = padding.top + chart.innerHeight - firstHeight;
                        const repeatY = firstY - repeatHeight;

                        return (
                            <g key={item.label || index}>
                                <rect
                                    x={x}
                                    y={firstY}
                                    width={chart.barWidth}
                                    height={Math.max(firstHeight, 1)}
                                    rx="8"
                                    fill="#16A34A"
                                />
                                <rect
                                    x={x}
                                    y={repeatY}
                                    width={chart.barWidth}
                                    height={Math.max(repeatHeight, 1)}
                                    rx="8"
                                    fill="#0891B2"
                                />
                                <text
                                    x={padding.left + (chart.slotWidth * index) + (chart.slotWidth / 2)}
                                    y={svgHeight - 10}
                                    textAnchor="middle"
                                    fontSize="14"
                                    fontWeight="600"
                                    fill="#64748B"
                                >
                                    {item.label}
                                </text>
                            </g>
                        );
                    })}

                    <path d={linePath} fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {chart.linePoints.map((point, index) => (
                        <g key={`point-${index}`}>
                            <circle cx={point.x} cy={point.y} r="4" fill="#7C3AED" />
                            <circle cx={point.x} cy={point.y} r="8" fill="#7C3AED" fillOpacity="0.16" />
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
}
