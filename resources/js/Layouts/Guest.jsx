import React, { useEffect } from 'react';
import ApplicationLogo from '@/Components/ApplicationLogo';
import { Link, usePage } from '@inertiajs/inertia-react';

export default function Guest({ children }) {
    const { settings } = usePage().props;
    const brandName = settings?.brand_name || 'Quản lý nội bộ';
    const logoUrl = settings?.logo_url;

    useEffect(() => {
        if (!settings?.primary_color) return;
        const hex = settings.primary_color.replace('#', '').trim();
        if (hex.length !== 6) return;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return;
        document.documentElement.style.setProperty('--color-primary', `${r} ${g} ${b}`);
    }, [settings?.primary_color]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-white to-primary/20 px-6 py-10">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center gap-3 text-center mb-6">
                    <Link href="/" className="inline-flex items-center justify-center rounded-2xl bg-white shadow-card border border-primary/20 p-4">
                        <ApplicationLogo className="w-12 h-12 fill-current text-primary" logoUrl={logoUrl} brandName={brandName} />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.3em] text-primary font-semibold">{brandName}</p>
                        <p className="text-lg font-semibold text-slate-900">Quản lý nội bộ</p>
                        <p className="text-xs text-text-muted mt-1">CRM • Dự án • Báo cáo</p>
                    </div>
                </div>

                <div className="w-full px-6 py-6 bg-white/95 backdrop-blur border border-primary/20 shadow-xl rounded-3xl">
                    {children}
                </div>
            </div>
        </div>
    );
}
