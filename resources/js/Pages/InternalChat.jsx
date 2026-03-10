import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function InternalChat(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Chat nội bộ"
            description="Trao đổi trực tiếp theo task, tag người liên quan và lưu lịch sử xử lý."
            stats={[
                { label: 'Tin nhắn hôm nay', value: '248' },
                { label: 'Task có thảo luận', value: '63' },
                { label: 'File đính kèm', value: '41' },
                { label: 'Chưa đọc', value: '12' },
            ]}
        >
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm lg:col-span-1">
                    <h3 className="font-semibold mb-3">Kênh công việc</h3>
                    <ul className="space-y-2 text-sm">
                        <li className="rounded-lg bg-sky-50 border border-sky-200 p-2">#du-an-acme</li>
                        <li className="rounded-lg border border-slate-200 p-2">#content-batch-3</li>
                        <li className="rounded-lg border border-slate-200 p-2">#audit-technical</li>
                    </ul>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm lg:col-span-2">
                    <h3 className="font-semibold mb-3">Luồng hội thoại</h3>
                    <div className="space-y-3 text-sm">
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">@Lan: Em đã cập nhật file bàn giao v2 cho task #221.</div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">@Minh: Anh duyệt outline, em triển khai bản cuối trước 16h nhé.</div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">@Khanh: Meeting với khách dời sang 15:30, mọi người xác nhận giúp.</div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
