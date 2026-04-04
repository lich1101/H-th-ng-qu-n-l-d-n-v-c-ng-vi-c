import React from 'react';

export default function TopicTasksPage({
    selectedTopic,
    canEdit,
    onBack,
    onOpenTask,
    onOpenAddTask,
}) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Công việc mẫu • {selectedTopic?.name || '—'}</h3>
                    <p className="text-sm text-text-muted">Bấm vào công việc để mở trang danh sách đầu việc.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold" onClick={onBack}>
                        Quay lại topic
                    </button>
                    {canEdit && (
                        <button type="button" className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={onOpenAddTask}>
                            + Thêm công việc
                        </button>
                    )}
                </div>
            </div>

            {!selectedTopic ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-text-muted">
                    Không tìm thấy topic barem.
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200/80">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-text-subtle">
                            <tr>
                                <th className="px-4 py-3 text-left">Công việc</th>
                                <th className="px-4 py-3 text-left">Tỷ trọng</th>
                                <th className="px-4 py-3 text-left">Timeline</th>
                                <th className="px-4 py-3 text-left">Đầu việc mẫu</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(selectedTopic.tasks || []).map((task) => (
                                <tr
                                    key={task.id}
                                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                                    onClick={() => onOpenTask(task)}
                                >
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-slate-900">{task.title}</div>
                                        <div className="text-xs text-text-muted">{task.description || '—'}</div>
                                    </td>
                                    <td className="px-4 py-3">{task.weight_percent || 0}%</td>
                                    <td className="px-4 py-3">+{task.start_offset_days || 0} ngày • {task.duration_days || 1} ngày</td>
                                    <td className="px-4 py-3">{task.items?.length || 0}</td>
                                </tr>
                            ))}
                            {(selectedTopic.tasks || []).length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                                        Topic này chưa có công việc mẫu.
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
