import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ô lọc thống nhất (text, select, date, month, number).
 * min-h 44px để date/select đồng cao; textarea dùng thêm min-h riêng (vd. min-h-[108px]) để không bị cắt.
 */
export const filterControlClass =
    'w-full min-h-[2.75rem] rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 text-sm leading-normal text-slate-700 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/10 [color-scheme:light]';

/** Nút hành động phụ trong hàng lọc (viền) — cùng chiều cao ô lọc */
export const FILTER_SUBMIT_BUTTON_CLASS =
    'inline-flex h-11 min-h-[2.75rem] shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50';

/** Nút gửi lọc chính (Lọc / Áp dụng / Tìm kiếm) */
export const FILTER_SUBMIT_PRIMARY_BUTTON_CLASS =
    'inline-flex h-11 min-h-[2.75rem] shrink-0 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90';

/**
 * Lưới bộ lọc cho laptop ~13" và màn nhỏ:
 * 1 cột (xs) → 2 cột (sm+) → 3 cột (xl+). Tránh ép 4–7 cột trên một hàng như màn 24".
 */
export const FILTER_GRID_RESPONSIVE =
    'grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';

/** @deprecated Dùng FILTER_GRID_RESPONSIVE + FILTER_GRID_SUBMIT_ROW */
export const FILTER_GRID_WITH_SUBMIT = FILTER_GRID_RESPONSIVE;

/**
 * Đặt sau các FilterField: full width, nút Lọc căn trái (đuôi khối lọc).
 */
export const FILTER_GRID_SUBMIT_ROW =
    'col-span-full mt-1 flex flex-wrap items-center justify-start gap-2.5 border-t border-slate-100/90 pt-3 sm:col-span-2 xl:col-span-3';

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
function TableSearchInput({ containerRef, searchValue, onSearchChange }) {
    const isControlled = onSearchChange !== undefined;
    const [localTerm, setLocalTerm] = useState('');
    const [controlledTerm, setControlledTerm] = useState(searchValue ?? '');
    const term = isControlled ? controlledTerm : localTerm;
    const [matchCount, setMatchCount] = useState(null);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    const applyFilter = useCallback((searchText) => {
        if (!containerRef.current || isControlled) return;
        // Walk up to the nearest common parent that also contains tables
        const parent = containerRef.current.parentElement?.closest('.bg-white') || containerRef.current.parentElement;
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
        if (isControlled) {
            setControlledTerm(value);
            onSearchChange(value);
            return;
        }
        setLocalTerm(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            applyFilter(value);
        }, 300);
    }, [isControlled, applyFilter, onSearchChange]);

    const clearSearch = useCallback(() => {
        if (isControlled) {
            setControlledTerm('');
            onSearchChange('');
        } else {
            setLocalTerm('');
            applyFilter('');
        }
        inputRef.current?.focus();
    }, [isControlled, applyFilter, onSearchChange]);

    useEffect(() => {
        if (!isControlled) return;
        setControlledTerm(searchValue ?? '');
    }, [isControlled, searchValue]);

    // Re-apply filter when table data changes (via MutationObserver)
    useEffect(() => {
        if (!containerRef.current) return;
        const parent = containerRef.current.parentElement?.closest('.bg-white') || containerRef.current.parentElement;
        if (!parent) return;

        const observer = new MutationObserver(() => {
            if (term && !isControlled) applyFilter(term);
        });
        observer.observe(parent, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [containerRef, term, applyFilter]);

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
                className="h-11 min-h-[2.75rem] w-full rounded-2xl border border-slate-200/80 bg-slate-50/70 py-2 pl-10 pr-20 text-sm leading-normal text-slate-700 placeholder-slate-400 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/10"
                placeholder="Tìm nhanh trong bảng... (Enter để áp dụng lọc)"
                value={term}
                onChange={handleChange}
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3">
                {matchCount !== null && !isControlled && (
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
    searchValue = undefined,
    onSearch = undefined,
    /** Khi có: bọc toàn bộ (tiêu đề + nút + ô tìm + children) trong <form>. Nút Lọc dùng type="submit". Enter áp dụng lọc. */
    onSubmitFilters = undefined,
    collapsible = false,
    defaultCollapsed = false,
    collapseLabel = 'Bộ lọc',
    collapseHint = 'Nhấn để mở các trường lọc.',
    children,
}) {
    const containerRef = useRef(null);
    const [isCollapsed, setIsCollapsed] = useState(Boolean(defaultCollapsed));

    useEffect(() => {
        setIsCollapsed(Boolean(defaultCollapsed));
    }, [defaultCollapsed]);

    const hasHeader = Boolean(title || description || actions || collapsible);
    const hasTopBlock = hasHeader || enableSearch;

    const filterBody = !isCollapsed ? (
        <>
            {enableSearch && (
                <div className={hasHeader ? 'mt-4' : ''}>
                    <TableSearchInput
                        containerRef={containerRef}
                        searchValue={searchValue}
                        onSearchChange={onSearch}
                    />
                </div>
            )}
            <div className={hasTopBlock ? 'mt-4' : ''}>
                {children}
            </div>
        </>
    ) : (
        <div className={hasTopBlock ? 'mt-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-500' : ''}>
            {collapseHint}
        </div>
    );

    const toggleButton = collapsible ? (
        <button
            type="button"
            className="inline-flex h-11 min-h-[2.75rem] items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? `Mở ${collapseLabel}` : `Thu gọn ${collapseLabel}`}
        >
            {isCollapsed ? `Mở ${collapseLabel}` : `Thu gọn ${collapseLabel}`}
        </button>
    ) : null;

    const actionNodes = (
        <>
            {actions}
            {toggleButton}
        </>
    );

    const headerRow = hasHeader ? (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            {(title || description) ? (
                <div className="max-w-3xl">
                    {title ? (
                        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                    ) : null}
                    {description ? (
                        <p className="mt-1.5 text-sm leading-6 text-text-muted">
                            {description}
                            {onSubmitFilters ? (
                                <span className="block mt-1 text-xs text-text-muted/90">
                                    Nhấn Enter trong ô tìm hoặc các trường lọc để áp dụng (hoặc bấm Lọc).
                                </span>
                            ) : null}
                        </p>
                    ) : null}
                </div>
            ) : null}
            {(actions || toggleButton) ? (
                <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2.5 xl:w-auto">
                    {actionNodes}
                </div>
            ) : null}
        </div>
    ) : null;

    const wrapped = onSubmitFilters ? (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmitFilters();
            }}
        >
            {headerRow}
            {filterBody}
        </form>
    ) : (
        <>
            {headerRow}
            {filterBody}
        </>
    );

    return (
        <div ref={containerRef} className={`mb-6 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-card sm:p-5 ${className}`.trim()}>
            {wrapped}
        </div>
    );
}
