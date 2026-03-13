import React from 'react';
import ApplicationLogo from '@/Components/ApplicationLogo';
import { Link } from '@inertiajs/inertia-react';

export default function Guest({ children }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-100 px-6 py-10">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center gap-3 text-center mb-6">
                    <Link href="/" className="inline-flex items-center justify-center rounded-2xl bg-white shadow-card border border-emerald-100 p-4">
                        <ApplicationLogo className="w-12 h-12 fill-current text-primary" />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.3em] text-emerald-500 font-semibold">WinMap</p>
                        <p className="text-lg font-semibold text-slate-900">Quản lý nội bộ</p>
                        <p className="text-xs text-text-muted mt-1">CRM • Dự án • Báo cáo</p>
                    </div>
                </div>

                <div className="w-full px-6 py-6 bg-white/95 backdrop-blur border border-emerald-100 shadow-xl rounded-3xl">
                    {children}
                </div>
            </div>
        </div>
    );
}
