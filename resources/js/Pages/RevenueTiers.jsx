import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

export default function RevenueTiers(props) {
    const toast = useToast();
    const [tiers, setTiers] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        name: '',
        label: '',
        color_hex: '#9CA3AF',
        min_amount: 0,
        sort_order: 1,
    });

    const fetchTiers = async () => {
        try {
            const res = await axios.get('/api/v1/revenue-tiers');
            setTiers(res.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được hạng doanh thu.');
        }
    };

    useEffect(() => {
        fetchTiers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        return [
            { label: 'Tổng hạng', value: String(tiers.length) },
            { label: 'Cấu hình', value: 'Tự động' },
            { label: 'Tiền tệ', value: 'VNĐ' },
            { label: 'Quyền', value: 'Quản trị' },
        ];
    }, [tiers]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            name: '',
            label: '',
            color_hex: '#9CA3AF',
            min_amount: 0,
            sort_order: 1,
        });
    };

    const startEdit = (tier) => {
        setEditingId(tier.id);
        setForm({
            name: tier.name || '',
            label: tier.label || '',
            color_hex: tier.color_hex || '#9CA3AF',
            min_amount: tier.min_amount ?? 0,
            sort_order: tier.sort_order ?? 1,
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
        if (!form.name.trim() || !form.label.trim()) {
            toast.error('Vui lòng nhập tên và nhãn hiển thị.');
            return;
        }
        const payload = {
            name: form.name,
            label: form.label,
            color_hex: form.color_hex,
            min_amount: Number(form.min_amount || 0),
            sort_order: Number(form.sort_order || 0),
        };
        try {
            if (editingId) {
                await axios.put(`/api/v1/revenue-tiers/${editingId}`, payload);
                toast.success('Đã cập nhật hạng doanh thu.');
            } else {
                await axios.post('/api/v1/revenue-tiers', payload);
                toast.success('Đã tạo hạng doanh thu.');
            }
            closeForm();
            await fetchTiers();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu hạng thất bại.');
        }
    };

    const remove = async (tier) => {
        if (!confirm('Xóa hạng doanh thu này?')) return;
        try {
            await axios.delete(`/api/v1/revenue-tiers/${tier.id}`);
            toast.success('Đã xóa hạng doanh thu.');
            await fetchTiers();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa hạng thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Hạng doanh thu"
            description="Thiết lập mốc bạc/vàng/kim cương theo tổng doanh thu."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Danh sách hạng doanh thu</h3>
                    <button
                        type="button"
                        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                        onClick={openCreate}
                    >
                        Thêm mới
                    </button>
                </div>
                <div className="space-y-3">
                    {tiers.map((tier) => (
                        <div key={tier.id} className="flex items-center justify-between rounded-2xl border border-slate-200/80 px-4 py-3">
                            <div className="flex items-center gap-3">
                                <span
                                    className="rounded-full border px-3 py-1 text-xs font-semibold"
                                    style={{
                                        borderColor: tier.color_hex || '#94A3B8',
                                        color: tier.color_hex || '#94A3B8',
                                        backgroundColor: `${tier.color_hex || '#94A3B8'}20`,
                                    }}
                                >
                                    {tier.label}
                                </span>
                                <span className="text-xs text-text-muted">
                                    ≥ {Number(tier.min_amount || 0).toLocaleString('vi-VN')} VNĐ
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-primary"
                                    onClick={() => startEdit(tier)}
                                >
                                    Sửa
                                </button>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-rose-500"
                                    onClick={() => remove(tier)}
                                >
                                    Xóa
                                </button>
                            </div>
                        </div>
                    ))}
                    {tiers.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                            Chưa có hạng doanh thu nào.
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa hạng #${editingId}` : 'Tạo hạng mới'}
                description="Thiết lập nhãn, mốc doanh thu và màu hiển thị."
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Tên hệ thống (vd: bac)"
                        value={form.name}
                        onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    />
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Nhãn hiển thị (vd: Bạc)"
                        value={form.label}
                        onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            className="h-11 w-full rounded-2xl border border-slate-200/80 p-1"
                            type="color"
                            value={form.color_hex}
                            onChange={(e) => setForm((s) => ({ ...s, color_hex: e.target.value }))}
                        />
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="number"
                            placeholder="Mốc doanh thu"
                            value={form.min_amount}
                            onChange={(e) => setForm((s) => ({ ...s, min_amount: e.target.value }))}
                        />
                    </div>
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        type="number"
                        placeholder="Thứ tự"
                        value={form.sort_order}
                        onChange={(e) => setForm((s) => ({ ...s, sort_order: e.target.value }))}
                    />
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={save}
                        >
                            {editingId ? 'Cập nhật hạng' : 'Tạo hạng'}
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
