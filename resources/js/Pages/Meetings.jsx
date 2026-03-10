import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function Meetings(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Lịch họp bàn giao"
            description="Lên lịch meeting, gửi lời mời và lưu biên bản theo từng dự án/task."
            stats={[
                { label: 'Lịch họp tuần này', value: '11' },
                { label: 'Đã gửi mời', value: '9' },
                { label: 'Chờ xác nhận', value: '2' },
                { label: 'Biên bản đã lưu', value: '16' },
            ]}
        >
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 font-semibold">Lịch họp sắp tới</div>
                <div className="divide-y divide-slate-100">
                    {[
                        ['14/03 15:30', 'Bàn giao dự án SEO tổng thể Acme', 'Google Meet'],
                        ['15/03 10:00', 'Review quality task content batch 2', 'Zoom'],
                        ['16/03 09:00', 'Kickoff dự án backlinks mới', 'Google Meet'],
                    ].map(([time, subject, platform]) => (
                        <div key={subject} className="px-4 py-3 flex justify-between text-sm">
                            <div>
                                <p className="font-medium">{subject}</p>
                                <p className="text-slate-500">{platform}</p>
                            </div>
                            <span className="text-slate-700">{time}</span>
                        </div>
                    ))}
                </div>
            </div>
        </PageContainer>
    );
}
