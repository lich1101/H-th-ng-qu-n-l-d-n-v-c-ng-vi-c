import React, { useMemo } from 'react';

const DEFAULT_PER_PAGE_OPTIONS = [10, 20, 30, 50, 100];

const buildPageItems = (currentPage, lastPage) => {
    if (lastPage <= 1) return [1];

    const pages = new Set([1, lastPage, currentPage - 1, currentPage, currentPage + 1]);
    if (currentPage <= 3) {
        pages.add(2);
        pages.add(3);
    }
    if (currentPage >= lastPage - 2) {
        pages.add(lastPage - 1);
        pages.add(lastPage - 2);
    }

    const normalized = Array.from(pages)
        .filter((page) => page >= 1 && page <= lastPage)
        .sort((a, b) => a - b);

    const items = [];
    normalized.forEach((page, index) => {
        const previous = normalized[index - 1];
        if (index > 0 && page - previous > 1) {
            items.push(`ellipsis-${previous}-${page}`);
        }
        items.push(page);
    });

    return items;
};

export default function PaginationControls({
    page = 1,
    lastPage = 1,
    total = 0,
    perPage = 10,
    onPageChange,
    onPerPageChange,
    loading = false,
    perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
    className = '',
    label = 'bản ghi',
}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLastPage = Math.max(1, Number(lastPage) || 1);
    const safePerPage = Math.max(1, Number(perPage) || 10);
    const pageItems = useMemo(() => buildPageItems(safePage, safeLastPage), [safeLastPage, safePage]);
    const from = total > 0 ? ((safePage - 1) * safePerPage) + 1 : 0;
    const to = total > 0 ? Math.min(total, safePage * safePerPage) : 0;

    const goToPage = (nextPage) => {
        if (loading) return;
        const resolved = Math.max(1, Math.min(safeLastPage, Number(nextPage) || 1));
        if (resolved === safePage || typeof onPageChange !== 'function') return;
        onPageChange(resolved);
    };

    const changePerPage = (event) => {
        if (typeof onPerPageChange !== 'function') return;
        const value = Number(event.target.value) || safePerPage;
        onPerPageChange(value);
    };

    return (
        <div className={`mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between ${className}`}>
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Hiển thị</span>
                    <select
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                        value={safePerPage}
                        onChange={changePerPage}
                        disabled={loading}
                    >
                        {perPageOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                    <span className="text-sm text-slate-500">/{label}</span>
                </label>
                <div className="text-sm text-slate-500">
                    {total > 0 ? `Đang xem ${from}-${to} / ${total}` : `0 ${label}`}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={safePage <= 1 || loading}
                    onClick={() => goToPage(safePage - 1)}
                >
                    Trước
                </button>

                <div className="flex flex-wrap items-center gap-1">
                    {pageItems.map((item) => (
                        typeof item === 'number' ? (
                            <button
                                key={item}
                                type="button"
                                className={`min-w-[2.5rem] rounded-xl px-3 py-2 font-semibold ${
                                    item === safePage
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                                disabled={loading}
                                onClick={() => goToPage(item)}
                            >
                                {item}
                            </button>
                        ) : (
                            <span key={item} className="px-1 text-slate-400">…</span>
                        )
                    ))}
                </div>

                <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={safePage >= safeLastPage || loading}
                    onClick={() => goToPage(safePage + 1)}
                >
                    Sau
                </button>
            </div>
        </div>
    );
}
