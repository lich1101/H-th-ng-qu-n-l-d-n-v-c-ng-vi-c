import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function DeadlineReminders(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Nhắc nhở deadline"
            description="Tự động cảnh báo khi còn 3 ngày, 1 ngày hoặc đã quá hạn."
            stats={[
                { label: 'Lịch nhắc hôm nay', value: '43' },
                { label: 'Qua email', value: '12' },
                { label: 'Trong hệ thống', value: '27' },
                { label: 'Telegram/Zalo', value: '4' },
            ]}
        >
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Task sắp quá hạn</h3>
                    <ul className="space-y-2 text-sm">
                        <li className="p-3 rounded-lg bg-amber-50 border border-amber-200">Audit 20 URL - còn 1 ngày</li>
                        <li className="p-3 rounded-lg bg-rose-50 border border-rose-200">Viết content cluster - quá hạn 2 ngày</li>
                        <li className="p-3 rounded-lg bg-amber-50 border border-amber-200">Bàn giao video case study - còn 3 ngày</li>
                    </ul>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Thiết lập kênh nhắc</h3>
                    <div className="space-y-3 text-sm text-slate-700">
                        <div className="flex items-center justify-between"><span>In-app</span><span className="text-emerald-600">Đang bật</span></div>
                        <div className="flex items-center justify-between"><span>Email SMTP</span><span className="text-emerald-600">Đang bật</span></div>
                        <div className="flex items-center justify-between"><span>Telegram bot</span><span className="text-amber-600">Chờ cấu hình</span></div>
                        <div className="flex items-center justify-between"><span>Zalo OA</span><span className="text-amber-600">Chờ cấu hình</span></div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
