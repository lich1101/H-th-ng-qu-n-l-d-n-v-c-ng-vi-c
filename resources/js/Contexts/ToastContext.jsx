import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
        if (timersRef.current[id]) {
            clearTimeout(timersRef.current[id]);
            delete timersRef.current[id];
        }
    }, []);

    const pushToast = useCallback(
        ({ type = 'success', message = '', duration = 3000 }) => {
            const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const toast = { id, type, message };
            setToasts((prev) => [...prev, toast]);
            timersRef.current[id] = setTimeout(() => {
                removeToast(id);
            }, duration);
            return id;
        },
        [removeToast]
    );

    const value = useMemo(
        () => ({
            pushToast,
            success: (message, duration) => pushToast({ type: 'success', message, duration }),
            error: (message, duration) => pushToast({ type: 'error', message, duration }),
            removeToast,
        }),
        [pushToast, removeToast]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] flex w-full max-w-sm flex-col gap-2 px-4">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`rounded-lg border px-4 py-3 text-sm font-medium shadow-md ${
                            toast.type === 'success'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <span>{toast.message}</span>
                            <button
                                type="button"
                                onClick={() => removeToast(toast.id)}
                                className="text-xs opacity-70 hover:opacity-100"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}
