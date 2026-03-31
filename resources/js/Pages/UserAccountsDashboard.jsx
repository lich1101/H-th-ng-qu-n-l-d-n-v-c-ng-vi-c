import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import RoleBarChart from '@/Components/RoleBarChart';
import PaginationControls from '@/Components/PaginationControls';

const roleLabels = {
    admin: 'Quản trị',
    administrator: 'Administrator',
    quan_ly: 'Quản lý',
    nhan_vien: 'Nhân sự',
    ke_toan: 'Kế toán',
};

function FormField({ label, required = false, children, className = '' }) {
    return (
        <div className={className}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
        </div>
    );
}

export default function UserAccountsDashboard(props) {
    const [filters, setFilters] = useState({ search: '', role: '', status: '', per_page: 10, page: 1 });
    const [usersData, setUsersData] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
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
    const [importingUsers, setImportingUsers] = useState(false);
    const [importReport, setImportReport] = useState(null);
    const [importJob, setImportJob] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [importFile, setImportFile] = useState(null);
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

    const extractValidationMessages = (error) => {
        const errors = error?.response?.data?.errors;
        if (!errors || typeof errors !== 'object') return [];
        return Object.values(errors)
            .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
            .map((messageText) => String(messageText || '').trim())
            .filter(Boolean);
    };

    const getErrorMessage = (error, fallback) => {
        const validationMessages = extractValidationMessages(error);
        if (validationMessages.length > 0) return validationMessages[0];
        const messageText = error?.response?.data?.message;
        if (messageText && messageText !== 'The given data was invalid.') return messageText;
        return fallback;
    };

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
                total: usersResponse.data.users.total || 0,
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
    }, [filters.page, filters.per_page, filters.role, filters.status]);

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

    const closeImport = () => {
        setShowImport(false);
        setImportFile(null);
        setImportReport(null);
        setImportJob(null);
        setImportingUsers(false);
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

    const submitImport = async (e) => {
        e.preventDefault();
        if (!importFile) {
            setErrorMessage('Vui lòng chọn file Excel để import.');
            return;
        }

        setImportingUsers(true);
        setMessage('');
        setErrorMessage('');
        try {
            const formData = new FormData();
            formData.append('file', importFile);
            const res = await axios.post('/api/v1/imports/users', formData);
            setImportJob(res.data?.job || null);
            setImportReport(null);
            setMessage('Đã đưa file import nhân viên vào hàng đợi xử lý.');
        } catch (error) {
            const validationMessages = extractValidationMessages(error);
            const fallbackMessage = getErrorMessage(error, 'Không thể import nhân viên.');
            setImportJob(null);
            setImportingUsers(false);
            setImportReport({
                created: 0,
                updated: 0,
                skipped: 0,
                warnings: [],
                errors: validationMessages.length > 0
                    ? validationMessages.map((messageText) => ({ row: '-', message: messageText }))
                    : [{ row: '-', message: fallbackMessage }],
            });
            setErrorMessage(fallbackMessage);
        }
    };

    useEffect(() => {
        if (!showImport || !importJob?.id) return undefined;

        const poll = async () => {
            try {
                const res = await axios.get(`/api/v1/imports/jobs/${importJob.id}`);
                const nextJob = res.data || null;
                setImportJob(nextJob);

                if (nextJob?.status === 'completed') {
                    window.clearInterval(timer);
                    const report = nextJob.report || {};
                    setImportingUsers(false);
                    setImportReport(report);
                    setMessage(
                        `Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua.`
                    );
                    await fetchAccounts(filters);
                } else if (nextJob?.status === 'failed') {
                    window.clearInterval(timer);
                    setImportingUsers(false);
                    setImportReport(nextJob.report || {
                        created: 0,
                        updated: 0,
                        skipped: 0,
                        warnings: [],
                        errors: [{ row: '-', message: nextJob.error_message || 'Import thất bại.' }],
                    });
                    setErrorMessage(nextJob?.error_message || 'Import thất bại.');
                }
            } catch (error) {
                window.clearInterval(timer);
                setImportingUsers(false);
                setErrorMessage(getErrorMessage(error, 'Không kiểm tra được tiến trình import nhân viên.'));
            }
        };

        const timer = window.setInterval(poll, 1500);
        poll();

        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showImport, importJob?.id]);

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
            description="Theo dõi phân bổ vai trò, trạng thái hoạt động và thông tin người dùng trong hệ thống."
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
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                        onClick={() => {
                            setImportFile(null);
                            setImportReport(null);
                            setImportJob(null);
                            setImportingUsers(false);
                            setShowImport(true);
                        }}
                    >
                        Import Excel
                    </button>
                    <button
                        type="button"
                        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                        onClick={openCreate}
                    >
                        Thêm mới
                    </button>
                </div>
            </div>

            <form onSubmit={submitSearch} className="mb-4">
                <FilterToolbar
                    title="Bộ lọc tài khoản"
                    description="Lọc theo tên, email, vai trò và trạng thái hoạt động để kiểm tra nhanh danh sách người dùng."
                    actions={(
                        <FilterActionGroup>
                            <button
                                type="submit"
                                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                            >
                                Tìm kiếm
                            </button>
                        </FilterActionGroup>
                    )}
                >
                    <FilterField label="Tìm kiếm">
                        <input
                            type="text"
                            value={filters.search}
                            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                            placeholder="Tìm theo tên hoặc email"
                            className={filterControlClass}
                        />
                    </FilterField>
                    <FilterField label="Vai trò">
                        <select
                            value={filters.role}
                            onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, role: e.target.value }))}
                            className={filterControlClass}
                        >
                            <option value="">Tất cả vai trò</option>
                            <option value="admin">Admin</option>
                            <option value="administrator">Administrator</option>
                            <option value="quan_ly">Quản lý</option>
                            <option value="nhan_vien">Nhân sự</option>
                            <option value="ke_toan">Kế toán</option>
                        </select>
                    </FilterField>
                    <FilterField label="Trạng thái">
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, status: e.target.value }))}
                            className={filterControlClass}
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="active">Đang hoạt động</option>
                            <option value="inactive">Tạm khóa</option>
                        </select>
                    </FilterField>
                </FilterToolbar>
            </form>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? 'Sửa tài khoản' : 'Thêm tài khoản mới'}
                description="Cập nhật thông tin và phân quyền người dùng."
                size="xl"
            >
                <form onSubmit={submitAccount} className="space-y-5">
                    <div className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <FormField label="Họ tên" required>
                                <input
                                    type="text"
                                    placeholder="Tên hiển thị của người dùng"
                                    value={form.name}
                                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm"
                                    required
                                />
                            </FormField>
                            <FormField label="Email" required>
                                <input
                                    type="email"
                                    placeholder="Email đăng nhập"
                                    value={form.email}
                                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm"
                                    required
                                />
                            </FormField>
                            <FormField label={editingId ? 'Mật khẩu mới' : 'Mật khẩu'}>
                                <input
                                    type="password"
                                    placeholder={editingId ? 'Để trống nếu không đổi' : 'Nhập mật khẩu khởi tạo'}
                                    value={form.password}
                                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm"
                                />
                            </FormField>
                            <FormField label="Vai trò">
                                <select
                                    value={form.role}
                                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="administrator">Administrator</option>
                                    <option value="quan_ly">Quản lý</option>
                                    <option value="nhan_vien">Nhân sự</option>
                                    <option value="ke_toan">Kế toán</option>
                                </select>
                            </FormField>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200/80 bg-white p-4">
                        <div className="grid gap-4 md:grid-cols-3">
                            <FormField label="Phòng ban">
                                <select
                                    value={form.department_id}
                                    onChange={(e) => setForm((prev) => ({ ...prev, department_id: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm"
                                >
                                    <option value="">Chọn phòng ban</option>
                                    {departments.map((dept) => (
                                        <option key={dept.id} value={dept.id}>
                                            {dept.name}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                            <FormField label="Số điện thoại">
                                <input
                                    type="text"
                                    placeholder="Số điện thoại liên hệ"
                                    value={form.phone}
                                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm"
                                />
                            </FormField>
                            <FormField label="Trạng thái tài khoản">
                                <select
                                    value={form.is_active ? '1' : '0'}
                                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === '1' }))}
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm"
                                >
                                    <option value="1">Đang hoạt động</option>
                                    <option value="0">Tạm khóa</option>
                                </select>
                            </FormField>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
                        >
                            {editingId ? 'Lưu chỉnh sửa' : 'Thêm tài khoản'}
                        </button>
                        <button
                            type="button"
                            onClick={closeForm}
                            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                        >
                            Hủy
                        </button>
                        {message && <span className="text-sm text-emerald-700">{message}</span>}
                        {errorMessage && <span className="text-sm text-rose-700">{errorMessage}</span>}
                    </div>
                </form>
            </Modal>

            <Modal
                open={showImport}
                onClose={closeImport}
                title="Import nhân viên"
                description="Tải file Excel (.xls/.xlsx/.csv) để tạo hoặc cập nhật tài khoản nhân viên theo email."
                size="md"
            >
                <form onSubmit={submitImport} className="space-y-3 text-sm">
                    <FormField label="File nhân viên" required>
                        <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => window.open('/api/v1/imports/users/template', '_blank', 'noopener,noreferrer')}
                            >
                                Tải file mẫu
                            </button>
                            <input
                                id="import-user-file"
                                type="file"
                                accept=".xls,.xlsx,.csv"
                                onChange={(e) => {
                                    setImportFile(e.target.files?.[0] || null);
                                    setImportReport(null);
                                    setImportJob(null);
                                }}
                                className="hidden"
                            />
                            <label
                                htmlFor="import-user-file"
                                className="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                                Chọn file
                            </label>
                            <p className="mt-2 text-xs text-text-muted">
                                {importFile ? importFile.name : 'Chưa chọn file'}
                            </p>
                        </div>
                    </FormField>
                    {importReport && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                Kết quả import
                            </div>
                            <p className="text-xs text-slate-700">
                                Tạo mới: {importReport.created || 0} • Cập nhật: {importReport.updated || 0} • Bỏ qua: {importReport.skipped || 0}
                            </p>
                            {Array.isArray(importReport.errors) && importReport.errors.length > 0 && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                                    <div className="text-xs font-semibold text-rose-700">Dòng lỗi không import được</div>
                                    <div className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-rose-700">
                                        {importReport.errors.map((item, idx) => (
                                            <div key={`err-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Lỗi không xác định'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {Array.isArray(importReport.warnings) && importReport.warnings.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                                    <div className="text-xs font-semibold text-amber-700">Cảnh báo dữ liệu (đã import nhưng có trường để trống)</div>
                                    <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs text-amber-700">
                                        {importReport.warnings.map((item, idx) => (
                                            <div key={`warn-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Cảnh báo dữ liệu'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {importJob && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <div className="font-semibold uppercase tracking-[0.14em] text-text-subtle">Tiến trình import</div>
                                <div className="font-semibold text-slate-700">
                                    {importJob.processed_rows || 0}/{importJob.total_rows || 0} dòng
                                </div>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                                <div
                                    className={`h-full rounded-full transition-all ${importJob.status === 'failed' ? 'bg-rose-500' : 'bg-primary'}`}
                                    style={{ width: `${importJob.progress_percent || 0}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs text-text-muted">
                                <span>
                                    Trạng thái: {importJob.status === 'queued' ? 'Đang chờ' : importJob.status === 'processing' ? 'Đang xử lý' : importJob.status === 'completed' ? 'Hoàn tất' : 'Thất bại'}
                                </span>
                                <span>{importJob.progress_percent || 0}%</span>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            disabled={importingUsers}
                            className="flex-1 rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-white"
                        >
                            {importingUsers ? 'Đang import...' : 'Import'}
                        </button>
                        <button
                            type="button"
                            onClick={closeImport}
                            className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"
                        >
                            Hủy
                        </button>
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
                                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-text-muted">
                                            Không có dữ liệu.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls
                        page={pagination.current_page}
                        lastPage={pagination.last_page}
                        total={pagination.total}
                        perPage={filters.per_page}
                        label="tài khoản"
                        loading={loading}
                        onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
                        onPerPageChange={(perPage) => setFilters((prev) => ({ ...prev, per_page: perPage, page: 1 }))}
                    />
                </div>
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                    <h3 className="font-semibold text-slate-900 mb-3">Phân bổ vai trò</h3>
                    <RoleBarChart data={stats.role_distribution || []} />
                    <div className="mt-4 text-xs text-text-muted space-y-1">
                        <p>Hoạt động: {statusPercent.active}%</p>
                        <p>Không hoạt động: {statusPercent.inactive}%</p>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
