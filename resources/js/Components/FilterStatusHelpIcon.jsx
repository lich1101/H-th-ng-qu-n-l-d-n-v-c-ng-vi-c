import React from 'react';

/**
 * @param {{ items: { value?: string, label: string, description: string }[], ariaLabel?: string }} props
 */
export default function FilterStatusHelpIcon({ items, ariaLabel = 'Giải thích các giá trị lọc' }) {
    const list = (items || []).filter((i) => i?.label && i?.description);

    if (!list.length) {
        return null;
    }

    return (
        <div className="group relative inline-flex align-middle">
            <button
                type="button"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold leading-none text-slate-500 transition hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label={ariaLabel}
            >
                i
            </button>
            <div className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1 w-[min(100vw-2rem,20rem)] max-w-sm rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100">
                <ul className="space-y-2">
                    {list.map((i) => (
                        <li key={i.value || i.label}>
                            <span className="font-semibold text-slate-900">{i.label}</span>
                            <span className="text-slate-600"> — {i.description}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
