import React from 'react';

export default function RoleBarChart({ data }) {
    const max = Math.max(...data.map((item) => item.value), 1);

    return (
        <div className="space-y-3">
            {data.map((item) => (
                <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-900">{item.value}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${(item.value / max) * 100}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
