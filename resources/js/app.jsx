import './bootstrap';
import 'tom-select/dist/css/tom-select.css';
import '../css/app.css';

import React, { useEffect } from 'react';
import { render } from 'react-dom';
import { createInertiaApp } from '@inertiajs/inertia-react';
import { InertiaProgress } from '@inertiajs/progress';
import { ToastProvider } from '@/Contexts/ToastContext';
import { setupGlobalUxEnhancer } from '@/lib/globalUxEnhancer';

const appName = window.document.getElementsByTagName('title')[0]?.innerText || 'Jobs ClickOn';
const pages = require.context('./Pages', true, /\.jsx$/);
const pageKeys = pages.keys();

function HistoryStateRecovery() {
    const handleReload = () => {
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    };

    const handleGoDashboard = () => {
        if (typeof window !== 'undefined') {
            window.location.href = '/dashboard';
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 px-6 py-12">
            <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Khoi phuc man hinh</p>
                <h1 className="mt-3 text-2xl font-semibold text-slate-900">Khong the khoi phuc trang truoc do</h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                    Trinh duyet dang giu mot lich su dieu huong cu bi hong state, nen he thong khong xac dinh duoc man hinh can mo.
                    Tai lai trang se tao lai state dung va tranh loi trang trang.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={handleReload}
                        className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                        Tai lai trang
                    </button>
                    <button
                        type="button"
                        onClick={handleGoDashboard}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                    >
                        Ve dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}

function AppShell({ App, props }) {
    useEffect(() => {
        return setupGlobalUxEnhancer();
    }, []);

    return (
        <ToastProvider>
            <App {...props} />
        </ToastProvider>
    );
}

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) => {
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const pageKey = `./${normalizedName}.jsx`;

        if (!normalizedName || !pageKeys.includes(pageKey)) {
            // Tránh trắng trang nếu history state cũ đã bị ghi đè làm mất component name.
            console.error('Inertia page resolve failed', {
                requestedName: name,
                availablePageCount: pageKeys.length,
                historyState: typeof window !== 'undefined' ? window.history.state : null,
            });

            return HistoryStateRecovery;
        }

        return pages(pageKey).default;
    },
    setup({ el, App, props }) {
        return render(<AppShell App={App} props={props} />, el);
    },
});

InertiaProgress.init({ color: '#4B5563' });
