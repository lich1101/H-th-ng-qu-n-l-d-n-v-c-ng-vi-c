import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

export default function LeadTypes(props) {
    const toast = useToast();
    const [types, setTypes] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', color_hex: '#2563EB', sort_order: 1 });

    const fetchTypes = async () => {
        try {
            const res = await axios.get('/api/v1/lead-types');
            setTypes(res.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được trạng thái.');
        }
    };

    useEffect(() => {
        fetchTypes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        return [
            { label: 'Tổng trạng thái', value: String(types.length) },
            { label: 'Kích hoạt', value: String(types.length) },
            { label: 'Màu thẻ', value: 'Tùy chỉnh' },
            { label: 'Quyền', value: 'Quản trị' },
        ];
    }, [types]);

    const resetForm = () => {
        setEditingId(null);
        setForm({ name: '', color_hex: '#2563EB', sort_order: 1 });
    };

    const startEdit = (type) => {
        setEditingId(type.id);
        setForm({
            name: type.name || '',
            color_hex: type.color_hex || '#2563EB',
            sort_order: type.sort_order ?? 1,
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
        if (!form.name.trim()) return toast.error('Vui lòng nhập tên trạng thái.');
        const payload = {
            name: form.name,
            color_hex: form.color_hex,
            sort_order: Number(form.sort_order || 0),
        };
        try {
            if (editingId) {
                await axios.put(`/api/v1/lead-types/${editingId}`, payload);
                toast.success('Đã cập nhật trạng thái.');
            } else {
                await axios.post('/api/v1/lead-types', payload);
                toast.success('Đã tạo trạng thái.');
            }
            closeForm();
            await fetchTypes();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu trạng thái thất bại.');
        }
    };

    const remove = async (type) => {
        if (!confirm('Xóa trạng thái này?')) return;
        try {
            await axios.delete(`/api/v1/lead-types/${type.id}`);
            toast.success('Đã xóa trạng thái.');
            await fetchTypes();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa trạng thái thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Trạng thái khách hàng"
            description="Cấu hình trạng thái khách hàng tiềm năng, màu thẻ hiển thị trong quản lý khách hàng."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Danh sách trạng thái</h3>
                    <button
                        type="button"
                        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                        onClick={openCreate}
                    >
                        Thêm mới
                    </button>
                </div>
                <div className="space-y-3">
                    {types.map((type) => (
                        <div key={type.id} className="flex items-center justify-between rounded-2xl border border-slate-200/80 px-4 py-3">
                            <div className="flex items-center gap-3">
                                <span
                                    className="rounded-full border px-3 py-1 text-xs font-semibold"
                                    style={{
                                        borderColor: type.color_hex || '#94A3B8',
                                        color: type.color_hex || '#94A3B8',
                                        backgroundColor: `${type.color_hex || '#94A3B8'}20`,
                                    }}
                                >
                                    {type.name}
                                </span>
                                <span className="text-xs text-text-muted">Thứ tự: {type.sort_order ?? 0}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-primary"
                                    onClick={() => startEdit(type)}
                                >
                                    Sửa
                                </button>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-rose-500"
                                    onClick={() => remove(type)}
                                >
                                    Xóa
                                </button>
                            </div>
                        </div>
                    ))}
                    {types.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                            Chưa có trạng thái nào.
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa trạng thái #${editingId}` : 'Tạo trạng thái'}
                description="Cập nhật tên, màu tag và thứ tự hiển thị."
                size="sm"
            >
                <div className="space-y-3 text-sm">
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Tên trạng thái"
                        value={form.name}
                        onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="color"
                            value={form.color_hex}
                            onChange={(e) => setForm((s) => ({ ...s, color_hex: e.target.value }))}
                        />
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="number"
                            placeholder="Thứ tự"
                            value={form.sort_order}
                            onChange={(e) => setForm((s) => ({ ...s, sort_order: e.target.value }))}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={save}
                        >
                            {editingId ? 'Cập nhật trạng thái' : 'Tạo trạng thái'}
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
