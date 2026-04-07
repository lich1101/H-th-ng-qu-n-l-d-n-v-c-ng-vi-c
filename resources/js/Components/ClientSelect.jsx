import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import { filterControlClass } from '@/Components/FilterToolbar';
import { formatClientOptionLabel } from '@/utils/clientOptionLabel';

function mergeById(clients) {
    const map = new Map();
    (clients || []).forEach((c) => {
        const id = Number(c?.id || 0);
        if (id > 0) {
            map.set(id, c);
        }
    });
    return Array.from(map.values());
}

/**
 * Chọn một khách hàng: tìm theo API (tên, SĐT, email, ghi chú — server CRMController).
 * Hiển thị: Tên . SĐT . Email . Ghi chú (rút gọn ...).
 */
export default function ClientSelect({
    value = '',
    onChange,
    placeholder = 'Chọn khách hàng',
    className = '',
    disabled = false,
    allowClear = false,
    clearLabel = 'Tất cả khách hàng',
    /** Gợi ý nhãn khi đã có id nhưng chưa tải xong (vd. client embed từ API khác) */
    clientPreview = null,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState([]);
    const [resolved, setResolved] = useState(null);

    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const searchInputRef = useRef(null);
    const debounceRef = useRef(null);
    const [panelStyle, setPanelStyle] = useState({ top: 0, left: 0, width: 320 });

    const numericValue = useMemo(() => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }, [value]);

    const selectedClient = useMemo(() => {
        if (numericValue <= 0) {
            return null;
        }
        const fromOptions = options.find((c) => Number(c.id) === numericValue);
        if (fromOptions) {
            return fromOptions;
        }
        if (resolved && Number(resolved.id) === numericValue) {
            return resolved;
        }
        if (clientPreview && Number(clientPreview.id) === numericValue) {
            return clientPreview;
        }
        return null;
    }, [numericValue, options, resolved, clientPreview]);

    const triggerLabel = useMemo(() => {
        if (numericValue <= 0) {
            return '';
        }
        if (selectedClient) {
            return formatClientOptionLabel(selectedClient);
        }
        return `KH #${numericValue}`;
    }, [numericValue, selectedClient]);

    const fetchList = useCallback(async (searchText) => {
        setLoading(true);
        try {
            const params = {
                per_page: 80,
                page: 1,
            };
            const s = String(searchText ?? '').trim();
            if (s) {
                params.search = s;
            }
            const res = await axios.get('/api/v1/crm/clients', { params });
            const rows = res.data?.data || [];
            setOptions(mergeById(rows));
        } catch {
            setOptions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const resolveById = useCallback(async (id) => {
        if (!id) {
            return;
        }
        try {
            const res = await axios.get('/api/v1/crm/clients', {
                params: { ids: [id], per_page: 1, page: 1 },
            });
            const row = (res.data?.data || [])[0];
            if (row) {
                setResolved(row);
                setOptions((prev) => mergeById([row, ...(prev || [])]));
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        if (numericValue > 0) {
            resolveById(numericValue);
        } else {
            setResolved(null);
        }
    }, [numericValue, resolveById]);

    useEffect(() => {
        if (!open) {
            return;
        }
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            fetchList(query);
        }, 280);
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [open, query, fetchList]);

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
    }, [open, options.length, loading]);

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
        const next = !open;
        setOpen(next);
        if (next) {
            setQuery('');
        }
    };

    const pick = (id) => {
        const n = Number(id || 0);
        if (typeof onChange === 'function') {
            onChange(n > 0 ? String(n) : '');
        }
        setOpen(false);
        setQuery('');
    };

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            return options;
        }
        return options.filter((c) => {
            const hay = [c.name, c.phone, c.email, c.notes]
                .map((x) => String(x ?? ''))
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [options, query]);

    const panelContent = open && !disabled ? (
        <div
            ref={panelRef}
            className="fixed z-[300] flex max-h-[min(22rem,calc(100vh-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
            style={{ top: panelStyle.top, left: panelStyle.left, width: panelStyle.width }}
            role="listbox"
        >
            <div className="shrink-0 border-b border-slate-100 px-3 py-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2.5 py-2">
                    <AppIcon name="users" className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.9} />
                    <input
                        ref={searchInputRef}
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (filtered.length > 0) {
                                pick(filtered[0].id);
                            }
                        }}
                        placeholder="Tìm theo tên, SĐT, email, ghi chú..."
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5">
                {allowClear ? (
                    <button
                        type="button"
                        className="mb-1 flex w-full items-center rounded-xl px-2.5 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-50"
                        onClick={() => pick('')}
                    >
                        {clearLabel}
                    </button>
                ) : null}
                {loading ? (
                    <p className="px-2 py-3 text-center text-sm text-text-muted">Đang tải...</p>
                ) : filtered.length === 0 ? (
                    <p className="px-2 py-3 text-center text-sm text-text-muted">Không có khách hàng phù hợp.</p>
                ) : (
                    <ul className="space-y-0.5">
                        {filtered.map((c) => (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    className={`flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm transition hover:bg-slate-50 active:bg-slate-100 ${
                                        Number(c.id) === numericValue ? 'bg-primary/5 ring-1 ring-primary/15' : ''
                                    }`}
                                    onClick={() => pick(c.id)}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block whitespace-normal break-words text-slate-800">
                                            {formatClientOptionLabel(c, { maxLength: 200 })}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    ) : null;

    const rootClass = `${filterControlClass} flex min-h-[46px] items-center justify-between gap-2 text-left ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-slate-300/90'
    } ${open && !disabled ? 'border-primary bg-white ring-2 ring-primary/10' : ''} ${className}`.trim();

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                className={rootClass}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={toggleOpen}
            >
                <span
                    className={`min-w-0 flex-1 text-sm ${triggerLabel ? 'text-slate-800' : 'text-slate-500'}`}
                    title={triggerLabel || placeholder}
                >
                    {triggerLabel ? (
                        <span className="line-clamp-2 break-words text-left">{triggerLabel}</span>
                    ) : (
                        placeholder
                    )}
                </span>
                <AppIcon
                    name="chevron-down"
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    strokeWidth={1.9}
                />
            </button>

            {typeof document !== 'undefined' && panelContent ? createPortal(panelContent, document.body) : null}
        </div>
    );
}
