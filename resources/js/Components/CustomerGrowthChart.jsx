import React, { useEffect, useMemo, useState } from 'react';

const svgWidth = 760;
const svgHeight = 260;
const padding = { top: 16, right: 20, bottom: 38, left: 42 };

export default function CustomerGrowthChart({ data = [] }) {
    const [isReady, setIsReady] = useState(false);
    const chart = useMemo(() => {
        const normalized = Array.isArray(data) ? data : [];
        const maxBar = Math.max(
            1,
            ...normalized.map((item) =>
                Math.max(
                    Number(item.first_purchase || 0),
                    Number(item.repeat_purchase || 0),
                ),
            ),
        );
        const maxLine = Math.max(
            1,
            ...normalized.map((item) => Number(item.created_clients || 0)),
        );
        const maxValue = Math.max(maxBar, maxLine);

        const innerWidth = svgWidth - padding.left - padding.right;
        const innerHeight = svgHeight - padding.top - padding.bottom;
        const slotWidth = normalized.length > 0 ? innerWidth / normalized.length : innerWidth;
        const barWidth = Math.min(14, Math.max(6, slotWidth * 0.18));
        const barGap = 3;

        const tickCount = 5;
        const niceMax = Math.ceil(maxValue / (tickCount - 1)) * (tickCount - 1) || tickCount - 1;
        const tickValues = Array.from({ length: tickCount }, (_, i) =>
            Math.round((niceMax / (tickCount - 1)) * i),
        );

        const linePoints = normalized.map((item, index) => {
            const x = padding.left + (slotWidth * index) + (slotWidth / 2);
            const value = Number(item.created_clients || 0);
            const y = padding.top + innerHeight - ((value / niceMax) * innerHeight);
            return { x, y, value };
        });

        return {
            normalized,
            niceMax,
            innerHeight,
            slotWidth,
            barWidth,
            barGap,
            linePoints,
            gridValues: tickValues.map((value) => ({
                value,
                y: padding.top + innerHeight - ((value / niceMax) * innerHeight),
            })),
        };
    }, [data]);

    useEffect(() => {
        setIsReady(false);
        const frame = requestAnimationFrame(() => setIsReady(true));
        return () => cancelAnimationFrame(frame);
    }, [data]);

    if (!chart.normalized.length) {
        return <p className="text-sm text-text-muted">Chưa có dữ liệu tăng trưởng khách hàng.</p>;
    }

    const linePath = chart.linePoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');

    const areaPath = chart.linePoints.length > 0
        ? `${linePath} L ${chart.linePoints[chart.linePoints.length - 1].x} ${padding.top + chart.innerHeight} L ${chart.linePoints[0].x} ${padding.top + chart.innerHeight} Z`
        : '';

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-slate-500">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#16A34A' }} />
                    Mua lần đầu
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-100 bg-cyan-50/80 px-3 py-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#0891B2' }} />
                    Mua lại
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50/85 px-3 py-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#7C3AED' }} />
                    Tạo mới (đường)
                </span>
            </div>
            <div className="overflow-x-auto rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-3 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full" style={{ maxHeight: 280 }}>
                    <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.10" />
                            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.01" />
                        </linearGradient>
                        <linearGradient id="firstPurchaseBar" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22C55E" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="#15803D" stopOpacity="0.88" />
                        </linearGradient>
                        <linearGradient id="repeatPurchaseBar" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="#0F766E" stopOpacity="0.88" />
                        </linearGradient>
                    </defs>

                    {chart.gridValues.map((grid) => (
                        <g key={`grid-${grid.value}`}>
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
                                y={grid.y + 4}
                                textAnchor="end"
                                fontSize="11"
                                fontWeight="500"
                                fill="#94A3B8"
                            >
                                {grid.value}
                            </text>
                        </g>
                    ))}

                    {chart.normalized.map((item, index) => {
                        const centerX = padding.left + (chart.slotWidth * index) + (chart.slotWidth / 2);
                        const firstValue = Number(item.first_purchase || 0);
                        const repeatValue = Number(item.repeat_purchase || 0);
                        const firstHeight = (firstValue / chart.niceMax) * chart.innerHeight;
                        const repeatHeight = (repeatValue / chart.niceMax) * chart.innerHeight;
                        const firstX = centerX - chart.barWidth - (chart.barGap / 2);
                        const repeatX = centerX + (chart.barGap / 2);
                        const firstY = padding.top + chart.innerHeight - firstHeight;
                        const repeatY = padding.top + chart.innerHeight - repeatHeight;

                        return (
                            <g key={item.label || index}>
                                <rect
                                    x={firstX}
                                    y={isReady ? firstY : padding.top + chart.innerHeight}
                                    width={chart.barWidth}
                                    height={Math.max(isReady ? firstHeight : 0, 1)}
                                    rx="4"
                                    fill="url(#firstPurchaseBar)"
                                    opacity="0.92"
                                    style={{
                                        transition: `y 560ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 45}ms, height 560ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 45}ms`,
                                    }}
                                />
                                <rect
                                    x={repeatX}
                                    y={isReady ? repeatY : padding.top + chart.innerHeight}
                                    width={chart.barWidth}
                                    height={Math.max(isReady ? repeatHeight : 0, 1)}
                                    rx="4"
                                    fill="url(#repeatPurchaseBar)"
                                    opacity="0.92"
                                    style={{
                                        transition: `y 560ms cubic-bezier(0.22, 1, 0.36, 1) ${120 + (index * 45)}ms, height 560ms cubic-bezier(0.22, 1, 0.36, 1) ${120 + (index * 45)}ms`,
                                    }}
                                />
                                <text
                                    x={centerX}
                                    y={svgHeight - 8}
                                    textAnchor="middle"
                                    fontSize="12"
                                    fontWeight="500"
                                    fill="#94A3B8"
                                >
                                    {item.label}
                                </text>
                            </g>
                        );
                    })}

                    {areaPath && (
                        <path d={areaPath} fill="url(#areaGrad)" style={{ opacity: isReady ? 1 : 0, transition: 'opacity 540ms ease 280ms' }} />
                    )}
                    <path
                        d={linePath}
                        fill="none"
                        stroke="#7C3AED"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            opacity: isReady ? 1 : 0,
                            strokeDasharray: isReady ? 'none' : '8 10',
                            transition: 'opacity 560ms ease 260ms',
                        }}
                    />
                    {chart.linePoints.map((point, index) => (
                        <g key={`point-${index}`}>
                            <circle
                                cx={point.x}
                                cy={isReady ? point.y : padding.top + chart.innerHeight}
                                r="3.5"
                                fill="#fff"
                                stroke="#7C3AED"
                                strokeWidth="2"
                                style={{
                                    opacity: isReady ? 1 : 0,
                                    transition: `opacity 420ms ease ${320 + (index * 30)}ms, cy 520ms ease ${320 + (index * 30)}ms`,
                                }}
                            />
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
}
