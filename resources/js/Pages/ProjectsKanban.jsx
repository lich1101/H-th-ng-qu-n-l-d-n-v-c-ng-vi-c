import React from 'react';
import PageContainer from '@/Components/PageContainer';

const columns = [
    { key: 'moi_tao', title: 'Mới tạo', items: ['Website ABC - Audit ban đầu', 'Backlinks chiến dịch Q2'] },
    { key: 'dang_trien_khai', title: 'Đang triển khai', items: ['SEO tổng thể Acme', 'Content cụm từ khóa tuyển sinh'] },
    { key: 'cho_duyet', title: 'Chờ duyệt', items: ['Audit technical website WinMap'] },
    { key: 'hoan_thanh', title: 'Hoàn thành', items: ['Bảo trì website tháng 02'] },
];

export default function ProjectsKanban(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý dự án"
            description="Theo dõi pipeline dự án theo trạng thái, loại dịch vụ và deadline tổng."
            stats={[
                { label: 'Tổng dự án', value: '42' },
                { label: 'Đang triển khai', value: '18' },
                { label: 'Chờ duyệt', value: '6' },
                { label: 'Nguy cơ trễ', value: '4', note: 'Cần họp điều phối' },
            ]}
        >
            <div className="grid gap-4 xl:grid-cols-4">
                {columns.map((col) => (
                    <div key={col.key} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-200">
                            <h3 className="font-semibold text-slate-900">{col.title}</h3>
                        </div>
                        <div className="p-3 space-y-3">
                            {col.items.map((item) => (
                                <div key={item} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                                    <p className="text-sm font-medium">{item}</p>
                                    <p className="text-xs text-slate-500 mt-1">Deadline: 25/03/2026</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </PageContainer>
    );
}
