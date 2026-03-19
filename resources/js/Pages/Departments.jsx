import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

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

export default function Departments(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canManage = userRole === 'admin';

    const [departments, setDepartments] = useState([]);
    const [users, setUsers] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        name: '',
        manager_id: '',
        staff_ids: [],
    });

    const fetchDepartments = async () => {
        try {
            const res = await axios.get('/api/v1/departments');
            setDepartments(res.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được phòng ban.');
        }
    };

    const fetchUsers = async () => {
        if (!canManage) return;
        try {
            const res = await axios.get('/api/v1/users/accounts', { params: { per_page: 200 } });
            setUsers(res.data?.users?.data || []);
        } catch {
            setUsers([]);
        }
    };

    useEffect(() => {
        fetchDepartments();
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const total = departments.length;
        const managers = departments.filter((d) => d.manager).length;
        return [
            { label: 'Tổng phòng ban', value: String(total) },
            { label: 'Có quản lý', value: String(managers) },
            { label: 'Nhân sự', value: String(users.length) },
            { label: 'Quyền', value: canManage ? 'Quản trị' : 'Xem' },
        ];
    }, [departments, users, canManage]);

    const resetForm = () => {
        setEditingId(null);
        setForm({ name: '', manager_id: '', staff_ids: [] });
    };

    const startEdit = (dept) => {
        setEditingId(dept.id);
        setForm({
            name: dept.name || '',
            manager_id: dept.manager_id || '',
            staff_ids: (dept.staff || []).map((u) => u.id),
        });
        setShowForm(true);
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
        if (!canManage) return toast.error('Bạn không có quyền quản lý phòng ban.');
        if (!form.name.trim()) return toast.error('Vui lòng nhập tên phòng ban.');

        const payload = {
            name: form.name,
            manager_id: form.manager_id ? Number(form.manager_id) : null,
            staff_ids: form.staff_ids.map((id) => Number(id)),
        };

        try {
            if (editingId) {
                const current = departments.find((d) => d.id === editingId);
                const existingStaff = (current?.staff || []).map((u) => u.id);
                payload.remove_staff_ids = existingStaff.filter((id) => !payload.staff_ids.includes(id));
                await axios.put(`/api/v1/departments/${editingId}`, payload);
                toast.success('Đã cập nhật phòng ban.');
            } else {
                await axios.post('/api/v1/departments', payload);
                toast.success('Đã tạo phòng ban.');
            }
            closeForm();
            await fetchDepartments();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu phòng ban thất bại.');
        }
    };

    const remove = async (dept) => {
        if (!canManage) return toast.error('Bạn không có quyền xóa phòng ban.');
        if (!confirm('Xóa phòng ban này?')) return;
        try {
            await axios.delete(`/api/v1/departments/${dept.id}`);
            toast.success('Đã xóa phòng ban.');
            await fetchDepartments();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa phòng ban thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý phòng ban"
            description="Gán quản lý và nhân sự theo phòng ban."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Danh sách phòng ban</h3>
                    {canManage && (
                        <button
                            type="button"
                            className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                            onClick={openCreate}
                        >
                            Thêm mới
                        </button>
                    )}
                </div>
                <div className="space-y-4">
                    {departments.map((dept) => (
                        <div key={dept.id} className="rounded-2xl border border-slate-200/80 p-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h4 className="font-semibold text-slate-900">{dept.name}</h4>
                                    <p className="text-xs text-text-muted">
                                        Quản lý: {dept.manager?.name || 'Chưa gán'}
                                    </p>
                                    <p className="text-xs text-text-muted">
                                        Nhân sự: {(dept.staff || []).length} người
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {canManage && (
                                        <>
                                            <button
                                                type="button"
                                                className="text-xs font-semibold text-primary"
                                                onClick={() => startEdit(dept)}
                                            >
                                                Sửa
                                            </button>
                                            <button
                                                type="button"
                                                className="text-xs font-semibold text-rose-500"
                                                onClick={() => remove(dept)}
                                            >
                                                Xóa
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            {(dept.staff || []).length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {dept.staff.map((user) => (
                                        <span key={user.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                                            {user.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {departments.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                            Chưa có phòng ban nào.
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa phòng ban #${editingId}` : 'Tạo phòng ban'}
                description="Gán quản lý và nhân sự theo phòng ban."
                size="lg"
            >
                <div className="space-y-3 text-sm">
                    <FormField label="Tên phòng ban" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: Phòng sản xuất, Phòng kinh doanh"
                            value={form.name}
                            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Quản lý phòng ban">
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.manager_id}
                            onChange={(e) => setForm((s) => ({ ...s, manager_id: e.target.value }))}
                        >
                            <option value="">Chọn quản lý</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} • {user.role}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Nhân sự thuộc phòng ban">
                        <select
                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            multiple
                            value={form.staff_ids}
                            onChange={(e) => {
                                const values = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                                setForm((s) => ({ ...s, staff_ids: values }));
                            }}
                            size={6}
                        >
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} • {user.role}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    {!canManage && (
                        <p className="text-xs text-text-muted">
                            Chỉ Admin mới được chỉnh sửa phòng ban.
                        </p>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={save}
                        >
                            {editingId ? 'Cập nhật phòng ban' : 'Tạo phòng ban'}
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
        </PageContainer>
    );
}
