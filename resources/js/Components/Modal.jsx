import React from 'react';

const sizeMap = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
};

export default function Modal({
    open,
    title,
    description,
    onClose,
    size = 'lg',
    children,
}) {
    if (!open) return null;
    const sizeClass = sizeMap[size] || sizeMap.lg;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className={`w-full ${sizeClass} max-h-[90vh] rounded-2xl bg-white border border-slate-200/80 shadow-card flex flex-col overflow-hidden`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200/80">
                    <div>
                        {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
                        {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
                    </div>
                    {onClose && (
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={onClose}
                            aria-label="Đóng"
                        >
                            Đóng
                        </button>
                    )}
                </div>
                <div className="flex-1 p-5 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
}
