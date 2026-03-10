import React from 'react';
import PageContainer from '@/Components/PageContainer';

const tasks = [
    ['Viết 10 bài content cụm "dịch vụ seo"', 'High', '25/03/2026', 'Nguyễn A', 'Đang triển khai'],
    ['Kiểm tra index 30 URL sản phẩm', 'Medium', '22/03/2026', 'Trần B', 'Nhận task'],
    ['Audit onpage landing page mới', 'Urgent', '20/03/2026', 'Lê C', 'Done'],
];

export default function TasksBoard(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý công việc"
            description="Theo dõi task theo mức ưu tiên, nhân sự phụ trách và tiến độ thực tế."
            stats={[
                { label: 'Task mở', value: '126' },
                { label: 'Task hôm nay', value: '19' },
                { label: 'Task overdue', value: '7' },
                { label: 'Đã hoàn tất', value: '84' },
            ]}
        >
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-semibold">Danh sách task</h3>
                    <div className="text-xs text-slate-500">Filter: Dự án • Trạng thái • Ưu tiên</div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="text-left px-4 py-3">Tên task</th>
                                <th className="text-left px-4 py-3">Ưu tiên</th>
                                <th className="text-left px-4 py-3">Deadline</th>
                                <th className="text-left px-4 py-3">Phụ trách</th>
                                <th className="text-left px-4 py-3">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((row) => (
                                <tr key={row[0]} className="border-t border-slate-100">
                                    {row.map((cell) => (
                                        <td key={cell} className="px-4 py-3">{cell}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageContainer>
    );
}
