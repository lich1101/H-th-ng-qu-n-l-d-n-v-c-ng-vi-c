import React from 'react';
import { Head, usePage } from '@inertiajs/inertia-react';
import Authenticated from '@/Layouts/Authenticated';

export default function PageContainer({
    auth,
    title,
    description,
    stats = [],
    actions = null,
    children,
}) {
    const page = usePage();
    const resolvedAuth = auth || page?.props?.auth || { user: null };

    return (
        <Authenticated
            auth={resolvedAuth}
            header={
                <div className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-soft sm:p-5 md:p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.22em] text-primary/70">Workspace overview</p>
                            <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
                        </div>
                        {actions ? (
                            <div className="flex items-center justify-end">{actions}</div>
                        ) : (
                            <div className="hidden h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-primary shadow-card md:flex">
                                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 3l2.3 4.66L19 8.34l-3.5 3.41.83 4.82L12 14.27l-4.33 2.3.83-4.82L5 8.34l4.7-.68L12 3z" />
                                </svg>
                            </div>
                        )}
                    </div>
                </div>
            }
        >
            <Head title={title} />

            {children}
        </Authenticated>
    );
}
