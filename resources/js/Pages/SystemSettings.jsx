import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

export default function SystemSettings(props) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        brand_name: props.settings?.brand_name || '',
        primary_color: props.settings?.primary_color || '#04BC5C',
        logo_url: props.settings?.logo_url || '',
    });
    const [logoFile, setLogoFile] = useState(null);
    const [preview, setPreview] = useState(props.settings?.logo_url || '');
    const [showPreview, setShowPreview] = useState(false);

    const applyPrimary = (hex) => {
        if (!hex) return;
        const cleaned = hex.replace('#', '').trim();
        if (cleaned.length !== 6) return;
        const r = parseInt(cleaned.substring(0, 2), 16);
        const g = parseInt(cleaned.substring(2, 4), 16);
        const b = parseInt(cleaned.substring(4, 6), 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return;
        document.documentElement.style.setProperty('--color-primary', `${r} ${g} ${b}`);
    };

    useEffect(() => {
        if (!logoFile) return;
        const url = URL.createObjectURL(logoFile);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [logoFile]);

    const save = async () => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('brand_name', form.brand_name || '');
            formData.append('primary_color', form.primary_color || '#04BC5C');
            if (form.logo_url) {
                formData.append('logo_url', form.logo_url);
            }
            if (logoFile) {
                formData.append('logo', logoFile);
            }

            const res = await axios.post('/api/v1/settings', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Đã cập nhật cấu hình hệ thống.');
            const data = res.data || {};
            if (data.primary_color) applyPrimary(data.primary_color);
            setForm((prev) => ({
                ...prev,
                brand_name: data.brand_name || prev.brand_name,
                primary_color: data.primary_color || prev.primary_color,
                logo_url: data.logo_url || prev.logo_url,
            }));
            setLogoFile(null);
            if (data.logo_url) setPreview(data.logo_url);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Cập nhật thất bại.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Cài đặt hệ thống"
            description="Tùy chỉnh thương hiệu và giao diện chung cho app và web."
            stats={[]}
        >
            <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                    <h3 className="text-sm font-semibold text-slate-900">Thông tin thương hiệu</h3>
                    <p className="text-xs text-text-muted mt-1">Đổi tên hiển thị, màu chủ đạo và logo.</p>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-xs text-text-muted">Tên brand</label>
                            <input
                                className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                value={form.brand_name}
                                onChange={(e) => setForm((s) => ({ ...s, brand_name: e.target.value }))}
                                placeholder="Ví dụ: WinMap"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Màu chủ đạo</label>
                            <div className="mt-2 flex items-center gap-3">
                                <input
                                    type="color"
                                    value={form.primary_color}
                                    onChange={(e) => setForm((s) => ({ ...s, primary_color: e.target.value }))}
                                    className="h-10 w-12 rounded-lg border border-slate-200"
                                />
                                <input
                                    className="flex-1 rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.primary_color}
                                    onChange={(e) => setForm((s) => ({ ...s, primary_color: e.target.value }))}
                                    placeholder="#04BC5C"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-xs text-text-muted">Logo (URL)</label>
                            <input
                                className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                value={form.logo_url}
                                onChange={(e) => setForm((s) => ({ ...s, logo_url: e.target.value }))}
                                placeholder="https://..."
                            />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Logo (Upload)</label>
                            <div className="mt-2 flex items-center gap-3">
                                <label className="flex-1 cursor-pointer rounded-2xl border border-dashed border-slate-200/80 px-3 py-2 text-sm text-text-muted hover:border-primary">
                                    {logoFile ? logoFile.name : 'Chọn file logo'}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                                    />
                                </label>
                                {preview && (
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-primary"
                                        onClick={() => setShowPreview(true)}
                                    >
                                        Xem trước
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            type="button"
                            className="rounded-2xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                            onClick={save}
                            disabled={loading}
                        >
                            {loading ? 'Đang lưu...' : 'Lưu cài đặt'}
                        </button>
                        <button
                            type="button"
                            className="rounded-2xl border border-slate-200/80 px-4 py-2 text-sm font-semibold text-slate-700"
                            onClick={() => setForm({
                                brand_name: props.settings?.brand_name || '',
                                primary_color: props.settings?.primary_color || '#04BC5C',
                                logo_url: props.settings?.logo_url || '',
                            })}
                        >
                            Hoàn tác
                        </button>
                    </div>
                </div>
            </div>

            <Modal open={showPreview} onClose={() => setShowPreview(false)} title="Xem trước logo" size="sm">
                <div className="flex flex-col items-center gap-3">
                    {preview ? (
                        <img src={preview} alt="Logo" className="max-h-48 rounded-xl object-contain" />
                    ) : (
                        <p className="text-sm text-text-muted">Chưa có logo.</p>
                    )}
                </div>
            </Modal>
        </PageContainer>
    );
}
