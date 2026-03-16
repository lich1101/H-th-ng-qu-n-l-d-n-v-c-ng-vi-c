import React, { useEffect } from 'react';
import ApplicationLogo from '@/Components/ApplicationLogo';
import { Link, usePage } from '@inertiajs/inertia-react';

export default function Guest({ children }) {
    const { settings } = usePage().props;
    const brandName = settings?.brand_name || 'Job ClickOn';
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
            <div className="w-full max-w-5xl">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                    <div className="rounded-[32px] border border-primary/15 bg-white/90 shadow-2xl px-8 py-10 flex flex-col justify-between">
                        <div>
                            <Link href="/" className="inline-flex items-center justify-center rounded-2xl bg-white shadow-card border border-primary/20 p-4">
                                <ApplicationLogo className="w-12 h-12 fill-current text-primary" logoUrl={logoUrl} brandName={brandName} />
                            </Link>
                            <div className="mt-6">
                                <p className="text-xs uppercase tracking-[0.3em] text-primary font-semibold">{brandName}</p>
                                <p className="text-2xl font-semibold text-slate-900 mt-2">Quản lý nội bộ</p>
                                <p className="text-sm text-text-muted mt-2">CRM • Dự án • Báo cáo • Kế toán</p>
                            </div>
                            <div className="mt-8 grid gap-4 text-sm text-slate-700">
                                <div className="flex items-center gap-3">
                                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                                    Theo dõi tiến độ dự án theo thời gian thực
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                                    Phân quyền phòng ban và duyệt tiến độ
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
                                    Báo cáo KPI, doanh thu, công nợ tổng hợp
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-text-muted mt-8">
                            © 2026 {brandName}. All rights reserved.
                        </div>
                    </div>

                    <div className="w-full px-6 py-6 bg-white/95 backdrop-blur border border-primary/20 shadow-xl rounded-3xl">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
