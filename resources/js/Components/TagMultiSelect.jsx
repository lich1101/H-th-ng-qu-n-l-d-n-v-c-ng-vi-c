import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AppIcon from '@/Components/AppIcon';
import { filterControlClass } from '@/Components/FilterToolbar';

const normalizeIds = (values) => Array.from(new Set((values || [])
    .map((value) => Number(typeof value === 'object' && value !== null ? value.id : value))
    .filter((value) => Number.isInteger(value) && value > 0)));

function buildTriggerSummary(selectedOptions) {
    if (!selectedOptions.length) return null;
    if (selectedOptions.length === 1) {
        const o = selectedOptions[0];
        return o.meta ? `${o.label} · ${o.meta}` : o.label;
    }
    const names = selectedOptions.slice(0, 2).map((o) => o.label).join(', ');
    if (selectedOptions.length === 2) return names;
    return `${names} +${selectedOptions.length - 2}`;
}

/** Văn ngắn trên nút khi chưa chọn — ưu tiên filter “để trống = tất cả”, còn lại dùng emptyLabel nếu gọn. */
function resolveSummaryEmpty(summaryEmpty, emptyLabel) {
    if (summaryEmpty != null && String(summaryEmpty).trim() !== '') {
        return summaryEmpty;
    }
    const t = String(emptyLabel || '').trim();
    if (t.startsWith('Để trống')) return 'Tất cả nhân sự';
    if (t.length > 0 && t.length <= 44) return t;
    return 'Chọn';
}

export default function TagMultiSelect({
    options = [],
    selectedIds = [],
    onChange,
    addPlaceholder = 'Tìm và thêm mục',
    emptyLabel = 'Chưa chọn mục nào.',
    summaryEmpty,
    disabled = false,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const searchInputRef = useRef(null);
    const [panelStyle, setPanelStyle] = useState({ top: 0, left: 0, width: 320 });

    const normalizedOptions = useMemo(() => (
        options
            .map((option) => ({
                id: Number(option?.id || 0),
                label: String(option?.label || '').trim(),
                meta: String(option?.meta || '').trim(),
            }))
            .filter((option) => option.id > 0 && option.label)
    ), [options]);

    const normalizedSelectedIds = useMemo(
        () => normalizeIds(selectedIds),
        [selectedIds]
    );

    const optionMap = useMemo(() => (
        normalizedOptions.reduce((acc, option) => {
            acc.set(option.id, option);
            return acc;
        }, new Map())
    ), [normalizedOptions]);

    const selectedOptions = useMemo(() => (
        normalizedSelectedIds.map((id) => optionMap.get(id) || {
            id,
            label: `Nhân sự #${id}`,
            meta: '',
        })
    ), [normalizedSelectedIds, optionMap]);

    const availableOptions = useMemo(() => {
        const selectedSet = new Set(normalizedSelectedIds);
        return normalizedOptions.filter((option) => !selectedSet.has(option.id));
    }, [normalizedOptions, normalizedSelectedIds]);

    const filteredAvailableOptions = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) {
            return availableOptions;
        }

        return availableOptions.filter((option) => {
            const haystack = `${option.label} ${option.meta}`.trim().toLowerCase();
            return haystack.includes(keyword);
        });
    }, [availableOptions, query]);

    const updateSelection = (nextIds) => {
        if (typeof onChange === 'function') {
            onChange(normalizeIds(nextIds).sort((a, b) => a - b));
        }
    };

    const removeSelected = (staffId) => {
        updateSelection(normalizedSelectedIds.filter((id) => id !== staffId));
    };

    const addSelected = (nextId) => {
        const normalizedNextId = Number(nextId || 0);
        if (!normalizedNextId) return;
        updateSelection([...normalizedSelectedIds, normalizedNextId]);
        setQuery('');
    };

    const triggerSummary = buildTriggerSummary(selectedOptions);
    const triggerPlaceholder = resolveSummaryEmpty(summaryEmpty, emptyLabel);

    const repositionPanel = () => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const width = Math.max(280, rect.width);
        let left = rect.left;
        const padding = 8;
        if (left + width > window.innerWidth - padding) {
            left = Math.max(padding, window.innerWidth - width - padding);
        }
        let top = rect.bottom + 6;
        const panelH = panelRef.current?.offsetHeight ?? 320;
        if (top + panelH > window.innerHeight - padding) {
            top = Math.max(padding, rect.top - 6 - panelH);
        }
        setPanelStyle({ top, left, width });
    };

    useLayoutEffect(() => {
        if (!open) return;
        repositionPanel();
    }, [open, selectedOptions.length, filteredAvailableOptions.length, query]);

    useEffect(() => {
        if (!open) return;
        const onScroll = () => repositionPanel();
        const onResize = () => repositionPanel();
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        searchInputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => {
            const t = e.target;
            if (rootRef.current?.contains(t)) return;
            if (panelRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const toggleOpen = () => {
        if (disabled) return;
        setOpen((v) => !v);
        if (!open) setQuery('');
    };

    const panelContent = open && !disabled ? (
        <div
            ref={panelRef}
            className="fixed z-[300] flex max-h-[min(22rem,calc(100vh-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
            style={{ top: panelStyle.top, left: panelStyle.left, width: panelStyle.width }}
            role="listbox"
            aria-multiselectable="true"
        >
            <div className="shrink-0 border-b border-slate-100 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">Đã chọn</p>
                {selectedOptions.length > 0 ? (
                    <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                        {selectedOptions.map((option) => (
                            <span
                                key={option.id}
                                className="inline-flex max-w-full items-center gap-1 rounded-full border border-cyan-200/90 bg-cyan-50/90 pl-2.5 pr-1 py-0.5 text-xs font-medium text-cyan-800"
                            >
                                <span className="truncate">{option.label}</span>
                                <button
                                    type="button"
                                    className="shrink-0 rounded-full p-0.5 text-cyan-700/80 transition hover:bg-cyan-100 hover:text-cyan-950"
                                    onClick={() => removeSelected(option.id)}
                                    aria-label={`Xóa ${option.label}`}
                                >
                                    <AppIcon name="x-mark" className="h-3 w-3" strokeWidth={2.2} />
                                </button>
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{emptyLabel}</p>
                )}
            </div>

            <div className="shrink-0 border-b border-slate-100 px-3 py-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2.5 py-2">
                    <AppIcon name="users" className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.9} />
                    <input
                        ref={searchInputRef}
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={availableOptions.length > 0 ? addPlaceholder : 'Đã chọn hết nhân sự khả dụng'}
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5">
                {availableOptions.length === 0 ? (
                    <p className="px-2 py-3 text-center text-sm text-text-muted">
                        Đã chọn hết nhân sự khả dụng.
                    </p>
                ) : filteredAvailableOptions.length === 0 ? (
                    <p className="px-2 py-3 text-center text-sm text-text-muted">
                        Không tìm thấy nhân sự phù hợp với từ khóa &quot;{query}&quot;.
                    </p>
                ) : (
                    <ul className="space-y-0.5">
                        {filteredAvailableOptions.map((option) => (
                            <li key={option.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                                    onClick={() => addSelected(option.id)}
                                >
                                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                                        +
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{option.label}</span>
                                        {option.meta ? (
                                            <span className="block truncate text-xs text-slate-500">{option.meta}</span>
                                        ) : null}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                className={`${filterControlClass} flex min-h-[46px] items-center justify-between gap-2 text-left ${
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-slate-300/90'
                } ${open && !disabled ? 'border-primary bg-white ring-2 ring-primary/10' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={toggleOpen}
            >
                <span className={`min-w-0 flex-1 truncate text-sm ${triggerSummary ? 'text-slate-800' : 'text-slate-500'}`}>
                    {triggerSummary || triggerPlaceholder}
                </span>
                <AppIcon
                    name="chevron-down"
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    strokeWidth={1.9}
                />
            </button>

            {typeof document !== 'undefined' && panelContent
                ? createPortal(panelContent, document.body)
                : null}
        </div>
    );
}
