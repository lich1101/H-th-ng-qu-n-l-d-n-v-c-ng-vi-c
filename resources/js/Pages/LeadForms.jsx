import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';

const BUILDER_TABS = [
    { key: 'basics', label: 'Nội dung' },
    { key: 'fields', label: 'Trường dữ liệu' },
    { key: 'style', label: 'Giao diện' },
    { key: 'crm', label: 'Đổ về CRM' },
    { key: 'share', label: 'Chia sẻ' },
];

const FIELD_TYPE_OPTIONS = [
    { value: 'text', label: 'Dòng chữ ngắn' },
    { value: 'textarea', label: 'Đoạn nội dung dài' },
    { value: 'phone', label: 'Số điện thoại' },
    { value: 'email', label: 'Email' },
    { value: 'select', label: 'Danh sách chọn' },
];

const WIDTH_OPTIONS = [
    { value: 'full', label: 'Chiếm cả dòng' },
    { value: 'half', label: 'Đứng cùng 1 hàng' },
];

const CRM_FIELD_OPTIONS = [
    { value: 'ignore', label: 'Chỉ nhận ở form, chưa đổ vào CRM' },
    { value: 'name', label: 'Tên khách hàng' },
    { value: 'company', label: 'Tên công ty' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Số điện thoại' },
    { value: 'lead_message', label: 'Nội dung nhu cầu' },
    { value: 'notes', label: 'Ghi chú khách hàng' },
];

const BACKGROUND_OPTIONS = [
    { value: 'soft', label: 'Mềm và sáng', hint: 'Phù hợp form tư vấn thông thường' },
    { value: 'clean', label: 'Gọn tối giản', hint: 'Sạch, ít hiệu ứng, dễ nhúng landing page' },
    { value: 'spotlight', label: 'Nhấn thương hiệu', hint: 'Nền có ánh màu để nổi bật CTA' },
];

const SURFACE_OPTIONS = [
    { value: 'soft', label: 'Bo mềm' },
    { value: 'rounded', label: 'Bo lớn' },
    { value: 'sharp', label: 'Bo gọn' },
];

const LOGO_OPTIONS = [
    { value: 'brand', label: 'Dùng logo thương hiệu chung' },
    { value: 'custom', label: 'Dùng logo riêng cho form này' },
    { value: 'hidden', label: 'Ẩn logo' },
];

const FIELD_PRESETS = [
    {
        label: 'Họ và tên',
        type: 'text',
        placeholder: 'Nhập họ và tên',
        required: true,
        width: 'full',
        map_to: 'name',
    },
    {
        label: 'Số điện thoại',
        type: 'phone',
        placeholder: 'Nhập số điện thoại',
        required: true,
        width: 'half',
        map_to: 'phone',
        validation: { min_length: 8, max_length: 30 },
    },
    {
        label: 'Email',
        type: 'email',
        placeholder: 'Nhập email',
        required: false,
        width: 'half',
        map_to: 'email',
    },
    {
        label: 'Công ty',
        type: 'text',
        placeholder: 'Tên công ty / thương hiệu',
        required: false,
        width: 'full',
        map_to: 'company',
    },
    {
        label: 'Nhu cầu tư vấn',
        type: 'textarea',
        placeholder: 'Bạn đang cần tư vấn gì?',
        required: false,
        width: 'full',
        map_to: 'lead_message',
        validation: { min_length: '', max_length: 2000 },
    },
    {
        label: 'Gói dịch vụ quan tâm',
        type: 'select',
        placeholder: '',
        required: false,
        width: 'full',
        map_to: 'notes',
        options: ['SEO tổng thể', 'Backlinks', 'Content', 'Website'],
    },
];

const defaultStyleConfig = (settings = null) => ({
    primary_color: settings?.primary_color || '#04BC5C',
    background_style: 'soft',
    surface_style: 'soft',
    submit_label: 'Gửi thông tin',
    success_message: 'Cảm ơn bạn đã gửi thông tin. Đội ngũ sẽ liên hệ sớm.',
    logo_mode: 'brand',
    logo_url: '',
    show_card_border: false,
    custom_css: '',
    custom_js: '',
});

const defaultSubmissionMapping = () => ({
    target: 'clients',
    append_unmapped_to_notes: true,
});

const createFieldId = () => `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const parseSelectOptionsText = (value) =>
    String(value ?? '')
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean);

const resolveFieldOptionsText = (field = {}) => {
    if (typeof field.options_text === 'string') return field.options_text;
    if (Array.isArray(field.options)) return field.options.join('\n');
    return '';
};

const resolveFieldOptions = (field = {}) => {
    if (typeof field.options_text === 'string') {
        return parseSelectOptionsText(field.options_text);
    }

    return Array.isArray(field.options)
        ? field.options
            .map((row) => String(row ?? '').trim())
            .filter(Boolean)
        : [];
};

const createField = (preset = {}) => {
    const optionsText = resolveFieldOptionsText(preset);

    return ({
        id: preset.id || createFieldId(),
        key: preset.key || '',
        label: preset.label || 'Trường mới',
        type: preset.type || 'text',
        placeholder: preset.placeholder || '',
        help_text: preset.help_text || '',
        required: preset.required ?? false,
        width: preset.width || 'full',
        options_text: optionsText,
        options: parseSelectOptionsText(optionsText),
        validation: {
            min_length: preset.validation?.min_length ?? '',
            max_length: preset.validation?.max_length ?? '',
        },
        map_to: preset.map_to || 'ignore',
    });
};

const defaultFieldSchema = () => [
    createField(FIELD_PRESETS[0]),
    createField(FIELD_PRESETS[1]),
    createField(FIELD_PRESETS[2]),
    createField(FIELD_PRESETS[3]),
    createField(FIELD_PRESETS[4]),
];

const slugify = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

const buildFormState = (settings, item = null) => ({
    name: item?.name || '',
    slug: item?.slug || '',
    lead_type_id: item?.lead_type_id ? String(item.lead_type_id) : '',
    department_id: item?.department_id ? String(item.department_id) : '',
    is_active: item?.is_active ?? true,
    redirect_url: item?.redirect_url || '',
    description: item?.description || '',
    field_schema:
        Array.isArray(item?.field_schema) && item.field_schema.length > 0
            ? item.field_schema.map((field) => createField(field))
            : defaultFieldSchema(),
    style_config: {
        ...defaultStyleConfig(settings),
        ...(item?.style_config || {}),
    },
    submission_mapping: {
        ...defaultSubmissionMapping(),
        ...(item?.submission_mapping || {}),
    },
});

function SectionCard({ title, description, children, footer }) {
    return (
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
            <div className="mb-4">
                <h4 className="text-base font-semibold text-slate-900">{title}</h4>
                {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
            </div>
            <div className="space-y-4">{children}</div>
            {footer && <div className="mt-4 border-t border-slate-200/80 pt-4">{footer}</div>}
        </section>
    );
}

function BuilderTabButton({ active, label, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active
                    ? 'bg-primary text-white shadow-[0_12px_26px_rgba(4,188,92,0.22)]'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:border-primary/30'
            }`}
        >
            {label}
        </button>
    );
}

function FormPreview({ form, settings, logoPreview }) {
    const style = form.style_config || {};
    const primaryColor = style.primary_color || settings?.primary_color || '#04BC5C';
    const logoSrc =
        style.logo_mode === 'custom'
            ? logoPreview || style.logo_url
            : style.logo_mode === 'brand'
            ? settings?.logo_url
            : '';
    const visibleLogo = style.logo_mode !== 'hidden' && !!logoSrc;
    const backgroundClass =
        style.background_style === 'clean'
            ? 'bg-white'
            : style.background_style === 'spotlight'
            ? 'bg-[linear-gradient(180deg,rgba(4,188,92,0.10)_0%,rgba(255,255,255,0.98)_38%,#ffffff_100%)]'
            : 'bg-slate-50';
    const radiusClass =
        style.surface_style === 'rounded'
            ? 'rounded-[28px]'
            : style.surface_style === 'sharp'
            ? 'rounded-2xl'
            : 'rounded-3xl';

    return (
        <div className={`${backgroundClass} rounded-[32px] border border-slate-200/80 p-4`}>
            <div className={`${radiusClass} border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]`}>
                {visibleLogo && (
                    <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        <img
                            src={logoSrc}
                            alt={settings?.brand_name || 'Logo'}
                            className="h-9 w-9 rounded-xl bg-white object-contain"
                        />
                        <span>{settings?.brand_name || 'Thương hiệu'}</span>
                    </div>
                )}
                <h3 className="text-2xl font-semibold text-slate-900">{form.name || 'Tên form tư vấn'}</h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                    {form.description || 'Mô tả ngắn gọn để khách hiểu vì sao nên để lại thông tin.'}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                    {form.field_schema.map((field) => {
                        const isFull = field.width !== 'half';
                        const wrapperClass = isFull ? 'col-span-2' : 'col-span-1';
                        const selectOptions = resolveFieldOptions(field);
                        return (
                            <div key={field.id} className={wrapperClass}>
                                <label className="mb-1 block text-xs font-semibold text-slate-600">
                                    {field.label}
                                    {field.required ? ' *' : ''}
                                </label>
                                {field.type === 'textarea' ? (
                                    <div className="min-h-[88px] rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-400">
                                        {field.placeholder || 'Khách sẽ nhập nội dung tại đây'}
                                    </div>
                                ) : field.type === 'select' ? (
                                    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-500">
                                        {selectOptions[0] || `Chọn ${field.label.toLowerCase()}`}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-400">
                                        {field.placeholder || `Nhập ${field.label.toLowerCase()}`}
                                    </div>
                                )}
                                {field.help_text && <p className="mt-1 text-[11px] text-text-muted">{field.help_text}</p>}
                            </div>
                        );
                    })}
                </div>
                <button
                    type="button"
                    className="mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(15,23,42,0.12)]"
                    style={{ backgroundColor: primaryColor }}
                >
                    {style.submit_label || 'Gửi thông tin'}
                </button>
            </div>
        </div>
    );
}

export default function LeadForms(props) {
    const toast = useToast();
    const [forms, setForms] = useState([]);
    const [formsMeta, setFormsMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [listFilters, setListFilters] = useState({ per_page: 12, page: 1 });
    const [leadTypes, setLeadTypes] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [staffUsers, setStaffUsers] = useState([]);
    const [settings, setSettings] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [activeTab, setActiveTab] = useState('basics');
    const [saving, setSaving] = useState(false);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState('');
    const [form, setForm] = useState(buildFormState(null));

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const previewSlug = form.slug || slugify(form.name) || 'form-tu-van';
    const publicUrl = `${baseUrl}/lead-forms/${previewSlug}`;
    const iframeCode = `<iframe src="${publicUrl}" style="width:100%;min-height:640px;border:0;border-radius:20px;"></iframe>`;

    useEffect(() => {
        if (!logoFile) return undefined;
        const url = URL.createObjectURL(logoFile);
        setLogoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [logoFile]);

    const fetchData = async (pageOrFilters = listFilters.page, maybeFilters = listFilters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);
        try {
            const [formsRes, leadRes, deptRes, settingsRes, usersRes] = await Promise.all([
                axios.get('/api/v1/lead-forms', {
                    params: {
                        per_page: nextFilters.per_page || 12,
                        page: nextPage,
                    },
                }),
                axios.get('/api/v1/lead-types'),
                axios.get('/api/v1/departments'),
                axios.get('/api/v1/settings'),
                axios.get('/api/v1/users/lookup', {
                    params: { purpose: 'operational_assignee' },
                }),
            ]);
            setForms(formsRes.data?.data || []);
            setFormsMeta({
                current_page: formsRes.data?.current_page || 1,
                last_page: formsRes.data?.last_page || 1,
                total: formsRes.data?.total || 0,
            });
            setListFilters((prev) => ({ ...prev, page: formsRes.data?.current_page || nextPage }));
            setLeadTypes(leadRes.data || []);
            setDepartments(deptRes.data || []);
            setSettings(settingsRes.data || null);
            setStaffUsers(usersRes.data?.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được cấu hình form tư vấn.');
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetForm = (settingsState = settings) => {
        setEditingId(null);
        setActiveTab('basics');
        setLogoFile(null);
        setLogoPreview('');
        setForm(buildFormState(settingsState));
    };

    const openCreate = () => {
        resetForm(settings);
        setShowForm(true);
    };

    const startEdit = (item) => {
        setEditingId(item.id);
        setActiveTab('basics');
        setLogoFile(null);
        setLogoPreview('');
        setForm(buildFormState(settings, item));
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm(settings);
    };

    const updateField = (fieldId, patch) => {
        setForm((current) => ({
            ...current,
            field_schema: current.field_schema.map((field) =>
                field.id === fieldId ? { ...field, ...patch } : field
            ),
        }));
    };

    const updateFieldValidation = (fieldId, patch) => {
        setForm((current) => ({
            ...current,
            field_schema: current.field_schema.map((field) =>
                field.id === fieldId
                    ? {
                          ...field,
                          validation: {
                              ...field.validation,
                              ...patch,
                          },
                      }
                    : field
            ),
        }));
    };

    const addField = (preset = {}) => {
        setForm((current) => ({
            ...current,
            field_schema: [...current.field_schema, createField(preset)],
        }));
        setActiveTab('fields');
    };

    const moveField = (fieldId, direction) => {
        setForm((current) => {
            const index = current.field_schema.findIndex((field) => field.id === fieldId);
            if (index < 0) return current;
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= current.field_schema.length) return current;
            const nextFields = [...current.field_schema];
            const [moved] = nextFields.splice(index, 1);
            nextFields.splice(targetIndex, 0, moved);
            return { ...current, field_schema: nextFields };
        });
    };

    const removeField = (fieldId) => {
        setForm((current) => ({
            ...current,
            field_schema: current.field_schema.filter((field) => field.id !== fieldId),
        }));
    };

    const updateStyleConfig = (patch) => {
        setForm((current) => ({
            ...current,
            style_config: {
                ...current.style_config,
                ...patch,
            },
        }));
    };

    const updateSubmissionMapping = (patch) => {
        setForm((current) => ({
            ...current,
            submission_mapping: {
                ...current.submission_mapping,
                ...patch,
            },
        }));
    };

    const copyText = async (value, successLabel) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(successLabel);
        } catch {
            toast.error('Không thể sao chép. Hãy thử lại trên trình duyệt khác.');
        }
    };

    const save = async () => {
        if (!form.name.trim()) {
            toast.error('Vui lòng nhập tên form.');
            setActiveTab('basics');
            return;
        }
        if (form.field_schema.length === 0) {
            toast.error('Form cần có ít nhất 1 trường dữ liệu.');
            setActiveTab('fields');
            return;
        }

        setSaving(true);
        try {
            const payload = new FormData();
            payload.append('name', form.name.trim());
            if (form.slug.trim()) payload.append('slug', form.slug.trim());
            if (form.lead_type_id) payload.append('lead_type_id', form.lead_type_id);
            if (form.department_id) payload.append('department_id', form.department_id);
            payload.append('is_active', form.is_active ? '1' : '0');
            if (form.redirect_url.trim()) payload.append('redirect_url', form.redirect_url.trim());
            if (form.description.trim()) payload.append('description', form.description.trim());

            payload.append(
                'field_schema',
                JSON.stringify(
                    form.field_schema.map((field) => ({
                        ...field,
                        validation: {
                            min_length:
                                field.validation?.min_length === ''
                                    ? null
                                    : Number(field.validation?.min_length || 0),
                            max_length:
                                field.validation?.max_length === ''
                                    ? null
                                    : Number(field.validation?.max_length || 0),
                        },
                        options:
                            field.type === 'select'
                                ? resolveFieldOptions(field)
                                : [],
                    }))
                )
            );
            payload.append('style_config', JSON.stringify(form.style_config));
            payload.append('submission_mapping', JSON.stringify(form.submission_mapping));
            if (logoFile) {
                payload.append('logo', logoFile);
            }

            if (editingId) {
                payload.append('_method', 'PUT');
                await axios.post(`/api/v1/lead-forms/${editingId}`, payload, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Đã cập nhật form tư vấn.');
            } else {
                await axios.post('/api/v1/lead-forms', payload, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Đã tạo form tư vấn mới.');
            }

            closeForm();
            await fetchData(listFilters.page, listFilters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể lưu cấu hình form.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (item) => {
        if (!confirm(`Xóa "${item.name}"?`)) return;
        try {
            await axios.delete(`/api/v1/lead-forms/${item.id}`);
            toast.success('Đã xóa form.');
            await fetchData(listFilters.page, listFilters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa form thất bại.');
        }
    };

    const duplicate = async (item) => {
        try {
            await axios.post(`/api/v1/lead-forms/${item.id}/duplicate`);
            toast.success(`Đã sao chép form "${item.name}".`);
            await fetchData(listFilters.page, listFilters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể sao chép form.');
        }
    };

    const listStats = useMemo(() => {
        const active = forms.filter((row) => row.is_active).length;
        const totalFields = forms.reduce(
            (sum, row) => sum + (Array.isArray(row.field_schema) && row.field_schema.length > 0 ? row.field_schema.length : 5),
            0
        );
        return [
            { label: 'Tổng form', value: String(formsMeta.total || forms.length) },
            { label: 'Đang chạy', value: String(active) },
            { label: 'Tổng trường cấu hình', value: String(totalFields) },
            { label: 'Đích nhận dữ liệu', value: 'CRM khách hàng' },
        ];
    }, [forms, formsMeta.total]);

    const mappedFields = useMemo(
        () =>
            form.field_schema.filter(
                (field) => field.map_to && field.map_to !== 'ignore'
            ),
        [form.field_schema]
    );
    const selectedResponsibleStaff = useMemo(
        () =>
            staffUsers.find(
                (user) => String(user.id) === String(form.submission_mapping.assigned_staff_id || '')
            ) || null,
        [staffUsers, form.submission_mapping.assigned_staff_id]
    );

    const resolvedLogoPreview =
        form.style_config.logo_mode === 'custom'
            ? logoPreview || form.style_config.logo_url || ''
            : form.style_config.logo_mode === 'brand'
            ? settings?.logo_url || ''
            : '';

    return (
        <PageContainer
            auth={props.auth}
            title="Form tư vấn khách hàng"
            description="Tạo form theo cách kéo-chọn dễ dùng: chọn trường, chỉnh giao diện, bật logo và nối dữ liệu thẳng vào bảng khách hàng."
            stats={listStats}
        >
            <div className="space-y-5">
                <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Danh sách form</h3>
                            <p className="mt-1 text-sm text-text-muted">
                                Mỗi form có thể cấu hình riêng trường dữ liệu, kiểu hiển thị, logo và cách đổ lead về CRM.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(4,188,92,0.18)]"
                            onClick={openCreate}
                        >
                            Tạo form mới
                        </button>
                    </div>
                </div>

                <div className="grid gap-4">
                    {forms.map((item) => {
                        const fieldsCount =
                            Array.isArray(item.field_schema) && item.field_schema.length > 0
                                ? item.field_schema.length
                                : 5;
                        const itemStyle = {
                            ...defaultStyleConfig(settings),
                            ...(item.style_config || {}),
                        };
                        return (
                            <div
                                key={item.id}
                                className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]"
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="text-xl font-semibold text-slate-900">{item.name}</h4>
                                            <span
                                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                                    item.is_active
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : 'bg-slate-100 text-slate-500'
                                                }`}
                                            >
                                                {item.is_active ? 'Đang nhận dữ liệu' : 'Đang tắt'}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-muted">
                                            <span>Slug: {item.slug}</span>
                                            <span>{fieldsCount} trường dữ liệu</span>
                                            <span>{item.department?.name || 'Chưa chọn phòng ban nhận lead'}</span>
                                            <span>{item.lead_type?.name || 'Chưa đặt trạng thái lead mặc định'}</span>
                                            <span>
                                                {item?.submission_mapping?.assigned_staff_id
                                                    ? `Phụ trách: ${
                                                          staffUsers.find((user) => String(user.id) === String(item.submission_mapping.assigned_staff_id))?.name ||
                                                          'Đã chọn nhân sự'
                                                      }`
                                                    : 'Chưa gắn nhân viên phụ trách'}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                                            <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                                <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Logo</div>
                                                <div className="mt-1 font-medium">
                                                    {itemStyle.logo_mode === 'hidden'
                                                        ? 'Ẩn logo'
                                                        : itemStyle.logo_mode === 'custom'
                                                        ? 'Logo riêng'
                                                        : 'Logo thương hiệu'}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                                <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Nền form</div>
                                                <div className="mt-1 font-medium">
                                                    {BACKGROUND_OPTIONS.find((row) => row.value === itemStyle.background_style)?.label || 'Mềm và sáng'}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                                <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Đổ dữ liệu</div>
                                                <div className="mt-1 font-medium">Bảng khách hàng CRM</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:justify-end">
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                                            onClick={() => startEdit(item)}
                                        >
                                            Thiết kế
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                                            onClick={() => window.open(`${baseUrl}/lead-forms/${item.slug}`, '_blank')}
                                        >
                                            Mở form
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                                            onClick={() => copyText(`${baseUrl}/lead-forms/${item.slug}`, 'Đã sao chép link form.')}
                                        >
                                            Sao chép link
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                                            onClick={() =>
                                                copyText(
                                                    `<iframe src="${baseUrl}/lead-forms/${item.slug}" style="width:100%;min-height:640px;border:0;border-radius:20px;"></iframe>`,
                                                    'Đã sao chép mã nhúng.'
                                                )
                                            }
                                        >
                                            Sao chép mã nhúng
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-600"
                                            onClick={() => duplicate(item)}
                                        >
                                            Sao chép form
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600"
                                            onClick={() => remove(item)}
                                        >
                                            Xóa
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {forms.length === 0 && (
                        <div className="rounded-3xl border border-dashed border-slate-200/80 bg-white px-6 py-10 text-center">
                            <h4 className="text-lg font-semibold text-slate-900">Chưa có form tư vấn nào</h4>
                            <p className="mt-2 text-sm text-text-muted">
                                Tạo form đầu tiên để thu lead từ landing page, website hoặc fanpage mà không cần đụng mã kỹ thuật.
                            </p>
                            <button
                                type="button"
                                className="mt-4 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                                onClick={openCreate}
                            >
                                Tạo form đầu tiên
                            </button>
                        </div>
                    )}
                </div>
                <PaginationControls
                    page={formsMeta.current_page}
                    lastPage={formsMeta.last_page}
                    total={formsMeta.total}
                    perPage={listFilters.per_page}
                    label="form"
                    onPageChange={(page) => fetchData(page, listFilters)}
                    onPerPageChange={(perPage) => {
                        const next = { ...listFilters, per_page: perPage, page: 1 };
                        setListFilters(next);
                        fetchData(1, next);
                    }}
                />
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Thiết kế form #${editingId}` : 'Tạo form tư vấn mới'}
                description="Mỗi tab là một bước cấu hình bằng ngôn ngữ dễ hiểu: nội dung, trường dữ liệu, giao diện, CRM và chia sẻ."
                size="xl"
            >
                <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                        {BUILDER_TABS.map((tab) => (
                            <BuilderTabButton
                                key={tab.key}
                                label={tab.label}
                                active={activeTab === tab.key}
                                onClick={() => setActiveTab(tab.key)}
                            />
                        ))}
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_380px]">
                        <div className="space-y-5">
                            {activeTab === 'basics' && (
                                <>
                                    <SectionCard
                                        title="Thông tin cơ bản của form"
                                        description="Đây là phần người nội bộ nhìn thấy khi quản lý form và cũng là tiêu đề hiển thị trên form công khai."
                                    >
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Tên form</label>
                                                <input
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    placeholder="Ví dụ: Form tư vấn SEO tổng thể"
                                                    value={form.name}
                                                    onChange={(e) =>
                                                        setForm((current) => ({
                                                            ...current,
                                                            name: e.target.value,
                                                            slug:
                                                                current.slug && current.slug !== slugify(current.name)
                                                                    ? current.slug
                                                                    : slugify(e.target.value),
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Đường dẫn form</label>
                                                <input
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    placeholder="tu-van-seo"
                                                    value={form.slug}
                                                    onChange={(e) =>
                                                        setForm((current) => ({
                                                            ...current,
                                                            slug: slugify(e.target.value),
                                                        }))
                                                    }
                                                />
                                                <p className="mt-2 text-xs text-text-muted">
                                                    Link xem form: <span className="font-semibold text-slate-700">{publicUrl}</span>
                                                </p>
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Trạng thái lead mặc định</label>
                                                <select
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    value={form.lead_type_id}
                                                    onChange={(e) => setForm((current) => ({ ...current, lead_type_id: e.target.value }))}
                                                >
                                                    <option value="">Chọn trạng thái lead</option>
                                                    {leadTypes.map((type) => (
                                                        <option key={type.id} value={type.id}>
                                                            {type.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Phòng ban nhận lead</label>
                                                <select
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    value={form.department_id}
                                                    onChange={(e) => setForm((current) => ({ ...current, department_id: e.target.value }))}
                                                >
                                                    <option value="">Chọn phòng ban</option>
                                                    {departments.map((department) => (
                                                        <option key={department.id} value={department.id}>
                                                            {department.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Mô tả ngắn trên form</label>
                                                <textarea
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    rows={3}
                                                    placeholder="Giải thích ngắn để khách biết form này dùng để làm gì."
                                                    value={form.description}
                                                    onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Link chuyển hướng sau khi gửi</label>
                                                <input
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    placeholder="https://..."
                                                    value={form.redirect_url}
                                                    onChange={(e) => setForm((current) => ({ ...current, redirect_url: e.target.value }))}
                                                />
                                                <p className="mt-2 text-xs text-text-muted">
                                                    Nếu để trống, form sẽ hiện lời cảm ơn ngay tại chỗ.
                                                </p>
                                            </div>
                                        </div>
                                    </SectionCard>

                                    <SectionCard
                                        title="Tình trạng hoạt động"
                                        description="Bật để form công khai nhận dữ liệu. Tắt để giữ cấu hình nhưng ngừng nhận lead."
                                    >
                                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                            <div>
                                                <div className="font-medium text-slate-900">Kích hoạt form</div>
                                                <div className="text-sm text-text-muted">
                                                    {form.is_active
                                                        ? 'Khách có thể điền và lead sẽ đổ vào CRM.'
                                                        : 'Form sẽ ẩn khỏi public và không nhận thêm dữ liệu.'}
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                                                checked={form.is_active}
                                                onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.checked }))}
                                            />
                                        </label>
                                    </SectionCard>
                                </>
                            )}

                            {activeTab === 'fields' && (
                                <>
                                    <SectionCard
                                        title="Thêm nhanh trường phổ biến"
                                        description="Bạn chỉ cần bấm để thêm các trường thường dùng. Sau đó chỉnh lại tên hoặc gợi ý nếu cần."
                                    >
                                        <div className="flex flex-wrap gap-2">
                                            {FIELD_PRESETS.map((preset) => (
                                                <button
                                                    key={preset.label}
                                                    type="button"
                                                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-primary/30 hover:text-primary"
                                                    onClick={() => addField(preset)}
                                                >
                                                    + {preset.label}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                className="rounded-full border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary"
                                                onClick={() => addField()}
                                            >
                                                + Trường trống
                                            </button>
                                        </div>
                                    </SectionCard>

                                    <SectionCard
                                        title="Danh sách trường trên form"
                                        description="Sắp xếp từ trên xuống dưới theo đúng thứ tự khách sẽ nhìn thấy."
                                    >
                                        <div className="space-y-4">
                                            {form.field_schema.map((field, index) => (
                                                <div
                                                    key={field.id}
                                                    className="rounded-3xl border border-slate-200/80 bg-slate-50 p-4"
                                                >
                                                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                        <div>
                                                            <div className="text-xs uppercase tracking-[0.18em] text-text-subtle">
                                                                Trường {index + 1}
                                                            </div>
                                                            <div className="mt-1 text-base font-semibold text-slate-900">
                                                                {field.label || 'Trường chưa đặt tên'}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                                                onClick={() => moveField(field.id, 'up')}
                                                            >
                                                                Đưa lên
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                                                onClick={() => moveField(field.id, 'down')}
                                                            >
                                                                Đưa xuống
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600"
                                                                onClick={() => removeField(field.id)}
                                                            >
                                                                Xóa
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="grid gap-4 md:grid-cols-2">
                                                        <div>
                                                            <label className="mb-1 block text-sm font-medium text-slate-700">Tên hiển thị</label>
                                                            <input
                                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                                value={field.label}
                                                                onChange={(e) => updateField(field.id, { label: e.target.value })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-sm font-medium text-slate-700">Loại trường</label>
                                                            <select
                                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                                value={field.type}
                                                                onChange={(e) => {
                                                                    const nextType = e.target.value;
                                                                    const nextOptionsText = nextType === 'select'
                                                                        ? resolveFieldOptionsText(field)
                                                                        : '';

                                                                    updateField(field.id, {
                                                                        type: nextType,
                                                                        options_text: nextOptionsText,
                                                                        options: nextType === 'select' ? parseSelectOptionsText(nextOptionsText) : [],
                                                                    });
                                                                }}
                                                            >
                                                                {FIELD_TYPE_OPTIONS.map((option) => (
                                                                    <option key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="mb-1 block text-sm font-medium text-slate-700">Dòng gợi ý trong ô nhập</label>
                                                            <input
                                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                                value={field.placeholder}
                                                                onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="mb-1 block text-sm font-medium text-slate-700">Ghi chú nhỏ dưới trường</label>
                                                            <input
                                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                                value={field.help_text}
                                                                onChange={(e) => updateField(field.id, { help_text: e.target.value })}
                                                                placeholder="Ví dụ: Chúng tôi sẽ chỉ dùng số này để tư vấn, không spam."
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-sm font-medium text-slate-700">Cách hiển thị</label>
                                                            <select
                                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                                value={field.width}
                                                                onChange={(e) => updateField(field.id, { width: e.target.value })}
                                                            >
                                                                {WIDTH_OPTIONS.map((option) => (
                                                                    <option key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="flex items-end">
                                                            <label className="flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                                                                <div>
                                                                    <div className="text-sm font-medium text-slate-700">Bắt buộc nhập</div>
                                                                    <div className="text-xs text-text-muted">
                                                                        Bật nếu khách phải điền trường này mới gửi được.
                                                                    </div>
                                                                </div>
                                                                <input
                                                                    type="checkbox"
                                                                    className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                                                                    checked={field.required}
                                                                    onChange={(e) => updateField(field.id, { required: e.target.checked })}
                                                                />
                                                            </label>
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-sm font-medium text-slate-700">Độ dài tối thiểu</label>
                                                            <input
                                                                type="number"
                                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                                value={field.validation?.min_length}
                                                                onChange={(e) =>
                                                                    updateFieldValidation(field.id, {
                                                                        min_length: e.target.value,
                                                                    })
                                                                }
                                                                placeholder="Để trống nếu không cần"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-sm font-medium text-slate-700">Độ dài tối đa</label>
                                                            <input
                                                                type="number"
                                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                                value={field.validation?.max_length}
                                                                onChange={(e) =>
                                                                    updateFieldValidation(field.id, {
                                                                        max_length: e.target.value,
                                                                    })
                                                                }
                                                                placeholder="Để trống nếu không cần"
                                                            />
                                                        </div>
                                                        {field.type === 'select' && (
                                                            <div className="md:col-span-2">
                                                                <label className="mb-1 block text-sm font-medium text-slate-700">Các lựa chọn</label>
                                                                <textarea
                                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                                    rows={4}
                                                                    value={resolveFieldOptionsText(field)}
                                                                    onChange={(e) =>
                                                                        updateField(field.id, {
                                                                            options_text: e.target.value,
                                                                        })
                                                                    }
                                                                    placeholder={'Mỗi dòng là một lựa chọn.\nVí dụ:\nSEO tổng thể\nBacklinks\nContent'}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </SectionCard>
                                </>
                            )}

                            {activeTab === 'style' && (
                                <>
                                    <SectionCard
                                        title="Logo trên form"
                                        description="Bạn có thể dùng logo thương hiệu chung, thay bằng logo riêng cho form, hoặc ẩn hoàn toàn."
                                    >
                                        <div className="grid gap-3 md:grid-cols-3">
                                            {LOGO_OPTIONS.map((option) => (
                                                <label
                                                    key={option.value}
                                                    className={`cursor-pointer rounded-2xl border px-4 py-3 ${
                                                        form.style_config.logo_mode === option.value
                                                            ? 'border-primary bg-primary/5'
                                                            : 'border-slate-200/80 bg-slate-50'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="logo_mode"
                                                        className="sr-only"
                                                        checked={form.style_config.logo_mode === option.value}
                                                        onChange={() => {
                                                            if (option.value !== 'custom') {
                                                                setLogoFile(null);
                                                                setLogoPreview('');
                                                            }
                                                            updateStyleConfig({ logo_mode: option.value });
                                                        }}
                                                    />
                                                    <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                                                </label>
                                            ))}
                                        </div>

                                        {form.style_config.logo_mode === 'custom' && (
                                            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                                                <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-4">
                                                    <div className="text-xs uppercase tracking-[0.18em] text-text-subtle">Xem trước logo</div>
                                                    <div className="mt-3 flex h-36 items-center justify-center rounded-2xl bg-white">
                                                        {resolvedLogoPreview ? (
                                                            <img
                                                                src={resolvedLogoPreview}
                                                                alt="Logo preview"
                                                                className="max-h-24 max-w-full object-contain"
                                                            />
                                                        ) : (
                                                            <span className="text-sm text-text-muted">Chưa có logo riêng</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="mb-1 block text-sm font-medium text-slate-700">Tải logo riêng</label>
                                                        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200/80 px-4 py-3">
                                                            <span className="text-sm text-slate-700">
                                                                {logoFile ? logoFile.name : 'Chọn ảnh logo từ máy'}
                                                            </span>
                                                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                                                Chọn file
                                                            </span>
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/*"
                                                                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                                                            />
                                                        </label>
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-sm font-medium text-slate-700">Hoặc dán link logo</label>
                                                        <input
                                                            className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                            value={form.style_config.logo_url || ''}
                                                            onChange={(e) => updateStyleConfig({ logo_url: e.target.value })}
                                                            placeholder="https://..."
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </SectionCard>

                                    <SectionCard
                                        title="Phong cách hiển thị"
                                        description="Chọn kiểu nền, độ bo góc và màu nhấn để form nhìn phù hợp với landing page hoặc fanpage."
                                    >
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700">Màu nhấn chính</label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    className="h-12 w-16 rounded-2xl border border-slate-200/80 bg-white p-1"
                                                    value={form.style_config.primary_color || '#04BC5C'}
                                                    onChange={(e) => updateStyleConfig({ primary_color: e.target.value })}
                                                />
                                                <input
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    value={form.style_config.primary_color || '#04BC5C'}
                                                    onChange={(e) => updateStyleConfig({ primary_color: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-3">
                                            {BACKGROUND_OPTIONS.map((option) => (
                                                <label
                                                    key={option.value}
                                                    className={`cursor-pointer rounded-2xl border px-4 py-3 ${
                                                        form.style_config.background_style === option.value
                                                            ? 'border-primary bg-primary/5'
                                                            : 'border-slate-200/80 bg-slate-50'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        className="sr-only"
                                                        checked={form.style_config.background_style === option.value}
                                                        onChange={() => updateStyleConfig({ background_style: option.value })}
                                                    />
                                                    <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                                                    <div className="mt-1 text-xs text-text-muted">{option.hint}</div>
                                                </label>
                                            ))}
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700">Độ bo khung form</label>
                                            <div className="grid gap-3 md:grid-cols-3">
                                                {SURFACE_OPTIONS.map((option) => (
                                                    <label
                                                        key={option.value}
                                                        className={`cursor-pointer rounded-2xl border px-4 py-3 ${
                                                            form.style_config.surface_style === option.value
                                                                ? 'border-primary bg-primary/5'
                                                                : 'border-slate-200/80 bg-slate-50'
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            className="sr-only"
                                                            checked={form.style_config.surface_style === option.value}
                                                            onChange={() => updateStyleConfig({ surface_style: option.value })}
                                                        />
                                                        <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </SectionCard>

                                    <SectionCard
                                        title="Nút gửi và lời cảm ơn"
                                        description="Đây là nội dung khách sẽ thấy khi bấm gửi thành công."
                                    >
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Nhãn nút gửi</label>
                                                <input
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    value={form.style_config.submit_label}
                                                    onChange={(e) => updateStyleConfig({ submit_label: e.target.value })}
                                                    placeholder="Ví dụ: Nhận tư vấn ngay"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Lời cảm ơn sau khi gửi</label>
                                                <textarea
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    rows={3}
                                                    value={form.style_config.success_message}
                                                    onChange={(e) => updateStyleConfig({ success_message: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </SectionCard>

                                    <SectionCard
                                        title="Viền khung form"
                                        description="Tùy chọn xem form có viền bao quanh hay không. Mặc định không có viền để dễ nhúng vào landing page."
                                    >
                                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                            <div>
                                                <div className="font-medium text-slate-900">Hiển thị viền + bóng khung form</div>
                                                <div className="text-sm text-text-muted">
                                                    {form.style_config.show_card_border
                                                        ? 'Form có viền và bóng đổ bao quanh.'
                                                        : 'Form không có viền, hòa liền vào nền trang nhúng.'}
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                                                checked={form.style_config.show_card_border || false}
                                                onChange={(e) => updateStyleConfig({ show_card_border: e.target.checked })}
                                            />
                                        </label>
                                    </SectionCard>

                                    <SectionCard
                                        title="Tùy chỉnh CSS / JavaScript"
                                        description="Dán code CSS hoặc JavaScript riêng để tùy biến đổi giao diện form theo ý muốn."
                                    >
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-700">Custom CSS</label>
                                            <textarea
                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3 font-mono text-sm"
                                                rows={5}
                                                placeholder={".card { background: #fff; }\nbutton { border-radius: 8px; }"}
                                                value={form.style_config.custom_css || ''}
                                                onChange={(e) => updateStyleConfig({ custom_css: e.target.value })}
                                            />
                                            <p className="mt-1 text-xs text-text-muted">Sẽ được inject vào cuối trang form công khai dưới dạng {'<style>'}.</p>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-700">Custom JavaScript</label>
                                            <textarea
                                                className="w-full rounded-2xl border border-slate-200/80 px-4 py-3 font-mono text-sm"
                                                rows={5}
                                                placeholder="console.log('Form loaded');"
                                                value={form.style_config.custom_js || ''}
                                                onChange={(e) => updateStyleConfig({ custom_js: e.target.value })}
                                            />
                                            <p className="mt-1 text-xs text-text-muted">Sẽ được inject vào cuối trang form công khai dưới dạng {'<script>'}.</p>
                                        </div>
                                    </SectionCard>
                                </>
                            )}

                            {activeTab === 'crm' && (
                                <>
                                    <SectionCard
                                        title="Người sẽ phụ trách khách hàng mới"
                                        description="Khi khách để lại thông tin từ form này, hệ thống sẽ tự gắn khách cho nhân viên phụ trách và bắn thông báo cho người đó cùng toàn bộ admin."
                                    >
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                                <label className="mb-1 block text-sm font-medium text-slate-700">Nhân viên phụ trách lead từ form</label>
                                                <select
                                                    className="w-full rounded-2xl border border-slate-200/80 px-4 py-3"
                                                    value={form.submission_mapping.assigned_staff_id || ''}
                                                    onChange={(e) =>
                                                        updateSubmissionMapping({
                                                            assigned_staff_id: e.target.value || null,
                                                        })
                                                    }
                                                >
                                                    <option value="">-- Chưa chọn, chỉ gắn theo phòng ban --</option>
                                                    {staffUsers.map((user) => (
                                                        <option key={user.id} value={user.id}>
                                                            {user.name}{user.email ? ` • ${user.email}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                                <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Tóm tắt xử lý lead</div>
                                                <div className="mt-2 text-sm text-slate-700">
                                                    {selectedResponsibleStaff ? (
                                                        <>
                                                            Khách mới sẽ giao cho <span className="font-semibold text-slate-900">{selectedResponsibleStaff.name}</span> phụ trách.
                                                            Hệ thống đồng thời gửi push cho người này và tất cả admin.
                                                        </>
                                                    ) : (
                                                        <>
                                                            Khách mới sẽ vẫn đổ về CRM theo phòng ban đã chọn. Nếu muốn giao đúng 1 người phụ trách ngay từ đầu, hãy chọn nhân viên ở bên trái.
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </SectionCard>

                                    <SectionCard
                                        title="Đổ dữ liệu từ form vào bảng khách hàng"
                                        description="Chọn từng trường của form sẽ được nối vào cột nào trong CRM. Những trường chưa nối vẫn có thể tự động ghi vào phần ghi chú."
                                        footer={
                                            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900">
                                                        Ghi các trường chưa nối vào phần ghi chú khách hàng
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        Bật mục này để không bị mất dữ liệu dù trường đó chưa nối trực tiếp vào cột CRM.
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                                                    checked={form.submission_mapping.append_unmapped_to_notes}
                                                    onChange={(e) =>
                                                        updateSubmissionMapping({
                                                            append_unmapped_to_notes: e.target.checked,
                                                        })
                                                    }
                                                />
                                            </label>
                                        }
                                    >
                                        <div className="rounded-2xl border border-slate-200/80 overflow-hidden">
                                            <div className="grid grid-cols-[minmax(0,1fr)_220px] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                                <div>Trường trên form</div>
                                                <div>Đổ vào CRM</div>
                                            </div>
                                            {form.field_schema.map((field) => (
                                                <div
                                                    key={field.id}
                                                    className="grid grid-cols-[minmax(0,1fr)_220px] items-center gap-4 border-t border-slate-200/80 px-4 py-3"
                                                >
                                                    <div>
                                                        <div className="font-semibold text-slate-900">{field.label}</div>
                                                        <div className="mt-1 text-xs text-text-muted">
                                                            {FIELD_TYPE_OPTIONS.find((option) => option.value === field.type)?.label || 'Trường nhập liệu'}
                                                        </div>
                                                    </div>
                                                    <select
                                                        className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                                        value={field.map_to}
                                                        onChange={(e) => updateField(field.id, { map_to: e.target.value })}
                                                    >
                                                        {CRM_FIELD_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </SectionCard>

                                    <SectionCard
                                        title="Tóm tắt đường đi của dữ liệu"
                                        description="Phần này giúp người vận hành nhìn nhanh xem form đã nối đúng sang bảng khách hàng hay chưa."
                                    >
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                                <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Đích nhận</div>
                                                <div className="mt-1 text-base font-semibold text-slate-900">Bảng khách hàng CRM</div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                                <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Số trường đã nối</div>
                                                <div className="mt-1 text-base font-semibold text-slate-900">{mappedFields.length} / {form.field_schema.length}</div>
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white px-4 py-4">
                                            {mappedFields.length > 0 ? (
                                                <div className="space-y-2">
                                                    {mappedFields.map((field) => (
                                                        <div key={field.id} className="flex items-center justify-between gap-3 text-sm">
                                                            <span className="font-medium text-slate-700">{field.label}</span>
                                                            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                                                {CRM_FIELD_OPTIONS.find((option) => option.value === field.map_to)?.label}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-text-muted">
                                                    Chưa có trường nào được nối. Form vẫn nhận dữ liệu, nhưng bạn nên nối ít nhất tên hoặc số điện thoại để CRM dễ xử lý.
                                                </p>
                                            )}
                                        </div>
                                    </SectionCard>
                                </>
                            )}

                            {activeTab === 'share' && (
                                <>
                                    <SectionCard
                                        title="Dùng link trực tiếp"
                                        description="Dán link này vào landing page, nút CTA hoặc gửi thẳng cho khách."
                                        footer={
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                                                    onClick={() => copyText(publicUrl, 'Đã sao chép link form.')}
                                                >
                                                    Sao chép link
                                                </button>
                                                <button
                                                    type="button"
                                                    className="rounded-2xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                                                    onClick={() => window.open(publicUrl, '_blank')}
                                                >
                                                    Mở form
                                                </button>
                                            </div>
                                        }
                                    >
                                        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 break-all">{publicUrl}</div>
                                    </SectionCard>

                                    <SectionCard
                                        title="Nhúng vào website bằng iframe"
                                        description="Nếu đội kỹ thuật cần nhúng vào landing page, chỉ cần sao chép đoạn bên dưới."
                                    >
                                        <textarea
                                            className="w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                                            rows={5}
                                            readOnly
                                            value={iframeCode}
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                                                onClick={() => copyText(iframeCode, 'Đã sao chép mã nhúng.')}
                                            >
                                                Sao chép mã nhúng
                                            </button>
                                        </div>
                                    </SectionCard>
                                </>
                            )}
                        </div>

                        <div className="space-y-5">
                            <SectionCard
                                title="Xem trước form"
                                description="Bản xem này thay đổi ngay khi bạn chỉnh ở bên trái, để dễ hình dung trải nghiệm khách hàng."
                            >
                                <FormPreview
                                    form={form}
                                    settings={settings}
                                    logoPreview={resolvedLogoPreview}
                                />
                            </SectionCard>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-4 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm text-text-muted">
                            Form này sẽ đổ lead vào bảng khách hàng CRM và nhận phòng ban/trạng thái mặc định theo cấu hình bạn chọn.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                                onClick={closeForm}
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(4,188,92,0.18)]"
                                onClick={save}
                                disabled={saving}
                            >
                                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật form' : 'Tạo form'}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
