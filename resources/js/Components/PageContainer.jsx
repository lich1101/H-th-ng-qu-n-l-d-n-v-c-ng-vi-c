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

            {children}
        </Authenticated>
    );
}
