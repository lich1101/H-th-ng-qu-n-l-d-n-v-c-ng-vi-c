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
                <div className="rounded-2xl bg-white border border-slate-200/80 p-6 shadow-card">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-text-subtle">Tổng quan</p>
                            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
                            <p className="text-sm text-text-muted mt-1">{description}</p>
                        </div>
                    </div>
                </div>
            }
        >
            <Head title={title} />

            {stats.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
                    {stats.map((item) => (
                        <div key={item.label} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                            <p className="text-xs uppercase tracking-wide text-text-subtle">{item.label}</p>
                            <p className="mt-2 text-2xl font-semibold text-primary">{item.value}</p>
                            {item.note && <p className="mt-1 text-xs text-text-muted">{item.note}</p>}
                        </div>
                    ))}
                </div>
            )}

            {children}
        </Authenticated>
    );
}
