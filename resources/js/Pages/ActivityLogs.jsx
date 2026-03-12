import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function ActivityLogs(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Nhật ký hệ thống"
            description="Theo dõi lịch sử chỉnh sửa, thay đổi trạng thái và thao tác tải lên toàn hệ thống."
            stats={[
                { label: 'Nhật ký hôm nay', value: '1,284' },
                { label: 'Đổi trạng thái công việc', value: '312' },
                { label: 'Cập nhật dự án', value: '74' },
                { label: 'Tải lên bàn giao', value: '56' },
            ]}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200/80 text-sm text-slate-500">
                    Bộ lọc: người dùng • loại thao tác • khoảng thời gian
                </div>
                <div className="divide-y divide-slate-100 text-sm">
                    {[
                        ['11:32', 'Nguyễn A', 'Đổi trạng thái công việc', 'Công việc #203: đang triển khai -> hoàn tất'],
                        ['10:58', 'Trần B', 'Đổi trạng thái dự án', 'Dự án #19: chờ duyệt -> hoàn thành'],
                        ['10:14', 'Lê C', 'Tải lên bàn giao', 'Công việc #221: tải lên video v3'],
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
