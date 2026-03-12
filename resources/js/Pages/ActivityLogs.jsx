import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function ActivityLogs(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Nhật ký hệ thống"
            description="Theo dõi lịch sử chỉnh sửa, thay đổi trạng thái và thao tác upload toàn hệ thống."
            stats={[
                { label: 'Log hôm nay', value: '1,284' },
                { label: 'Đổi trạng thái task', value: '312' },
                { label: 'Cập nhật dự án', value: '74' },
                { label: 'Upload bàn giao', value: '56' },
            ]}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200/80 text-sm text-slate-500">
                    Bộ lọc: người dùng • loại thao tác • khoảng thời gian
                </div>
                <div className="divide-y divide-slate-100 text-sm">
                    {[
                        ['11:32', 'Nguyễn A', 'task_status_changed', 'Task #203: dang_trien_khai -> done'],
                        ['10:58', 'Trần B', 'project_status_changed', 'Project #19: cho_duyet -> hoan_thanh'],
                        ['10:14', 'Lê C', 'upload_handover', 'Task #221: upload video v3'],
                    ].map((row) => (
                        <div key={row.join('-')} className="px-4 py-3 grid grid-cols-12 gap-2">
                            <span className="col-span-2 text-slate-500">{row[0]}</span>
                            <span className="col-span-2 font-medium">{row[1]}</span>
                            <span className="col-span-3">{row[2]}</span>
                            <span className="col-span-5 text-slate-600">{row[3]}</span>
                        </div>
                    ))}
                </div>
            </div>
        </PageContainer>
    );
}
