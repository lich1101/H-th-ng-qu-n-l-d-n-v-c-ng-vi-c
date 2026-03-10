import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function ReportsKPI(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Báo cáo & KPI"
            description="Theo dõi hiệu suất cá nhân, phòng ban, dự án và từng loại dịch vụ."
            stats={[
                { label: 'Tỷ lệ đúng hạn toàn hệ thống', value: '87%' },
                { label: 'Task hoàn thành tuần này', value: '143' },
                { label: 'Hiệu suất phòng sản xuất', value: '82%' },
                { label: 'Dự án rủi ro', value: '4' },
            ]}
        >
            <div className="grid gap-4 xl:grid-cols-3">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm xl:col-span-2">
                    <h3 className="font-semibold mb-3">Báo cáo theo dịch vụ</h3>
                    <ul className="space-y-2 text-sm">
                        <li className="rounded-lg border border-slate-200 p-3">Backlinks: 1,240 link live / 1,500 cam kết</li>
                        <li className="rounded-lg border border-slate-200 p-3">Content: 312 bài hoàn thành, SEO score trung bình 78</li>
                        <li className="rounded-lg border border-slate-200 p-3">Audit: 524 URL đã audit, 71% issue đã xử lý</li>
                        <li className="rounded-lg border border-slate-200 p-3">Chăm sóc website: 38 lịch bảo trì, 12 báo cáo traffic tháng</li>
                    </ul>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Top nhân sự tuần</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between"><span>Nguyễn A</span><span>26 task</span></div>
                        <div className="flex justify-between"><span>Lê B</span><span>22 task</span></div>
                        <div className="flex justify-between"><span>Trần C</span><span>20 task</span></div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
