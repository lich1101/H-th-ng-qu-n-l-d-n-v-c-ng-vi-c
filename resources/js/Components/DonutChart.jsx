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

const describeArcPath = (cx, cy, radius, startAngle, endAngle) => {
    const sweep = endAngle - startAngle;
    if (sweep >= 359.999) {
        const start = polarToCartesian(cx, cy, radius, -90);
        const mid = polarToCartesian(cx, cy, radius, 90);
        return [
            `M ${start.x} ${start.y}`,
            `A ${radius} ${radius} 0 1 1 ${mid.x} ${mid.y}`,
            `A ${radius} ${radius} 0 1 1 ${start.x} ${start.y}`,
        ].join(' ');
    }

    const start = polarToCartesian(cx, cy, radius, startAngle);
    const end = polarToCartesian(cx, cy, radius, endAngle);
    const largeArcFlag = sweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
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
                hoverPath: describeArcPath(size / 2, size / 2, outerRadius - thickness / 2, startAngle, endAngle),
            };
            accumulatedAngle = endAngle;
            return segment;
        });
    }, [normalized, total, size, outerRadius, innerRadius]);

    const isHorizontal = layout === 'horizontal';

    return (
        <div className={isHorizontal ? 'grid h-full gap-6 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] xl:items-center' : 'flex flex-col items-center gap-4'}>
            <div
                className={isHorizontal ? 'flex justify-center xl:justify-start' : ''}
            >
                <div className="relative mx-auto" style={{ width: size, height: size }}>
                {hoveredSegment ? (
                    <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-2xl bg-slate-900/95 px-3.5 py-2.5 text-center text-xs text-white shadow-xl">
                        <div className="font-semibold">{hoveredSegment.label}</div>
                        <div className="mt-0.5">{hoveredSegment.value.toLocaleString('vi-VN')}</div>
                        <div className="mt-0.5 text-[11px] text-slate-200">
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
                            className="pointer-events-none transition-opacity duration-150"
                        />
                    )) : null}
                    {total > 0 ? segments.map((seg) => (
                        <path
                            key={`${seg.label}-hover`}
                            d={seg.hoverPath}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={Math.max(thickness + 14, 30)}
                            strokeLinecap="round"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredSegment(seg)}
                            onMouseMove={() => setHoveredSegment(seg)}
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
                    <p className="text-[13px] font-medium text-text-muted">{centerLabel}</p>
                    <p className="mt-1 text-[28px] font-semibold leading-none text-slate-900">{total.toLocaleString('vi-VN')}</p>
                </div>
                </div>
            </div>
            <div className={`w-full ${isHorizontal ? 'grid content-start auto-rows-min gap-2.5' : 'space-y-2.5'}`}>
                {normalized.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${isHorizontal ? 'px-3.5 py-3' : 'px-3 py-2.5'}`}
                        onMouseEnter={() => {
                            const segment = segments.find((seg) => seg.label === item.label);
                            if (segment) setHoveredSegment(segment);
                        }}
                        onMouseLeave={() => setHoveredSegment((current) => (current?.label === item.label ? null : current))}
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <span className="h-3 w-3 flex-none rounded-full ring-4 ring-slate-50" style={{ background: item.color }} />
                            <span className="truncate text-sm font-medium text-slate-700">{item.label}</span>
                        </div>
                        <span className="flex-none text-sm font-semibold text-slate-900">{item.value.toLocaleString('vi-VN')}</span>
                    </button>
                ))}
                {normalized.length === 0 && (
                    <p className="py-2 text-sm text-text-muted text-center">Chưa có dữ liệu.</p>
                )}
            </div>
        </div>
    );
}
