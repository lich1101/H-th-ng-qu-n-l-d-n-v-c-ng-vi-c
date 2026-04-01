import React from 'react';

const sizeMap = {
    sm: 'max-w-md',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
};

export default function Modal({
    open,
    title = 'Thông tin',
    description,
    onClose,
    size = 'lg',
    children,
}) {
    if (!open) return null;
    const sizeClass = sizeMap[size] || sizeMap.lg;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 md:px-8 md:py-10 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                data-modal-panel="true"
                className={`relative w-full ${sizeClass} max-h-[90vh] rounded-3xl bg-white border border-slate-200/80 shadow-[0_30px_80px_rgba(15,23,42,0.22)] flex flex-col overflow-hidden`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between border-b border-slate-200/80 bg-slate-50/80 px-7 py-5 md:px-10">
                    <div>
                        {title && <h3 className="text-xl font-semibold text-slate-900">{title}</h3>}
                        {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
                    </div>
                    {onClose && (
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
                            onClick={onClose}
                            aria-label="Đóng"
                        >
                            Đóng
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto px-7 py-7 md:px-10 md:py-9">{children}</div>
            </div>
        </div>
    );
}
