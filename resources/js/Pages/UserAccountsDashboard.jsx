import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import RoleBarChart from '@/Components/RoleBarChart';

const roleLabels = {
    admin: 'Quản trị',
    administrator: 'Administrator',
    quan_ly: 'Quản lý',
    nhan_vien: 'Nhân sự',
    ke_toan: 'Kế toán',
};

export default function UserAccountsDashboard(props) {
    const [filters, setFilters] = useState({ search: '', role: '', status: '', page: 1 });
    const [usersData, setUsersData] = useState([]);
    const [departments, setDepartments] = useState([]);
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
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        role: 'nhan_vien',
        department_id: '',
        phone: '',
        workload_capacity: 100,
        is_active: true,
    });
    const [message, setMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

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

    const fetchDepartments = async () => {
        try {
            const res = await axios.get('/api/v1/departments');
            setDepartments(res.data || []);
        } catch {
            setDepartments([]);
        }
    };

    useEffect(() => {
        fetchAccounts(filters);
    }, [filters.page, filters.role, filters.status]);

    useEffect(() => {
        fetchDepartments();
        const timer = window.setInterval(() => {
            fetchAccounts(filters);
        }, 30000);
        return () => window.clearInterval(timer);
    }, [filters]);

    const submitSearch = (e) => {
        e.preventDefault();
        setFilters((prev) => ({ ...prev, page: 1, search: prev.search }));
        fetchAccounts({ ...filters, page: 1 });
    };

    const toRoleLabel = (role) => roleLabels[role] || role;

    const resetForm = () => {
        setEditingId(null);
        setForm({
            name: '',
            email: '',
            password: '',
            role: 'nhan_vien',
            department_id: '',
            phone: '',
            workload_capacity: 100,
            is_active: true,
        });
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const submitAccount = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMessage('');
        setErrorMessage('');
        try {
            const dept = departments.find((d) => String(d.id) === String(form.department_id));
            const payload = {
                name: form.name,
                email: form.email,
                password: form.password,
                role: form.role,
                department: dept?.name || null,
                department_id: form.department_id ? Number(form.department_id) : null,
                phone: form.phone || null,
                workload_capacity: Number(form.workload_capacity),
                is_active: Boolean(form.is_active),
            };

            if (!editingId && !payload.password) {
                setErrorMessage('Mật khẩu là bắt buộc khi tạo tài khoản.');
                setSubmitting(false);
                return;
            }

            if (editingId) {
                await axios.put(`/api/v1/users/accounts/${editingId}`, payload);
                setMessage('Cập nhật tài khoản thành công.');
            } else {
                await axios.post('/api/v1/users/accounts', payload);
                setMessage('Tạo tài khoản thành công.');
            }
            closeForm();
            fetchAccounts(filters);
        } catch (error) {
            setErrorMessage(error?.response?.data?.message || 'Không thể lưu tài khoản.');
        } finally {
            setSubmitting(false);
        }
    };

    const startEdit = (user) => {
        setEditingId(user.id);
        setForm({
            name: user.name || '',
            email: user.email || '',
            password: '',
            role: user.role || 'nhan_vien',
            department_id: user.department_id || '',
            phone: user.phone || '',
            workload_capacity: user.workload_capacity ?? 100,
            is_active: Boolean(user.is_active),
        });
        setMessage('');
        setErrorMessage('');
        setShowForm(true);
    };

    const deleteAccount = async (user) => {
        if (!window.confirm(`Xóa tài khoản ${user.name}?`)) {
            return;
        }
        setMessage('');
        setErrorMessage('');
        try {
            await axios.delete(`/api/v1/users/accounts/${user.id}`);
            setMessage('Xóa tài khoản thành công.');
            fetchAccounts(filters);
        } catch (error) {
            setErrorMessage(error?.response?.data?.message || 'Không thể xóa tài khoản.');
        }
    };

    const statusPercent = useMemo(() => {
        const total = stats.total_users || 1;
        return {
            active: Math.round((stats.active_users / total) * 100),
            inactive: Math.round((stats.inactive_users / total) * 100),
        };
    }, [stats]);

    return (
        <PageContainer
            auth={props.auth}
            title="Bảng điều khiển tài khoản người dùng"
            description="Theo dõi phân bổ vai trò, trạng thái hoạt động và năng lực xử lý công việc."
            stats={[
                { label: 'Tổng tài khoản', value: stats.total_users },
                { label: 'Đang hoạt động', value: stats.active_users },
                { label: 'Tạm khóa', value: stats.inactive_users },
                { label: 'Đăng nhập hôm nay', value: stats.login_today },
            ]}
        >
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-slate-900">Tài khoản người dùng</h3>
                    <p className="text-xs text-text-muted">Thêm mới hoặc chỉnh sửa thông tin người dùng.</p>
                </div>
                <button
                    type="button"
                    className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                    onClick={openCreate}
                >
                    Thêm mới
                </button>
            </div>

            <form onSubmit={submitSearch} className="mb-4 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
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
                        <option value="administrator">Administrator</option>
                        <option value="quan_ly">Quản lý</option>
                        <option value="nhan_vien">Nhân sự</option>
                        <option value="ke_toan">Kế toán</option>
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

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? 'Sửa tài khoản' : 'Thêm tài khoản mới'}
                description="Cập nhật thông tin và phân quyền người dùng."
                size="xl"
            >
                <form onSubmit={submitAccount} className="grid gap-3 md:grid-cols-4">
                    <input
                        type="text"
                        placeholder="Họ tên"
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                        required
                    />
                    <input
                        type="email"
                        placeholder="Email"
                        value={form.email}
                        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                        required
                    />
                    <input
                        type="password"
                        placeholder={editingId ? 'Mật khẩu mới (nếu đổi)' : 'Mật khẩu'}
                        value={form.password}
                        onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                    />
                    <select
                        value={form.role}
                        onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                    >
                        <option value="admin">Admin</option>
                        <option value="administrator">Administrator</option>
                        <option value="quan_ly">Quản lý</option>
                        <option value="nhan_vien">Nhân sự</option>
                        <option value="ke_toan">Kế toán</option>
                    </select>
                    <select
                        value={form.department_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, department_id: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                    >
                        <option value="">Chọn phòng ban</option>
                        {departments.map((dept) => (
                            <option key={dept.id} value={dept.id}>
                                {dept.name}
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="Số điện thoại"
                        value={form.phone}
                        onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                    />
                    <input
                        type="number"
                        min="0"
                        max="200"
                        placeholder="Năng lực (%)"
                        value={form.workload_capacity}
                        onChange={(e) => setForm((prev) => ({ ...prev, workload_capacity: e.target.value }))}
                        className="rounded-lg border-slate-300 text-sm"
                    />
                    <select
                        value={form.is_active ? '1' : '0'}
                        onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === '1' }))}
                        className="rounded-lg border-slate-300 text-sm"
                    >
                        <option value="1">Đang hoạt động</option>
                        <option value="0">Tạm khóa</option>
                    </select>

                    <div className="md:col-span-4 flex items-center gap-2">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-lg bg-sky-600 text-white text-sm font-semibold px-4 py-2 hover:bg-sky-700 disabled:opacity-60"
                        >
                            {editingId ? 'Lưu chỉnh sửa' : 'Thêm tài khoản'}
                        </button>
                        <button
                            type="button"
                            onClick={closeForm}
                            className="rounded-lg border border-slate-300 text-sm px-4 py-2"
                        >
                            Hủy
                        </button>
                        {message && <span className="text-sm text-emerald-700">{message}</span>}
                        {errorMessage && <span className="text-sm text-rose-700">{errorMessage}</span>}
                    </div>
                </form>
            </Modal>

            <div className="grid gap-4 xl:grid-cols-3 mb-4">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card xl:col-span-2">
                    <h3 className="font-semibold text-slate-900 mb-3">Danh sách tài khoản</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600">
                                <tr>
                                    <th className="px-3 py-2 text-left">Tên</th>
                                    <th className="px-3 py-2 text-left">Vai trò</th>
                                    <th className="px-3 py-2 text-left">Phòng ban</th>
                                    <th className="px-3 py-2 text-left">Năng lực</th>
                                    <th className="px-3 py-2 text-left">Trạng thái</th>
                                    <th className="px-3 py-2 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usersData.map((user) => (
                                    <tr key={user.id} className="border-b border-slate-100">
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-slate-900">{user.name}</div>
                                            <div className="text-xs text-text-muted">{user.email}</div>
                                        </td>
                                        <td className="px-3 py-2">{toRoleLabel(user.role)}</td>
                                        <td className="px-3 py-2">
                                            {departments.find((d) => d.id === user.department_id)?.name || user.department || '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            {user.workload_capacity ?? 0}%
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                                    user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                }`}
                                            >
                                                {user.is_active ? 'Hoạt động' : 'Tạm khóa'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right space-x-2">
                                            <button
                                                type="button"
                                                onClick={() => startEdit(user)}
                                                className="text-xs font-semibold text-primary"
                                            >
                                                Sửa
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteAccount(user)}
                                                className="text-xs font-semibold text-rose-500"
                                            >
                                                Xóa
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {usersData.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-6 text-center text-sm text-text-muted">
                                            Không có dữ liệu.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-between text-xs text-text-muted mt-3">
                        <span>
                            Trang {pagination.current_page} / {pagination.last_page}
                        </span>
                        <div className="space-x-2">
                            <button
                                type="button"
                                disabled={pagination.current_page <= 1}
                                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                                className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-50"
                            >
                                Trước
                            </button>
                            <button
                                type="button"
                                disabled={pagination.current_page >= pagination.last_page}
                                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                                className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-50"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                    <h3 className="font-semibold text-slate-900 mb-3">Phân bổ vai trò</h3>
                    <RoleBarChart data={stats.role_distribution || []} />
                    <div className="mt-4 text-xs text-text-muted space-y-1">
                        <p>Hoạt động: {statusPercent.active}%</p>
                        <p>Không hoạt động: {statusPercent.inactive}%</p>
                        <p>Năng lực TB: {stats.average_capacity}%</p>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
