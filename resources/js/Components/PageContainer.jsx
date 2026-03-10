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
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
                    <p className="text-sm text-slate-600 mt-1">{description}</p>
                </div>
            }
        >
            <Head title={title} />

            {stats.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-5">
                    {stats.map((item) => (
                        <div key={item.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-sm text-slate-500">{item.label}</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                            {item.note && <p className="mt-1 text-xs text-slate-400">{item.note}</p>}
                        </div>
                    ))}
                </div>
            )}

            {children}
        </Authenticated>
    );
}
