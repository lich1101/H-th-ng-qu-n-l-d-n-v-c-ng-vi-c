import React from 'react';
import PageContainer from '@/Components/PageContainer';
import RoleBarChart from '@/Components/RoleBarChart';

const users = [
    ['Nguyễn Văn An', 'admin', 'quản trị', 'Đang hoạt động', '92%'],
    ['Trần Mỹ Linh', 'nhan_su_kinh_doanh', 'kinh doanh', 'Đang hoạt động', '78%'],
    ['Lê Hoàng Minh', 'truong_phong_san_xuat', 'sản xuất', 'Đang hoạt động', '85%'],
    ['Phạm Quốc Huy', 'nhan_su_san_xuat', 'sản xuất', 'Đang hoạt động', '81%'],
    ['Đỗ Thanh Vy', 'nhan_su_san_xuat', 'sản xuất', 'Tạm khóa', '35%'],
];

export default function UserAccountsDashboard(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Bảng điều khiển tài khoản người dùng"
            description="Theo dõi phân bổ vai trò, trạng thái hoạt động và hiệu suất xử lý công việc của nhân sự."
            stats={[
                { label: 'Tổng tài khoản', value: '56' },
                { label: 'Đang hoạt động', value: '51' },
                { label: 'Tạm khóa', value: '5' },
                { label: 'Đăng nhập hôm nay', value: '39' },
            ]}
        >
            <div className="grid gap-4 xl:grid-cols-3 mb-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm xl:col-span-2">
                    <h3 className="font-semibold text-slate-900 mb-3">Danh sách tài khoản</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600">
                                <tr>
                                    <th className="text-left px-3 py-2">Họ tên</th>
                                    <th className="text-left px-3 py-2">Vai trò</th>
                                    <th className="text-left px-3 py-2">Phòng ban</th>
                                    <th className="text-left px-3 py-2">Trạng thái</th>
                                    <th className="text-left px-3 py-2">Hiệu suất</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((row) => (
                                    <tr key={row[0]} className="border-t border-slate-100">
                                        {row.map((cell) => (
                                            <td key={`${row[0]}-${cell}`} className="px-3 py-2">{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-900 mb-3">Biểu đồ phân bổ vai trò</h3>
                    <RoleBarChart
                        data={[
                            { label: 'Admin', value: 3 },
                            { label: 'Kinh doanh', value: 14 },
                            { label: 'Trưởng phòng', value: 4 },
                            { label: 'Nhân sự sản xuất', value: 35 },
                        ]}
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Biểu đồ trạng thái tài khoản</h3>
                    <div className="space-y-3 text-sm">
                        <div>
                            <div className="flex justify-between"><span>Hoạt động</span><span>91%</span></div>
                            <div className="h-2 bg-slate-200 rounded-full mt-1"><div className="h-2 rounded-full bg-emerald-500" style={{ width: '91%' }} /></div>
                        </div>
                        <div>
                            <div className="flex justify-between"><span>Tạm khóa</span><span>9%</span></div>
                            <div className="h-2 bg-slate-200 rounded-full mt-1"><div className="h-2 rounded-full bg-rose-500" style={{ width: '9%' }} /></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Cảnh báo tài khoản</h3>
                    <ul className="space-y-2 text-sm">
                        <li className="rounded-lg border border-amber-200 bg-amber-50 p-3">3 tài khoản chưa đổi mật khẩu hơn 90 ngày</li>
                        <li className="rounded-lg border border-sky-200 bg-sky-50 p-3">5 tài khoản cần nâng quyền để duyệt bàn giao</li>
                        <li className="rounded-lg border border-rose-200 bg-rose-50 p-3">2 tài khoản đăng nhập bất thường trong 24h</li>
                    </ul>
                </div>
            </div>
        </PageContainer>
    );
}
