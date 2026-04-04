import React from 'react';

export default function TopicListPage({
    loading,
    topics,
    search,
    onSearchChange,
    onSearch,
    onOpenTopic,
    onEditTopic,
    onRemoveTopic,
    canEdit,
}) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Danh sách topic barem</h3>
                    <p className="text-sm text-text-muted">Bấm vào topic để mở trang danh sách công việc mẫu.</p>
                </div>
                <div className="flex w-full max-w-xl gap-2">
                    <input
                        className="h-11 flex-1 rounded-2xl border border-slate-200/80 bg-white px-4 text-sm"
                        placeholder="Tìm theo topic, công việc mẫu hoặc đầu việc mẫu"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                    <button type="button" className="rounded-2xl border border-slate-200 px-4 text-sm font-semibold" onClick={onSearch}>
                        Lọc
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="py-10 text-center text-sm text-text-muted">Đang tải barem...</div>
            ) : (
                <div className="space-y-4">
                    {topics.map((topic) => (
                        <div key={topic.id} className="rounded-2xl border border-slate-200/80 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <button type="button" className="text-left" onClick={() => onOpenTopic(topic)}>
                                    <div className="text-xs text-text-muted">#{topic.id} {topic.code ? `• ${topic.code}` : ''}</div>
                                    <h4 className="text-base font-semibold text-slate-900 hover:text-primary">{topic.name}</h4>
                                    <p className="mt-1 text-sm text-text-muted">{topic.description || 'Không có mô tả.'}</p>
                                    <p className="mt-2 text-xs text-text-muted">Công việc mẫu: {(topic.tasks || []).length}</p>
                                </button>
                                <div className="flex items-center gap-2">
                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${topic.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                                        {topic.is_active ? 'Đang dùng' : 'Đang tắt'}
                                    </span>
                                    {canEdit && (
                                        <>
                                            <button type="button" className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => onEditTopic(topic)}>
                                                Sửa
                                            </button>
                                            <button type="button" className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600" onClick={() => onRemoveTopic(topic)}>
                                                Xóa
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {topics.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-text-muted">
                            Chưa có topic barem nào.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
