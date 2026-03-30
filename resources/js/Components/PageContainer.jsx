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
                <div className="relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-slate-950 p-6 shadow-soft">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.34),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.18),transparent_32%)]" />
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="relative z-10">
                            <p className="text-xs uppercase tracking-[0.22em] text-white/60">Workspace overview</p>
                            <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/82">{description}</p>
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
