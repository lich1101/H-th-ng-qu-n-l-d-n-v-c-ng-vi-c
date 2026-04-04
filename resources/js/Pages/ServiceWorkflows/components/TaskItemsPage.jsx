import React from 'react';

export default function TaskItemsPage({
    selectedTopic,
    selectedTask,
    canEdit,
    onBack,
    onOpenAddItem,
}) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Đầu việc mẫu • {selectedTask?.title || '—'}</h3>
                    <p className="text-sm text-text-muted">Topic: {selectedTopic?.name || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold" onClick={onBack}>
                        Quay lại công việc
                    </button>
                    {canEdit && (
                        <button type="button" className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={onOpenAddItem}>
                            + Thêm đầu việc
                        </button>
                    )}
                </div>
            </div>

            {!selectedTask ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-text-muted">
                    Không tìm thấy công việc mẫu.
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200/80">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-text-subtle">
                            <tr>
                                <th className="px-4 py-3 text-left">Đầu việc</th>
                                <th className="px-4 py-3 text-left">Tỷ trọng</th>
                                <th className="px-4 py-3 text-left">Timeline</th>
                                <th className="px-4 py-3 text-left">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(selectedTask.items || []).map((item) => (
                                <tr key={item.id} className="border-t border-slate-100">
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-slate-900">{item.title}</div>
                                        <div className="text-xs text-text-muted">{item.description || '—'}</div>
                                    </td>
                                    <td className="px-4 py-3">{item.weight_percent || 0}%</td>
                                    <td className="px-4 py-3">+{item.start_offset_days || 0} ngày • {item.duration_days || 1} ngày</td>
                                    <td className="px-4 py-3">{item.status || 'todo'}</td>
                                </tr>
                            ))}
                            {(selectedTask.items || []).length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                                        Công việc này chưa có đầu việc mẫu.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
