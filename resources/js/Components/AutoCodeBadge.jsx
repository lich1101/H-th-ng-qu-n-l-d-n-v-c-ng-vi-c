import React from 'react';

export default function AutoCodeBadge({ code, fallback = '—', className = '' }) {
    const label = (code || fallback || '—').toString().trim();

    return (
        <span
            className={`inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700 ${className}`.trim()}
        >
            {label}
        </span>
    );
}
