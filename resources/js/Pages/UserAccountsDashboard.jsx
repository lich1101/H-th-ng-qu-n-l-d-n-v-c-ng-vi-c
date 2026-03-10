import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import RoleBarChart from '@/Components/RoleBarChart';

const roleLabels = {
    admin: 'Admin',
    truong_phong_san_xuat: 'Trưởng phòng sản xuất',
    nhan_su_san_xuat: 'Nhân sự sản xuất',
    nhan_su_kinh_doanh: 'Nhân sự kinh doanh',
};

export default function UserAccountsDashboard(props) {
    const [filters, setFilters] = useState({
        search: '',
        role: '',
        status: '',
        page: 1,
    });
    const [usersData, setUsersData] = useState([]);
    const [pagination, setPagination] = useState({ current_page: 1, last_page: 1 });
    const [stats, setStats] = useState({
        total_users: 0,
        active_users: 0,
        inactive_users: 0,
        login_today: 0,
        average_capacity: 0,
        role_distribution: [],
    });
    const [loading, setLoading] = useState(true);

    const fetchAccounts = async (activeFilters) => {
        setLoading(true);
        try {
            const [usersResponse, statsResponse] = await Promise.all([
                axios.get('/api/v1/users/accounts', { params: activeFilters }),
                axios.get('/api/v1/users/accounts/stats'),
            ]);

            setUsersData(usersResponse.data.users.data || []);
            setPagination({
                current_page: usersResponse.data.users.current_page,
                last_page: usersResponse.data.users.last_page,
            });
            setStats(statsResponse.data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts(filters);
    }, [filters.page, filters.role, filters.status]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            fetchAccounts(filters);
        }, 30000);
        return () => window.clearInterval(timer);
    }, [filters]);

    const statusPercent = useMemo(() => {
        const total = stats.total_users || 1;
        return {
            active: Math.round((stats.active_users / total) * 100),
            inactive: Math.round((stats.inactive_users / total) * 100),
        };
    }, [stats]);

    const submitSearch = (e) => {
        e.preventDefault();
        setFilters((prev) => ({ ...prev, page: 1, search: prev.search }));
        fetchAccounts({ ...filters, page: 1 });
    };

    const toRoleLabel = (role) => roleLabels[role] || role;

    return (
        <PageContainer
            auth={props.auth}
            title="Bảng điều khiển tài khoản người dùng"
            description="Theo dõi phân bổ vai trò, trạng thái hoạt động và hiệu suất xử lý công việc của nhân sự."
            stats={[
                { label: 'Tổng tài khoản', value: stats.total_users },
                { label: 'Đang hoạt động', value: stats.active_users },
                { label: 'Tạm khóa', value: stats.inactive_users },
                { label: 'Đăng nhập hôm nay', value: stats.login_today },
            ]}
        >
            <form onSubmit={submitSearch} className="mb-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-4">
                    <input
                        type="text"
                        value={filters.search}
                        onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                        placeholder="Tìm theo tên hoặc email"
                        className="rounded-lg border-slate-300 text-sm"
                    />
                    <select
                        value={filters.role}
                        onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, role: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                    >
                        <option value="">Tất cả vai trò</option>
                        <option value="admin">Admin</option>
                        <option value="truong_phong_san_xuat">Trưởng phòng sản xuất</option>
                        <option value="nhan_su_san_xuat">Nhân sự sản xuất</option>
                        <option value="nhan_su_kinh_doanh">Nhân sự kinh doanh</option>
                    </select>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, status: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                    >
                        <option value="">Tất cả trạng thái</option>
                        <option value="active">Đang hoạt động</option>
                        <option value="inactive">Tạm khóa</option>
                    </select>
                    <button
                        type="submit"
                        className="rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition"
                    >
                        Tìm kiếm
                    </button>
                </div>
            </form>

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
                                {!loading && usersData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                                            Không có tài khoản phù hợp bộ lọc.
                                        </td>
                                    </tr>
                                )}
                                {usersData.map((user) => (
                                    <tr key={user.id} className="border-t border-slate-100">
                                        <td className="px-3 py-2">
                                            <p className="font-medium">{user.name}</p>
                                            <p className="text-xs text-slate-500">{user.email}</p>
                                        </td>
                                        <td className="px-3 py-2">{toRoleLabel(user.role)}</td>
                                        <td className="px-3 py-2">{user.department || '-'}</td>
                                        <td className="px-3 py-2">
                                            {user.is_active ? (
                                                <span className="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">Đang hoạt động</span>
                                            ) : (
                                                <span className="px-2 py-1 rounded-full text-xs bg-rose-100 text-rose-700">Tạm khóa</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">{user.workload_capacity}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-3 flex justify-between items-center text-sm">
                        <span className="text-slate-500">
                            Trang {pagination.current_page}/{pagination.last_page}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                disabled={pagination.current_page <= 1}
                                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
                            >
                                Trước
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(pagination.last_page, prev.page + 1) }))}
                                disabled={pagination.current_page >= pagination.last_page}
                                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-900 mb-3">Biểu đồ phân bổ vai trò</h3>
                    <RoleBarChart data={(stats.role_distribution || []).map((item) => ({
                        label: toRoleLabel(item.label),
                        value: item.value,
                    }))} />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Biểu đồ trạng thái tài khoản</h3>
                    <div className="space-y-3 text-sm">
                        <div>
                            <div className="flex justify-between"><span>Hoạt động</span><span>{statusPercent.active}%</span></div>
                            <div className="h-2 bg-slate-200 rounded-full mt-1"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${statusPercent.active}%` }} /></div>
                        </div>
                        <div>
                            <div className="flex justify-between"><span>Tạm khóa</span><span>{statusPercent.inactive}%</span></div>
                            <div className="h-2 bg-slate-200 rounded-full mt-1"><div className="h-2 rounded-full bg-rose-500" style={{ width: `${statusPercent.inactive}%` }} /></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Cảnh báo tài khoản</h3>
                    <ul className="space-y-2 text-sm">
                        <li className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                            {stats.inactive_users} tài khoản đang tạm khóa cần rà soát.
                        </li>
                        <li className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                            Năng lực xử lý trung bình: {stats.average_capacity}%.
                        </li>
                        <li className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                            Cần kiểm tra quyền nhóm có tỷ lệ tải cao hơn 85%.
                        </li>
                    </ul>
                </div>
            </div>
        </PageContainer>
    );
}
