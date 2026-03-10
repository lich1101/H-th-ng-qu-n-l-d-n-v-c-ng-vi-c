import React from 'react';
import { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import RoleBarChart from '@/Components/RoleBarChart';

export default function ReportsKPI(props) {
    const [summary, setSummary] = useState({
        projects: { total: 0, in_progress: 0, pending_review: 0 },
        tasks: { total: 0, completed: 0, overdue: 0, on_time_rate: 0 },
        service_breakdown: [],
    });

    useEffect(() => {
        axios.get('/api/v1/reports/dashboard-summary').then((res) => {
            setSummary(res.data);
        });
    }, []);

    return (
        <PageContainer
            auth={props.auth}
            title="Báo cáo & KPI"
            description="Theo dõi hiệu suất cá nhân, phòng ban, dự án và từng loại dịch vụ."
            stats={[
                { label: 'Tỷ lệ đúng hạn toàn hệ thống', value: `${summary.tasks.on_time_rate}%` },
                { label: 'Task hoàn thành', value: summary.tasks.completed },
                { label: 'Dự án đang triển khai', value: summary.projects.in_progress },
                { label: 'Task quá hạn', value: summary.tasks.overdue },
            ]}
        >
            <div className="grid gap-4 xl:grid-cols-3">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm xl:col-span-2">
                    <h3 className="font-semibold mb-3">Báo cáo theo dịch vụ</h3>
                    <RoleBarChart data={summary.service_breakdown.map((item) => ({
                        label: item.label,
                        value: item.value,
                    }))} />
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
