import React, { useMemo, useState } from 'react';

const palette = ['#10B981', '#F59E0B', '#3B82F6', '#F97316', '#8B5CF6', '#EF4444', '#14B8A6'];

const polarToCartesian = (cx, cy, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180;
    return {
        x: cx + radius * Math.cos(angleInRadians),
        y: cy + radius * Math.sin(angleInRadians),
    };
};

const describeFullDonutRing = (cx, cy, outerRadius, innerRadius) => {
    const outerStart = polarToCartesian(cx, cy, outerRadius, -90);
    const outerMid = polarToCartesian(cx, cy, outerRadius, 90);
    const innerStart = polarToCartesian(cx, cy, innerRadius, -90);
    const innerMid = polarToCartesian(cx, cy, innerRadius, 90);

    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerRadius} ${outerRadius} 0 1 1 ${outerMid.x} ${outerMid.y}`,
        `A ${outerRadius} ${outerRadius} 0 1 1 ${outerStart.x} ${outerStart.y}`,
        `L ${innerStart.x} ${innerStart.y}`,
        `A ${innerRadius} ${innerRadius} 0 1 0 ${innerMid.x} ${innerMid.y}`,
        `A ${innerRadius} ${innerRadius} 0 1 0 ${innerStart.x} ${innerStart.y}`,
        'Z',
    ].join(' ');
};

const describeDonutSegment = (cx, cy, outerRadius, innerRadius, startAngle, endAngle) => {
    const sweep = endAngle - startAngle;
    if (sweep >= 359.999) {
        return describeFullDonutRing(cx, cy, outerRadius, innerRadius);
    }

    const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
    const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
    const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
    const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
    const largeArcFlag = sweep > 180 ? 1 : 0;

    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
        'Z',
    ].join(' ');
};

export default function DonutChart({
    data = [],
    size = 160,
    thickness = 18,
    centerLabel = 'Tổng',
    layout = 'vertical',
}) {
    const [hoveredSegment, setHoveredSegment] = useState(null);
    const normalized = data.map((item, idx) => ({
        label: item.label,
        value: Math.max(0, Number(item.value || 0)),
        color: item.color || palette[idx % palette.length],
    }));
    const total = normalized.reduce((sum, item) => sum + item.value, 0);
    const innerSize = size - thickness * 2;
    const outerRadius = size / 2;
    const innerRadius = Math.max(outerRadius - thickness, 0);

    const segments = useMemo(() => {
        let accumulatedAngle = -90;
        return normalized.map((item) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            const sweepAngle = total > 0 ? (item.value / total) * 360 : 0;
            const startAngle = accumulatedAngle;
            const endAngle = accumulatedAngle + sweepAngle;
            const segment = {
                ...item,
                percent,
                startAngle,
                endAngle,
                path: describeDonutSegment(size / 2, size / 2, outerRadius, innerRadius, startAngle, endAngle),
            };
            accumulatedAngle = endAngle;
            return segment;
        });
    }, [normalized, total, size, outerRadius, innerRadius]);

    const isHorizontal = layout === 'horizontal';

    return (
        <div className={isHorizontal ? 'grid h-full gap-6 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start' : 'flex flex-col items-center gap-3'}>
            <div
                className={isHorizontal ? 'flex justify-center' : ''}
            >
                <div className="relative" style={{ width: size, height: size }}>
                {hoveredSegment ? (
                    <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-xl bg-slate-900/95 px-3 py-2 text-center text-[11px] text-white shadow-xl">
                        <div className="font-semibold">{hoveredSegment.label}</div>
                        <div>{hoveredSegment.value.toLocaleString('vi-VN')}</div>
                        <div className="text-slate-200">
                            {hoveredSegment.percent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%
                        </div>
                    </div>
                ) : null}
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                >
                    <path
                        d={describeFullDonutRing(size / 2, size / 2, outerRadius, innerRadius)}
                        fill="#e2e8f0"
                    />
                    {total > 0 ? segments.map((seg) => (
                        <path
                            key={seg.label}
                            d={seg.path}
                            fill={seg.color}
                            className="cursor-pointer transition-opacity duration-150 hover:opacity-90"
                            onMouseEnter={() => setHoveredSegment(seg)}
                            onMouseLeave={() => setHoveredSegment((current) => (current?.label === seg.label ? null : current))}
                        />
                    )) : null}
                </svg>
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
            </div>
            <div className={`w-full text-xs ${isHorizontal ? 'grid content-start auto-rows-min gap-2 sm:grid-cols-2' : 'space-y-2'}`}>
                {normalized.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        className={`flex w-full items-center justify-between gap-3 rounded-xl text-left hover:bg-slate-50 ${isHorizontal ? 'px-3 py-2' : 'px-2 py-1'}`}
                        onMouseEnter={() => {
                            const segment = segments.find((seg) => seg.label === item.label);
                            if (segment) setHoveredSegment(segment);
                        }}
                        onMouseLeave={() => setHoveredSegment((current) => (current?.label === item.label ? null : current))}
                    >
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                            <span className="text-slate-700">{item.label}</span>
                        </div>
                        <span className="font-semibold text-slate-900">{item.value.toLocaleString('vi-VN')}</span>
                    </button>
                ))}
                {normalized.length === 0 && (
                    <p className="text-xs text-text-muted text-center">Chưa có dữ liệu.</p>
                )}
            </div>
        </div>
    );
}
