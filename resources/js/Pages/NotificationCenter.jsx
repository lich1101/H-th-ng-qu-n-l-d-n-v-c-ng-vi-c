import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';

export default function NotificationCenter(props) {
    const [reminders, setReminders] = useState([]);
    const [logs, setLogs] = useState([]);

    const fetchData = async () => {
        const response = await axios.get('/api/v1/notifications/in-app');
        setReminders(response.data.reminders || []);
        setLogs(response.data.logs || []);
    };

    useEffect(() => {
        fetchData();
        const timer = setInterval(fetchData, 30000);
        return () => clearInterval(timer);
    }, []);

    const markRead = async (sourceType, sourceId) => {
        await axios.post('/api/v1/notifications/in-app/read', {
            source_type: sourceType,
            source_id: sourceId,
        });
        fetchData();
    };

    const markAllRead = async (sourceType) => {
        await axios.post('/api/v1/notifications/in-app/read-all', {
            source_type: sourceType,
        });
        fetchData();
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Trung tâm thông báo"
            description="Theo dõi nhắc deadline và hoạt động hệ thống theo thời gian thực."
            stats={[
                { label: 'Nhắc deadline', value: reminders.length },
                { label: 'Hoạt động mới', value: logs.length },
                { label: 'Cập nhật tự động', value: '30s/lần' },
                { label: 'Nguồn', value: 'API nội bộ' },
            ]}
        >
            <div className="grid gap-5 xl:grid-cols-2">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Nhắc deadline</h3>
                        <button
                            type="button"
                            className="text-xs text-primary"
                            onClick={() => markAllRead('deadline_reminder')}
                        >
                            Đọc tất cả
                        </button>
                    </div>
                    <div className="space-y-3 text-sm">
                        {reminders.map((item) => (
                            <div
                                key={item.id}
                                className={`rounded-2xl border p-4 ${
                                    item.is_read ? 'border-slate-200/80 bg-white' : 'border-primary/30 bg-primary/5'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold">{item.task_title || 'Task'}</p>
                                    <span className="text-xs text-text-muted">{item.channel}</span>
                                </div>
                                <p className="text-xs text-text-muted mt-2">
                                    {item.trigger_type} • {item.status}
                                </p>
                                {!item.is_read && (
                                    <button
                                        type="button"
                                        className="mt-3 text-xs text-primary"
                                        onClick={() => markRead('deadline_reminder', item.id)}
                                    >
                                        Đánh dấu đã đọc
                                    </button>
                                )}
                            </div>
                        ))}
                        {reminders.length === 0 && (
                            <p className="text-text-muted">Chưa có thông báo nhắc deadline.</p>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Hoạt động hệ thống</h3>
                        <button
                            type="button"
                            className="text-xs text-primary"
                            onClick={() => markAllRead('activity_log')}
                        >
                            Đọc tất cả
                        </button>
                    </div>
                    <div className="space-y-3 text-sm">
                        {logs.map((item) => (
                            <div
                                key={item.id}
                                className={`rounded-2xl border p-4 ${
                                    item.is_read ? 'border-slate-200/80 bg-white' : 'border-primary/30 bg-primary/5'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold">{item.action}</p>
                                    <span className="text-xs text-text-muted">{item.actor || 'system'}</span>
                                </div>
                                <p className="text-xs text-text-muted mt-2">
                                    {item.subject_type} #{item.subject_id}
                                </p>
                                {!item.is_read && (
                                    <button
                                        type="button"
                                        className="mt-3 text-xs text-primary"
                                        onClick={() => markRead('activity_log', item.id)}
                                    >
                                        Đánh dấu đã đọc
                                    </button>
                                )}
                            </div>
                        ))}
                        {logs.length === 0 && (
                            <p className="text-text-muted">Chưa có activity mới.</p>
                        )}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
