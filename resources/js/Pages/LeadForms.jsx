import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

export default function LeadForms(props) {
    const toast = useToast();
    const [forms, setForms] = useState([]);
    const [leadTypes, setLeadTypes] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        name: '',
        slug: '',
        lead_type_id: '',
        department_id: '',
        is_active: true,
        redirect_url: '',
        description: '',
    });

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    const fetchData = async () => {
        try {
            const [formsRes, leadRes, deptRes] = await Promise.all([
                axios.get('/api/v1/lead-forms', { params: { per_page: 200 } }),
                axios.get('/api/v1/lead-types'),
                axios.get('/api/v1/departments'),
            ]);
            setForms(formsRes.data?.data || []);
            setLeadTypes(leadRes.data || []);
            setDepartments(deptRes.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được form tư vấn.');
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const active = forms.filter((f) => f.is_active).length;
        return [
            { label: 'Tổng form', value: String(forms.length) },
            { label: 'Đang chạy', value: String(active) },
            { label: 'Tắt', value: String(forms.length - active) },
            { label: 'Nguồn iframe', value: 'OK' },
        ];
    }, [forms]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            name: '',
            slug: '',
            lead_type_id: '',
            department_id: '',
            is_active: true,
            redirect_url: '',
            description: '',
        });
    };

    const startEdit = (item) => {
        setEditingId(item.id);
        setForm({
            name: item.name || '',
            slug: item.slug || '',
            lead_type_id: item.lead_type_id || '',
            department_id: item.department_id || '',
            is_active: !!item.is_active,
            redirect_url: item.redirect_url || '',
            description: item.description || '',
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
        if (!form.name.trim() || !form.slug.trim()) {
            toast.error('Vui lòng nhập tên và slug form.');
            return;
        }
        const payload = {
            name: form.name,
            slug: form.slug,
            lead_type_id: form.lead_type_id ? Number(form.lead_type_id) : null,
            department_id: form.department_id ? Number(form.department_id) : null,
            is_active: !!form.is_active,
            redirect_url: form.redirect_url || null,
            description: form.description || null,
        };
        try {
            if (editingId) {
                await axios.put(`/api/v1/lead-forms/${editingId}`, payload);
                toast.success('Đã cập nhật form.');
            } else {
                await axios.post('/api/v1/lead-forms', payload);
                toast.success('Đã tạo form.');
            }
            closeForm();
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu form thất bại.');
        }
    };

    const remove = async (item) => {
        if (!confirm('Xóa form này?')) return;
        try {
            await axios.delete(`/api/v1/lead-forms/${item.id}`);
            toast.success('Đã xóa form.');
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa form thất bại.');
        }
    };

    const iframeCode = (slug) =>
        `<iframe src="${baseUrl}/lead-forms/${slug}" style="width:100%;min-height:540px;border:0;border-radius:16px;"></iframe>`;

    return (
        <PageContainer
            auth={props.auth}
            title="Form tư vấn khách hàng"
            description="Tạo form iframe để thu khách hàng tiềm năng từ website, fanpage hoặc landing page."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Danh sách form</h3>
                    <button
                        type="button"
                        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                        onClick={openCreate}
                    >
                        Thêm mới
                    </button>
                </div>
                <div className="space-y-4">
                    {forms.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200/80 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h4 className="font-semibold text-slate-900">{item.name}</h4>
                                    <p className="text-xs text-text-muted">Slug: {item.slug}</p>
                                    <p className="text-xs text-text-muted">
                                        {item.is_active ? 'Đang kích hoạt' : 'Đang tắt'} •{' '}
                                        {item.lead_type?.name || 'Không đặt trạng thái'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                                        onClick={() => startEdit(item)}
                                    >
                                        Sửa
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600"
                                        onClick={() => remove(item)}
                                    >
                                        Xóa
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 overflow-x-auto">
                                {iframeCode(item.slug)}
                            </div>
                        </div>
                    ))}
                    {forms.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                            Chưa có form tư vấn nào.
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa form #${editingId}` : 'Tạo form mới'}
                description="Thiết lập form iframe thu khách hàng tiềm năng, gắn phòng ban và trạng thái."
                size="lg"
            >
                <div className="space-y-3 text-sm">
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Tên form *"
                        value={form.name}
                        onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    />
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Slug (không dấu) *"
                        value={form.slug}
                        onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value }))}
                    />
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.lead_type_id}
                        onChange={(e) => setForm((s) => ({ ...s, lead_type_id: e.target.value }))}
                    >
                        <option value="">Trạng thái mặc định</option>
                        {leadTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                                {type.name}
                            </option>
                        ))}
                    </select>
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.department_id}
                        onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value }))}
                    >
                        <option value="">Phòng ban nhận khách hàng tiềm năng</option>
                        {departments.map((dept) => (
                            <option key={dept.id} value={dept.id}>
                                {dept.name}
                            </option>
                        ))}
                    </select>
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Redirect URL (tuỳ chọn)"
                        value={form.redirect_url}
                        onChange={(e) => setForm((s) => ({ ...s, redirect_url: e.target.value }))}
                    />
                    <textarea
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        rows={3}
                        placeholder="Mô tả form"
                        value={form.description}
                        onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    />
                    <label className="flex items-center gap-2 text-xs text-text-muted">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
                        />
                        Kích hoạt form
                    </label>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={save}
                        >
                            {editingId ? 'Cập nhật form' : 'Tạo form'}
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
