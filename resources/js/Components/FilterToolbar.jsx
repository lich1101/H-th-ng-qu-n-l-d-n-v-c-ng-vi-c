import React, { useCallback, useEffect, useRef, useState } from 'react';

export const filterControlClass = 'w-full rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 text-sm text-slate-700 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/10';

export function FilterField({
    label,
    hint = '',
    className = '',
    children,
}) {
    return (
        <div className={className}>
            {label ? (
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
                    {label}
                </label>
            ) : null}
            {children}
            {hint ? (
                <p className="mt-1.5 text-xs text-text-muted">{hint}</p>
            ) : null}
        </div>
    );
}

export function FilterActionGroup({ className = '', children }) {
    return (
        <div className={`flex flex-wrap items-center gap-2.5 ${className}`.trim()}>
            {children}
        </div>
    );
}

/**
 * Global text search bar for tables.
 * Finds the nearest sibling <table> elements and hides <tbody> rows
 * whose textContent does not match the search term.
 */
function TableSearchInput({ containerRef }) {
    const [term, setTerm] = useState('');
    const [matchCount, setMatchCount] = useState(null);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    const applyFilter = useCallback((searchText) => {
        if (!containerRef.current) return;
        // Walk up to the nearest common parent that also contains tables
        const parent = containerRef.current.closest('.bg-white') || containerRef.current.parentElement;
        if (!parent) return;

        const tables = parent.querySelectorAll('table');
        const needle = searchText.toLowerCase().normalize('NFC').trim();
        let total = 0;
        let matched = 0;

        tables.forEach((table) => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = tbody.querySelectorAll('tr');
            rows.forEach((row) => {
                // Skip "empty state" rows (single cell spanning full width)
                if (row.cells.length <= 1) return;
                total++;
                if (!needle) {
                    row.style.display = '';
                    matched++;
                    return;
                }
                const text = row.textContent.toLowerCase().normalize('NFC');
                const visible = text.includes(needle);
                row.style.display = visible ? '' : 'none';
                if (visible) matched++;
            });
        });

        setMatchCount(needle ? matched : null);
    }, [containerRef]);

    const handleChange = useCallback((e) => {
        const value = e.target.value;
        setTerm(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilter(value), 150);
    }, [applyFilter]);

    const clearSearch = useCallback(() => {
        setTerm('');
        applyFilter('');
        inputRef.current?.focus();
    }, [applyFilter]);

    // Re-apply filter when table data changes (via MutationObserver)
    useEffect(() => {
        if (!containerRef.current) return;
        const parent = containerRef.current.closest('.bg-white') || containerRef.current.parentElement;
        if (!parent) return;

        const observer = new MutationObserver(() => {
            if (term) applyFilter(term);
        });
        observer.observe(parent, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [containerRef, term, applyFilter]);

    // Keyboard shortcut: Ctrl/Cmd + F focuses search
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                // Only intercept if the FilterToolbar is visible
                if (containerRef.current && containerRef.current.offsetParent !== null) {
                    e.preventDefault();
                    inputRef.current?.focus();
                    inputRef.current?.select();
                }
            }
        };
        // Don't add global listener to avoid conflicts
        // window.addEventListener('keydown', handleKeyDown);
        // return () => window.removeEventListener('keydown', handleKeyDown);
    }, [containerRef]);

    return (
        <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
            </div>
            <input
                ref={inputRef}
                type="text"
                className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/70 py-3 pl-10 pr-20 text-sm text-slate-700 placeholder-slate-400 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/10"
                placeholder="Tìm nhanh trong bảng... (nhập bất kỳ từ khóa)"
                value={term}
                onChange={handleChange}
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3">
                {matchCount !== null && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${matchCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {matchCount} kết quả
                    </span>
                )}
                {term && (
                    <button
                        type="button"
                        className="rounded-full p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                        onClick={clearSearch}
                        aria-label="Xóa tìm kiếm"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}

export default function FilterToolbar({
    title = '',
    description = '',
    className = '',
    actions = null,
    enableSearch = false,
    children,
}) {
    const containerRef = useRef(null);

    return (
        <div ref={containerRef} className={`mb-6 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-card ${className}`.trim()}>
            {(title || description || actions) ? (
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    {(title || description) ? (
                        <div className="max-w-3xl">
                            {title ? (
                                <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                            ) : null}
                            {description ? (
                                <p className="mt-1.5 text-sm leading-6 text-text-muted">{description}</p>
                            ) : null}
                        </div>
                    ) : null}
                    {actions ? (
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5">
                            {actions}
                        </div>
                    ) : null}
                </div>
            ) : null}
            {enableSearch && (
                <div className={title || description || actions ? 'mt-4' : ''}>
                    <TableSearchInput containerRef={containerRef} />
                </div>
            )}
            <div className={title || description || actions || enableSearch ? 'mt-4' : ''}>
                {children}
            </div>
        </div>
    );
}
