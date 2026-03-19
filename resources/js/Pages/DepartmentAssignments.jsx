import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const statusLabels = {
    new: 'Mới',
    in_progress: 'Đang triển khai',
    done: 'Hoàn tất',
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

export default function DepartmentAssignments(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = userRole === 'admin';
    const canUpdate = ['admin', 'quan_ly', 'nhan_vien'].includes(userRole);
    const canDelete = userRole === 'admin';

    const [assignments, setAssignments] = useState([]);
    const [clients, setClients] = useState([]);
    const [contracts, setContracts] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [filters, setFilters] = useState({ department_id: '', status: '' });
    const [showForm, setShowForm] = useState(false);
    const [progressModal, setProgressModal] = useState({ open: false, assignment: null });
    const [form, setForm] = useState({
        client_id: '',
        contract_id: '',
        department_id: '',
        requirements: '',
        deadline: '',
        allocated_value: '',
    });
    const [progressForm, setProgressForm] = useState({
        status: 'new',
        progress_percent: 0,
        progress_note: '',
    });

    const fetchData = async () => {
        try {
            const [assignRes, deptRes, clientRes, contractRes] = await Promise.all([
                axios.get('/api/v1/department-assignments', { params: { per_page: 50, ...filters } }),
                axios.get('/api/v1/departments'),
                axios.get('/api/v1/crm/clients', { params: { per_page: 200 } }),
                axios.get('/api/v1/contracts', { params: { per_page: 200 } }),
            ]);
            setAssignments(assignRes.data?.data || []);
            setDepartments(deptRes.data || []);
            setClients(clientRes.data?.data || []);
            setContracts(contractRes.data?.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được điều phối.');
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const total = assignments.length;
        const inProgress = assignments.filter((a) => a.status === 'in_progress').length;
        const done = assignments.filter((a) => a.status === 'done').length;
        return [
            { label: 'Tổng điều phối', value: String(total) },
            { label: 'Đang triển khai', value: String(inProgress) },
            { label: 'Hoàn tất', value: String(done) },
            { label: 'Vai trò', value: userRole || '—' },
        ];
    }, [assignments, userRole]);

    const resetForm = () => {
        setForm({
            client_id: '',
            contract_id: '',
            department_id: '',
            requirements: '',
            deadline: '',
            allocated_value: '',
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

    const save = async () => {
        if (!canCreate) return toast.error('Bạn không có quyền tạo điều phối.');
        if (!form.client_id || !form.department_id) {
            return toast.error('Vui lòng chọn khách hàng và phòng ban.');
        }
        const payload = {
            client_id: Number(form.client_id),
            contract_id: form.contract_id ? Number(form.contract_id) : null,
            department_id: Number(form.department_id),
            requirements: form.requirements || null,
            deadline: form.deadline || null,
            allocated_value: form.allocated_value === '' ? null : Number(form.allocated_value),
        };
        try {
            await axios.post('/api/v1/department-assignments', payload);
            toast.success('Đã tạo điều phối.');
            closeForm();
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Tạo điều phối thất bại.');
        }
    };

    const remove = async (assignment) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa điều phối.');
        if (!confirm('Xóa điều phối này?')) return;
        try {
            await axios.delete(`/api/v1/department-assignments/${assignment.id}`);
            toast.success('Đã xóa điều phối.');
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa điều phối thất bại.');
        }
    };

    const updateProgress = async () => {
        const assignment = progressModal.assignment;
        if (!canUpdate) return;
        try {
            await axios.put(`/api/v1/department-assignments/${assignment.id}`, {
                status: progressForm.status || assignment.status,
                progress_percent: progressForm.progress_percent ?? assignment.progress_percent,
                progress_note: progressForm.progress_note ?? assignment.progress_note,
            });
            toast.success('Đã cập nhật tiến độ.');
            setProgressModal({ open: false, assignment: null });
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Cập nhật tiến độ thất bại.');
        }
    };

    const openProgress = (assignment) => {
        setProgressForm({
            status: assignment.status || 'new',
            progress_percent: assignment.progress_percent ?? 0,
            progress_note: assignment.progress_note || '',
        });
        setProgressModal({ open: true, assignment });
    };

    const closeProgress = () => {
        setProgressModal({ open: false, assignment: null });
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Điều phối phòng ban"
            description="Giao khách hàng/đơn hàng cho phòng ban và theo dõi tiến độ."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <div>
                        <h3 className="font-semibold">Danh sách điều phối</h3>
                        <p className="text-xs text-text-muted mt-1">Giao khách hàng cho phòng ban và theo dõi tiến độ.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {canCreate && (
                            <button
                                type="button"
                                className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                onClick={openCreate}
                            >
                                Thêm mới
                            </button>
                        )}
                        <select
                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.department_id}
                            onChange={(e) => setFilters((s) => ({ ...s, department_id: e.target.value }))}
                        >
                            <option value="">Tất cả phòng ban</option>
                            {departments.map((dept) => (
                                <option key={dept.id} value={dept.id}>
                                    {dept.name}
                                </option>
                            ))}
                        </select>
                        <select
                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.status}
                            onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="new">Mới</option>
                            <option value="in_progress">Đang triển khai</option>
                            <option value="done">Hoàn tất</option>
                        </select>
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                            onClick={fetchData}
                        >
                            Lọc
                        </button>
                    </div>
                </div>
                <div className="space-y-4">
                    {assignments.map((assignment) => (
                        <div key={assignment.id} className="rounded-2xl border border-slate-200/80 p-4">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <h4 className="font-semibold text-slate-900">
                                                {assignment.client?.name || 'Khách hàng'}
                                            </h4>
                                            <p className="text-xs text-text-muted">
                                                {assignment.department?.name || 'Phòng ban'} •{' '}
                                                {assignment.manager?.name || 'Chưa gán quản lý'}
                                            </p>
                                            {assignment.contract && (
                                                <p className="text-xs text-text-muted">
                                                    Hợp đồng: {assignment.contract.code} • {assignment.contract.title}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                                {statusLabels[assignment.status] || assignment.status}
                                            </span>
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    className="text-xs font-semibold text-rose-500"
                                                    onClick={() => remove(assignment)}
                                                >
                                                    Xóa
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                            <p>Hạn chót: {assignment.deadline ? assignment.deadline.slice(0, 10) : '—'}</p>
                                            <p>Giá trị phân bổ: {assignment.allocated_value ? Number(assignment.allocated_value).toLocaleString('vi-VN') : '—'}</p>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                            <p>Tiến độ: {assignment.progress_percent ?? 0}%</p>
                                            <p>{assignment.progress_note || 'Chưa có ghi chú'}</p>
                                        </div>
                                    </div>
                                    {assignment.requirements && (
                                        <div className="mt-3 rounded-xl border border-dashed border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-600">
                                            {assignment.requirements}
                                        </div>
                                    )}
                                    {canUpdate && (
                                        <div className="mt-4">
                                            <button
                                                type="button"
                                                className="rounded-xl bg-primary text-white text-xs font-semibold px-3 py-2"
                                                onClick={() => openProgress(assignment)}
                                            >
                                                Cập nhật tiến độ
                                            </button>
                                        </div>
                                    )}
                                </div>
                    ))}
                    {assignments.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                            Chưa có điều phối phòng ban.
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title="Tạo điều phối"
                description="Giao khách hàng/đơn hàng cho phòng ban kèm yêu cầu & hạn chót."
                size="lg"
            >
                <div className="space-y-3 text-sm">
                    <FormField label="Khách hàng" required>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.client_id}
                            onChange={(e) => setForm((s) => ({ ...s, client_id: e.target.value }))}
                        >
                            <option value="">Chọn khách hàng *</option>
                            {clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                    {client.name} {client.company ? `(${client.company})` : ''}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Hợp đồng liên kết">
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.contract_id}
                            onChange={(e) => setForm((s) => ({ ...s, contract_id: e.target.value }))}
                        >
                            <option value="">Liên kết hợp đồng</option>
                            {contracts.map((contract) => (
                                <option key={contract.id} value={contract.id}>
                                    {contract.code} • {contract.title}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Phòng ban nhận việc" required>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.department_id}
                            onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value }))}
                        >
                            <option value="">Chọn phòng ban *</option>
                            {departments.map((dept) => (
                                <option key={dept.id} value={dept.id}>
                                    {dept.name}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Hạn chót">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="date"
                            value={form.deadline}
                            onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Giá trị phân bổ (VNĐ)">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="number"
                            placeholder="Số tiền giao cho phòng ban xử lý"
                            value={form.allocated_value}
                            onChange={(e) => setForm((s) => ({ ...s, allocated_value: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Yêu cầu chi tiết">
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Mô tả phạm vi phối hợp, đầu việc hoặc lưu ý cần bàn giao"
                            value={form.requirements}
                            onChange={(e) => setForm((s) => ({ ...s, requirements: e.target.value }))}
                        />
                    </FormField>
                    {!canCreate && (
                        <p className="text-xs text-text-muted">Chỉ Admin mới được tạo điều phối phòng ban.</p>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={save}
                        >
                            Tạo điều phối
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={closeForm}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={progressModal.open}
                onClose={closeProgress}
                title="Cập nhật tiến độ"
                description="Cập nhật trạng thái và ghi chú tiến độ cho điều phối."
                size="md"
            >
                {progressModal.assignment && (
                    <div className="space-y-3 text-sm">
                        <FormField label="Trạng thái điều phối">
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={progressForm.status}
                                onChange={(e) => setProgressForm((s) => ({ ...s, status: e.target.value }))}
                            >
                                <option value="new">Mới</option>
                                <option value="in_progress">Đang triển khai</option>
                                <option value="done">Hoàn tất</option>
                            </select>
                        </FormField>
                        <FormField label="Tiến độ (%)">
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="number"
                                placeholder="Nhập tiến độ hiện tại"
                                value={progressForm.progress_percent}
                                onChange={(e) =>
                                    setProgressForm((s) => ({
                                        ...s,
                                        progress_percent: Number(e.target.value || 0),
                                    }))
                                }
                            />
                        </FormField>
                        <FormField label="Ghi chú tiến độ">
                            <textarea
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                rows={3}
                                placeholder="Nêu rõ phần đã làm, vướng mắc hoặc yêu cầu phối hợp thêm"
                                value={progressForm.progress_note}
                                onChange={(e) => setProgressForm((s) => ({ ...s, progress_note: e.target.value }))}
                            />
                        </FormField>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                                onClick={updateProgress}
                            >
                                Lưu tiến độ
                            </button>
                            <button
                                type="button"
                                className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                                onClick={closeProgress}
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </PageContainer>
    );
}
