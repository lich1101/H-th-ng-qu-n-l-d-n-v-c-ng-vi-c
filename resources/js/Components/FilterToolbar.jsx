import React from 'react';

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

export default function FilterToolbar({
    title = '',
    description = '',
    className = '',
    actions = null,
    children,
}) {
    return (
        <div className={`mb-6 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-card ${className}`.trim()}>
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
            <div className={title || description || actions ? 'mt-4' : ''}>
                {children}
            </div>
        </div>
    );
}
