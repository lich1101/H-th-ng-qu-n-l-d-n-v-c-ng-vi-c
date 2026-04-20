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

const toSafeCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
};

export default function OpportunityStatuses(props) {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', color_hex: '#F59E0B', sort_order: 1 });

    const fetchItems = async () => {
        try {
            const res = await axios.get('/api/v1/opportunity-statuses');
            setItems(res.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được trạng thái cơ hội.');
        }
    };

    useEffect(() => {
        fetchItems();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => ([
        { label: 'Tổng trạng thái', value: String(items.length) },
        { label: 'Trạng thái đang dùng', value: String(items.filter((item) => toSafeCount(item?.opportunities_count) > 0).length) },
        { label: 'Tổng cơ hội', value: String(items.reduce((sum, item) => sum + toSafeCount(item?.opportunities_count), 0)) },
        { label: 'Quyền', value: 'Admin / Administrator' },
    ]), [items]);

    const resetForm = () => {
        setEditingId(null);
        setForm({ name: '', color_hex: '#F59E0B', sort_order: 1 });
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const startEdit = (item) => {
        setEditingId(item.id);
        setForm({
            name: item.name || '',
            color_hex: item.color_hex || '#F59E0B',
            sort_order: item.sort_order ?? 1,
        });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const save = async () => {
        if (!form.name.trim()) {
            toast.error('Vui lòng nhập tên trạng thái cơ hội.');
            return;
        }

        const payload = {
            name: form.name.trim(),
            color_hex: form.color_hex || '#F59E0B',
            sort_order: Number(form.sort_order || 0),
        };

        try {
            if (editingId) {
                await axios.put(`/api/v1/opportunity-statuses/${editingId}`, payload);
                toast.success('Đã cập nhật trạng thái cơ hội.');
            } else {
                await axios.post('/api/v1/opportunity-statuses', payload);
                toast.success('Đã tạo trạng thái cơ hội.');
            }
            closeForm();
            await fetchItems();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu trạng thái cơ hội thất bại.');
        }
    };

    const remove = async (item) => {
        if (!confirm('Xóa trạng thái cơ hội này?')) return;
        try {
            await axios.delete(`/api/v1/opportunity-statuses/${item.id}`);
            toast.success('Đã xóa trạng thái cơ hội.');
            await fetchItems();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa trạng thái cơ hội thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Trạng thái cơ hội"
            description="Admin cấu hình trạng thái cơ hội riêng, đổi màu thẻ hiển thị và thứ tự cho pipeline bán hàng."
            stats={stats}
        >
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="font-semibold text-slate-900">Danh sách trạng thái cơ hội</h3>
                        <p className="mt-1 text-sm text-text-muted">
                            Mỗi trạng thái có màu tag riêng để hiển thị đồng nhất ở danh sách cơ hội và chi tiết khách hàng.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                        onClick={openCreate}
                    >
                        Thêm mới
                    </button>
                </div>

                <div className="space-y-3">
                    {items.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200/80 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span
                                        className="rounded-full border px-3 py-1 text-xs font-semibold"
                                        style={{
                                            borderColor: item.color_hex || '#94A3B8',
                                            color: '#111827',
                                            backgroundColor: `${item.color_hex || '#94A3B8'}2A`,
                                        }}
                                    >
                                        {item.name}
                                    </span>
                                    <span className="text-xs text-text-muted">Mã nội bộ: {item.code || 'tự sinh'}</span>
                                    <span className="text-xs text-text-muted">Thứ tự: {item.sort_order ?? 0}</span>
                                    <span className="text-xs text-text-muted">Số cơ hội: {toSafeCount(item.opportunities_count)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-primary"
                                        onClick={() => startEdit(item)}
                                    >
                                        Sửa
                                    </button>
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-rose-500"
                                        onClick={() => remove(item)}
                                    >
                                        Xóa
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {items.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                            Chưa có trạng thái cơ hội nào.
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa trạng thái cơ hội #${editingId}` : 'Tạo trạng thái cơ hội'}
                description="Cập nhật tên, màu thẻ và thứ tự hiển thị cho pipeline cơ hội."
                size="sm"
            >
                <div className="space-y-3 text-sm">
                    <FormField label="Tên trạng thái" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: Chờ báo giá, Đang chốt, Thành công"
                            value={form.name}
                            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Màu hiển thị">
                            <input
                                className="h-11 w-full rounded-2xl border border-slate-200/80 p-1"
                                type="color"
                                value={form.color_hex}
                                onChange={(e) => setForm((s) => ({ ...s, color_hex: e.target.value }))}
                            />
                        </FormField>

                        <FormField label="Thứ tự hiển thị">
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="number"
                                value={form.sort_order}
                                onChange={(e) => setForm((s) => ({ ...s, sort_order: e.target.value }))}
                            />
                        </FormField>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-white"
                            onClick={save}
                        >
                            {editingId ? 'Cập nhật trạng thái' : 'Tạo trạng thái'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"
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
