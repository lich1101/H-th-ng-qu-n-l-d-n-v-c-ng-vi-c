import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Standalone table search component.
 * Place it before a <table> inside a common parent container.
 * It will find the nearest sibling table and filter rows by text content.
 */
export default function TableSearch({ className = '' }) {
    const ref = useRef(null);
    const [term, setTerm] = useState('');
    const [matchCount, setMatchCount] = useState(null);
    const debounceRef = useRef(null);

    const applyFilter = useCallback((searchText) => {
        if (!ref.current) return;
        const parent = ref.current.closest('.bg-white') || ref.current.parentElement;
        if (!parent) return;

        const tables = parent.querySelectorAll('table');
        const needle = searchText.toLowerCase().normalize('NFC').trim();
        let matched = 0;

        tables.forEach((table) => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = tbody.querySelectorAll('tr');
            rows.forEach((row) => {
                if (row.cells.length <= 1) return;
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
    }, []);

    const handleChange = useCallback((e) => {
        const value = e.target.value;
        setTerm(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilter(value), 150);
    }, [applyFilter]);

    const clearSearch = useCallback(() => {
        setTerm('');
        applyFilter('');
    }, [applyFilter]);

    useEffect(() => {
        if (!ref.current) return;
        const parent = ref.current.closest('.bg-white') || ref.current.parentElement;
        if (!parent) return;
        const observer = new MutationObserver(() => {
            if (term) applyFilter(term);
        });
        observer.observe(parent, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [term, applyFilter]);

    return (
        <div ref={ref} className={`relative ${className}`.trim()}>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
            </div>
            <input
                type="text"
                className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/70 py-3 pl-10 pr-20 text-sm text-slate-700 placeholder-slate-400 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/10"
                placeholder="Tìm nhanh trong bảng..."
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
