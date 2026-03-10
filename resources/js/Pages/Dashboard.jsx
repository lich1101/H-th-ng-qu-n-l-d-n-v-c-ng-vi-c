import React from 'react';
import PageContainer from '@/Components/PageContainer';
import RoleBarChart from '@/Components/RoleBarChart';

export default function Dashboard(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Tổng quan vận hành"
            description="Theo dõi nhanh tiến độ dự án, hiệu suất nhân sự và các hạng mục cần xử lý trong ngày."
            stats={[
                { label: 'Dự án đang triển khai', value: '18', note: '+2 so với tuần trước' },
                { label: 'Task sắp đến hạn (3 ngày)', value: '26', note: 'Cần ưu tiên nhóm sản xuất' },
                { label: 'Task quá hạn', value: '7', note: 'Đã gửi nhắc tự động' },
                { label: 'Tỷ lệ đúng deadline', value: '87%', note: 'Mục tiêu tháng: 90%' },
            ]}
        >
            <div className="grid gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-900 mb-4">Việc cần làm hôm nay</h3>
                    <div className="space-y-3">
                        {[
                            ['Kiểm duyệt task backlinks batch 03', 'Trưởng phòng sản xuất', '14:00'],
                            ['Meeting bàn giao dự án Acme', 'Sales + Leader', '15:30'],
                            ['Xuất báo cáo KPI tuần', 'Admin', '17:00'],
                        ].map(([task, owner, time]) => (
                            <div key={task} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                                <div>
                                    <p className="font-medium text-slate-800">{task}</p>
                                    <p className="text-xs text-slate-500">{owner}</p>
                                </div>
                                <span className="text-sm font-semibold text-sky-700">{time}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-900 mb-4">Biểu đồ năng lực phòng ban</h3>
                    <RoleBarChart
                        data={[
                            { label: 'Kinh doanh', value: 68 },
                            { label: 'Sản xuất', value: 82 },
                            { label: 'QA / Duyệt', value: 74 },
                        ]}
                    />
                </div>
            </div>
        </PageContainer>
    );
}
