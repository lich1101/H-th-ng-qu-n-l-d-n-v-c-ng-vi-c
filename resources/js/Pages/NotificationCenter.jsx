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
            <div className="grid gap-4 xl:grid-cols-2">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">Nhắc deadline</h3>
                        <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border border-slate-300"
                            onClick={() => markAllRead('deadline_reminder')}
                        >
                            Đọc tất cả
                        </button>
                    </div>
                    <div className="space-y-2 text-sm">
                        {reminders.map((item) => (
                            <div
                                key={item.id}
                                className={`rounded-lg border p-3 ${
                                    item.is_read ? 'border-slate-200 bg-white' : 'border-sky-200 bg-sky-50'
                                }`}
                            >
                                <p className="font-medium">{item.task_title || 'Task'}</p>
                                <p className="text-slate-500">
                                    {item.trigger_type} • {item.channel} • {item.status}
                                </p>
                                {!item.is_read && (
                                    <button
                                        type="button"
                                        className="mt-2 text-xs text-sky-700"
                                        onClick={() => markRead('deadline_reminder', item.id)}
                                    >
                                        Đánh dấu đã đọc
                                    </button>
                                )}
                            </div>
                        ))}
                        {reminders.length === 0 && <p className="text-slate-500">Chưa có thông báo nhắc deadline.</p>}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">Hoạt động hệ thống</h3>
                        <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border border-slate-300"
                            onClick={() => markAllRead('activity_log')}
                        >
                            Đọc tất cả
                        </button>
                    </div>
                    <div className="space-y-2 text-sm">
                        {logs.map((item) => (
                            <div
                                key={item.id}
                                className={`rounded-lg border p-3 ${
                                    item.is_read ? 'border-slate-200 bg-white' : 'border-sky-200 bg-sky-50'
                                }`}
                            >
                                <p className="font-medium">{item.action}</p>
                                <p className="text-slate-500">
                                    {item.subject_type} #{item.subject_id} • {item.actor || 'system'}
                                </p>
                                {!item.is_read && (
                                    <button
                                        type="button"
                                        className="mt-2 text-xs text-sky-700"
                                        onClick={() => markRead('activity_log', item.id)}
                                    >
                                        Đánh dấu đã đọc
                                    </button>
                                )}
                            </div>
                        ))}
                        {logs.length === 0 && <p className="text-slate-500">Chưa có activity mới.</p>}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
