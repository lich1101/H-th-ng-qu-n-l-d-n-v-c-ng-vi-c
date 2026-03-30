import React from 'react';
import { Head } from '@inertiajs/inertia-react';
import Authenticated from '@/Layouts/Authenticated';

export default function PageContainer({
    auth,
    title,
    description,
    stats = [],
    children,
}) {
    return (
        <Authenticated
            auth={auth}
            header={
                <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/96 p-6 shadow-soft">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.12),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(234,241,245,0.92))]" />
                    <div className="absolute -right-6 top-5 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                    <div className="absolute bottom-0 right-16 h-20 w-20 rounded-full bg-slate-200/70 blur-2xl" />
                    <div className="relative flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="relative z-10">
                            <p className="text-xs uppercase tracking-[0.22em] text-primary/70">Workspace overview</p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
                        </div>
                        <div className="relative z-10 hidden h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/95 text-primary shadow-card md:flex">
                            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 3l2.3 4.66L19 8.34l-3.5 3.41.83 4.82L12 14.27l-4.33 2.3.83-4.82L5 8.34l4.7-.68L12 3z" />
                            </svg>
                        </div>
                    </div>
                </div>
            }
        >
            <Head title={title} />

            {children}
        </Authenticated>
    );
}
