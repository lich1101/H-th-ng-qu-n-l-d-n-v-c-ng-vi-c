import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const TABS = [
    { key: 'branding', label: 'Thương hiệu' },
    { key: 'contact', label: 'Liên hệ & pháp lý' },
    { key: 'chatbot', label: 'AI Chatbot' },
    { key: 'notifications', label: 'Thông báo thiết bị' },
    { key: 'diagnostics', label: 'Kết nối & thiết bị' },
    { key: 'mobile_devices', label: 'Thiết bị di động người dùng' },
];

const DEFAULT_GEMINI_MODEL_OPTIONS = [
    { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', name: 'gemini-2.0-flash-lite', display_name: 'Gemini 2.0 Flash Lite' },
    { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'gemini-1.5-flash', display_name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b', name: 'gemini-1.5-flash-8b', display_name: 'Gemini 1.5 Flash 8B' },
];

const initialSettings = (settings) => ({
    brand_name: settings?.brand_name || '',
    primary_color: settings?.primary_color || '#04BC5C',
    logo_url: settings?.logo_url || '',
    support_email: settings?.support_email || '',
    support_phone: settings?.support_phone || '',
    support_address: settings?.support_address || '',
    notifications_push_enabled: settings?.notifications_push_enabled ?? true,
    notifications_in_app_enabled: settings?.notifications_in_app_enabled ?? true,
    notifications_email_fallback_enabled: settings?.notifications_email_fallback_enabled ?? true,
    meeting_reminder_enabled: settings?.meeting_reminder_enabled ?? true,
    notifications_dedupe_seconds: settings?.notifications_dedupe_seconds ?? 45,
    meeting_reminder_minutes_before: settings?.meeting_reminder_minutes_before ?? 60,
    task_item_progress_reminder_enabled: settings?.task_item_progress_reminder_enabled ?? true,
    task_item_progress_reminder_time: settings?.task_item_progress_reminder_time || '09:00',
    task_item_update_submission_notification_enabled:
        settings?.task_item_update_submission_notification_enabled ?? true,
    task_item_update_feedback_notification_enabled:
        settings?.task_item_update_feedback_notification_enabled ?? true,
    lead_capture_notification_enabled: settings?.lead_capture_notification_enabled ?? true,
    contract_unpaid_reminder_enabled: settings?.contract_unpaid_reminder_enabled ?? true,
    contract_unpaid_reminder_time: settings?.contract_unpaid_reminder_time || '08:00',
    contract_expiry_reminder_enabled: settings?.contract_expiry_reminder_enabled ?? true,
    contract_expiry_reminder_time: settings?.contract_expiry_reminder_time || '09:00',
    contract_expiry_reminder_days_before: settings?.contract_expiry_reminder_days_before ?? 3,
    project_handover_min_progress_percent: settings?.project_handover_min_progress_percent ?? 90,
    smtp_custom_enabled: settings?.smtp_custom_enabled ?? false,
    smtp_mailer: settings?.smtp_mailer || 'smtp',
    smtp_host: settings?.smtp_host || '',
    smtp_port: settings?.smtp_port ?? 587,
    smtp_encryption: settings?.smtp_encryption || 'tls',
    smtp_username: settings?.smtp_username || '',
    smtp_password: settings?.smtp_password || '',
    smtp_from_address: settings?.smtp_from_address || '',
    smtp_from_name: settings?.smtp_from_name || '',
    chatbot_enabled: settings?.chatbot_enabled ?? false,
    chatbot_provider: settings?.chatbot_provider || 'gemini',
    chatbot_model: settings?.chatbot_model || 'gemini-2.0-flash',
    chatbot_api_key: settings?.chatbot_api_key || '',
    chatbot_system_message_markdown: settings?.chatbot_system_message_markdown || '',
    chatbot_history_pairs: settings?.chatbot_history_pairs ?? 8,
});

const initialBotForm = (bot = null) => ({
    name: bot?.name || '',
    description: bot?.description || '',
    provider: bot?.provider || 'gemini',
    model: bot?.model || 'gemini-2.0-flash',
    api_key: bot?.api_key || '',
    history_pairs: bot?.history_pairs ?? 8,
    accent_color: bot?.accent_color || '#6366F1',
    icon: bot?.icon || '🤖',
    sort_order: bot?.sort_order ?? 0,
    is_active: bot?.is_active ?? true,
    is_default: bot?.is_default ?? false,
    system_message_markdown: bot?.system_message_markdown || '',
});

function ToggleSwitch({ checked, onChange, label, description = '' }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
                checked
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-slate-200/80 bg-white hover:bg-slate-50'
            }`}
        >
            <div className="min-w-0">
                <div className={`text-sm font-semibold ${checked ? 'text-primary' : 'text-slate-900'}`}>{label}</div>
                {description ? <div className="mt-1 text-xs text-text-muted">{description}</div> : null}
            </div>
            <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    checked ? 'bg-primary' : 'bg-slate-300'
                }`}
            >
                <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-1 ring-black/5 transition ${
                        checked ? 'translate-x-5' : 'translate-x-1'
                    }`}
                />
            </span>
        </button>
    );
}

function NotificationCard({
    title,
    subtitle,
    enabled,
    onToggle,
    audience,
    message,
    children,
    showToggle = true,
}) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
                </div>
                {showToggle ? (
                    <div className="w-full max-w-[280px] lg:w-auto">
                        <ToggleSwitch
                            checked={enabled}
                            onChange={onToggle}
                            label={enabled ? 'Đang bật' : 'Đang tắt'}
                            description={enabled ? 'Thông báo này đang hoạt động theo cấu hình bên dưới.' : 'Thông báo này sẽ không được gửi khi đang tắt.'}
                        />
                    </div>
                ) : (
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                        Cấu hình nghiệp vụ
                    </div>
                )}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Gửi cho ai</div>
                    <div className="mt-1 text-sm text-slate-700">{audience}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Nội dung thông báo</div>
                    <div className="mt-1 text-sm text-slate-700">{message}</div>
                </div>
            </div>

            {children ? <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div> : null}
        </div>
    );
}

export default function SystemSettings(props) {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState('branding');
    const [loading, setLoading] = useState(false);
    const [baseSettings, setBaseSettings] = useState(initialSettings(props.settings));
    const [form, setForm] = useState(initialSettings(props.settings));
    const [logoFile, setLogoFile] = useState(null);
    const [preview, setPreview] = useState(props.settings?.logo_url || '');
    const [showPreview, setShowPreview] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [botLoading, setBotLoading] = useState(false);
    const [botSaving, setBotSaving] = useState(false);
    const [botDeletingId, setBotDeletingId] = useState(null);
    const [botRows, setBotRows] = useState([]);
    const [editingBotId, setEditingBotId] = useState(null);
    const [botForm, setBotForm] = useState(initialBotForm());
    const [modelLoading, setModelLoading] = useState(false);
    const [modelOptions, setModelOptions] = useState(DEFAULT_GEMINI_MODEL_OPTIONS);
    const [modelError, setModelError] = useState('');
    const [systemStatus, setSystemStatus] = useState(null);
    const [deviceLoading, setDeviceLoading] = useState(false);
    const [deviceRows, setDeviceRows] = useState([]);
    const [deviceMeta, setDeviceMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [deviceFilters, setDeviceFilters] = useState({
        search: '',
        platform: '',
        apns_environment: '',
        notifications_enabled: '',
    });
    const [users, setUsers] = useState([]);
    const [testingPush, setTestingPush] = useState(false);
    const [lastTestResult, setLastTestResult] = useState(null);
    const [testForm, setTestForm] = useState({
        user_id: '',
        title: 'Test thông báo',
        body: 'Kiểm tra gửi push từ trang cài đặt.',
    });

    const applyPrimary = (hex) => {
        if (!hex) return;
        const cleaned = String(hex).replace('#', '').trim();
        if (cleaned.length !== 6) return;
        const r = parseInt(cleaned.substring(0, 2), 16);
        const g = parseInt(cleaned.substring(2, 4), 16);
        const b = parseInt(cleaned.substring(4, 6), 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return;
        document.documentElement.style.setProperty('--color-primary', `${r} ${g} ${b}`);
    };

    const reloadSystemStatus = async () => {
        setStatusLoading(true);
        try {
            const res = await axios.get('/api/v1/system/status');
            setSystemStatus(res.data || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được cấu hình thông báo hệ thống.');
        } finally {
            setStatusLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/v1/users/lookup');
            const rows = res.data?.data || [];
            setUsers(rows);
            if (!testForm.user_id && rows.length > 0) {
                setTestForm((s) => ({ ...s, user_id: String(rows[0].id) }));
            }
        } catch {
            // ignore user lookup failures
        }
    };

    const loadAdminSettings = async () => {
        setSettingsLoading(true);
        try {
            const res = await axios.get('/api/v1/settings/admin');
            const next = initialSettings(res.data || {});
            setBaseSettings(next);
            setForm(next);
            setPreview(res.data?.logo_url || '');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được cấu hình hệ thống chi tiết.');
        } finally {
            setSettingsLoading(false);
        }
    };

    const applyBotRows = (rows, preferredId = null) => {
        const list = Array.isArray(rows) ? rows : [];
        setBotRows(list);
        if (list.length === 0) {
            setEditingBotId(null);
            setBotForm(initialBotForm());
            setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
            setModelError('');
            return;
        }

        const preferred = preferredId
            ? list.find((bot) => Number(bot.id) === Number(preferredId))
            : null;
        const current = editingBotId
            ? list.find((bot) => Number(bot.id) === Number(editingBotId))
            : null;
        const selected = preferred || current || list.find((bot) => bot.is_default) || list[0];

        const selectedForm = initialBotForm(selected);
        setEditingBotId(Number(selected.id));
        setBotForm(selectedForm);
        setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
        setModelError('');
    };

    const loadGeminiModels = async ({
        apiKey = null,
        provider = null,
        currentModel = null,
        silent = false,
        showError = true,
    } = {}) => {
        const resolvedProvider = String(provider || botForm.provider || 'gemini').trim() || 'gemini';
        const resolvedKey = String(apiKey ?? botForm.api_key ?? '').trim();
        const resolvedModel = String(currentModel ?? botForm.model ?? '').trim();

        if (resolvedProvider !== 'gemini') {
            setModelOptions([]);
            setModelError('Provider hiện tại chưa hỗ trợ lấy model tự động.');
            return;
        }

        if (resolvedKey === '') {
            setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
            setModelError('');
            if (showError) {
                toast.error('Vui lòng nhập Gemini API key trước khi tải model.');
            }
            return;
        }

        if (!silent) setModelLoading(true);
        try {
            const res = await axios.post('/api/v1/chatbot/models', {
                provider: resolvedProvider,
                api_key: resolvedKey,
            });

            const rows = Array.isArray(res.data?.models) ? res.data.models : [];
            setModelOptions(rows);
            setModelError('');

            const hasResolvedModel = rows.some((item) => String(item.name || item.id || '').trim() === resolvedModel);
            if (rows.length > 0 && (!resolvedModel || !hasResolvedModel)) {
                const firstModelName = String(rows[0].name || '').trim();
                if (firstModelName) {
                    setBotForm((s) => ({ ...s, model: firstModelName }));
                }
            }

            if (rows.length === 0 && showError) {
                toast.error('Key hợp lệ nhưng chưa tìm thấy model hỗ trợ generateContent.');
            }
        } catch (e) {
            setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
            const message = e?.response?.data?.message || 'Không tải được danh sách model từ Gemini API.';
            setModelError(message);
            if (showError) {
                toast.error(message);
            }
        } finally {
            if (!silent) setModelLoading(false);
        }
    };

    const loadChatbotBots = async ({ preferredId = null, silent = false } = {}) => {
        if (!silent) setBotLoading(true);
        try {
            const res = await axios.get('/api/v1/chatbot/bots/manage');
            applyBotRows(res.data?.bots || [], preferredId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách chatbot.');
        } finally {
            if (!silent) setBotLoading(false);
        }
    };

    const fetchDevices = async (page = 1, nextFilters = deviceFilters) => {
        setDeviceLoading(true);
        try {
            const res = await axios.get('/api/v1/device-tokens', {
                params: {
                    page,
                    per_page: 20,
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.platform ? { platform: nextFilters.platform } : {}),
                    ...(nextFilters.apns_environment ? { apns_environment: nextFilters.apns_environment } : {}),
                    ...(nextFilters.notifications_enabled !== '' ? { notifications_enabled: nextFilters.notifications_enabled } : {}),
                },
            });
            setDeviceRows(res.data?.data || []);
            setDeviceMeta({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách thiết bị mobile.');
        } finally {
            setDeviceLoading(false);
        }
    };

    const startCreateBot = () => {
        setEditingBotId(null);
        setBotForm(initialBotForm());
        setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
        setModelError('');
    };

    const selectBot = (bot) => {
        const selectedForm = initialBotForm(bot);
        setEditingBotId(Number(bot.id));
        setBotForm(selectedForm);
        setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
        setModelError('');
    };

    const saveBot = async () => {
        if (!botForm.name.trim()) {
            toast.error('Vui lòng nhập tên chatbot.');
            return;
        }
        if (!botForm.model.trim()) {
            toast.error('Vui lòng nhập model Gemini.');
            return;
        }

        setBotSaving(true);
        try {
            const payload = {
                name: botForm.name.trim(),
                description: botForm.description?.trim() || null,
                provider: botForm.provider || 'gemini',
                model: botForm.model.trim(),
                api_key: botForm.api_key || '',
                history_pairs: Number(botForm.history_pairs || 8),
                accent_color: botForm.accent_color || '#6366F1',
                icon: botForm.icon || '🤖',
                sort_order: Number(botForm.sort_order || 0),
                is_active: !!botForm.is_active,
                is_default: !!botForm.is_default,
                system_message_markdown: botForm.system_message_markdown || '',
            };

            let res;
            if (editingBotId) {
                res = await axios.put(`/api/v1/chatbot/bots/${editingBotId}`, payload);
            } else {
                res = await axios.post('/api/v1/chatbot/bots', payload);
            }

            const savedBotId = res.data?.bot?.id || editingBotId;
            applyBotRows(res.data?.bots || [], savedBotId);

            if (savedBotId) {
                const selected = (res.data?.bots || []).find((row) => Number(row.id) === Number(savedBotId));
                if (selected) {
                    setForm((s) => ({
                        ...s,
                        chatbot_provider: selected.provider || s.chatbot_provider,
                        chatbot_model: selected.model || s.chatbot_model,
                        chatbot_api_key: selected.api_key || '',
                        chatbot_system_message_markdown: selected.system_message_markdown || '',
                        chatbot_history_pairs: Number(selected.history_pairs || 8),
                    }));
                }
            }

            toast.success(editingBotId ? 'Đã cập nhật chatbot.' : 'Đã tạo chatbot mới.');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không lưu được chatbot.');
        } finally {
            setBotSaving(false);
        }
    };

    const deleteBot = async (botId) => {
        if (!botId) return;
        if (!window.confirm('Xoá chatbot này? Lịch sử hội thoại gắn với bot sẽ bị xóa theo.')) return;

        setBotDeletingId(botId);
        try {
            const res = await axios.delete(`/api/v1/chatbot/bots/${botId}`);
            applyBotRows(res.data?.bots || []);
            toast.success('Đã xoá chatbot.');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không xoá được chatbot.');
        } finally {
            setBotDeletingId(null);
        }
    };

    useEffect(() => {
        if (!logoFile) return undefined;
        const url = URL.createObjectURL(logoFile);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [logoFile]);

    useEffect(() => {
        const next = initialSettings(props.settings);
        setBaseSettings(next);
        setForm(next);
        setPreview(props.settings?.logo_url || '');
    }, [props.settings]);

    useEffect(() => {
        reloadSystemStatus();
        fetchUsers();
        loadAdminSettings();
        loadChatbotBots();
        fetchDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (activeTab !== 'chatbot') return undefined;

        const provider = String(botForm.provider || 'gemini').trim() || 'gemini';
        const apiKey = String(botForm.api_key || '').trim();

        if (provider !== 'gemini') {
            setModelOptions([]);
            setModelError('Provider hiện tại chưa hỗ trợ lấy model tự động.');
            return undefined;
        }

        if (apiKey === '') {
            setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
            setModelError('');
            return undefined;
        }

        const timer = setTimeout(() => {
            void loadGeminiModels({
                apiKey,
                provider,
                currentModel: botForm.model,
                silent: true,
                showError: false,
            });
        }, 550);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, botForm.api_key, botForm.provider]);

    const save = async () => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('brand_name', form.brand_name || '');
            formData.append('primary_color', form.primary_color || '#04BC5C');
            if (form.logo_url) {
                formData.append('logo_url', form.logo_url);
            }
            if (form.support_email) {
                formData.append('support_email', form.support_email);
            }
            if (form.support_phone) {
                formData.append('support_phone', form.support_phone);
            }
            if (form.support_address) {
                formData.append('support_address', form.support_address);
            }
            formData.append('notifications_push_enabled', form.notifications_push_enabled ? '1' : '0');
            formData.append('notifications_in_app_enabled', form.notifications_in_app_enabled ? '1' : '0');
            formData.append('notifications_email_fallback_enabled', form.notifications_email_fallback_enabled ? '1' : '0');
            formData.append('meeting_reminder_enabled', form.meeting_reminder_enabled ? '1' : '0');
            formData.append('notifications_dedupe_seconds', String(form.notifications_dedupe_seconds ?? 45));
            formData.append('meeting_reminder_minutes_before', String(form.meeting_reminder_minutes_before ?? 60));
            formData.append('task_item_progress_reminder_enabled', form.task_item_progress_reminder_enabled ? '1' : '0');
            formData.append('task_item_progress_reminder_time', form.task_item_progress_reminder_time || '09:00');
            formData.append(
                'task_item_update_submission_notification_enabled',
                form.task_item_update_submission_notification_enabled ? '1' : '0'
            );
            formData.append(
                'task_item_update_feedback_notification_enabled',
                form.task_item_update_feedback_notification_enabled ? '1' : '0'
            );
            formData.append('lead_capture_notification_enabled', form.lead_capture_notification_enabled ? '1' : '0');
            formData.append('contract_unpaid_reminder_enabled', form.contract_unpaid_reminder_enabled ? '1' : '0');
            formData.append('contract_unpaid_reminder_time', form.contract_unpaid_reminder_time || '08:00');
            formData.append('contract_expiry_reminder_enabled', form.contract_expiry_reminder_enabled ? '1' : '0');
            formData.append('contract_expiry_reminder_time', form.contract_expiry_reminder_time || '09:00');
            formData.append('contract_expiry_reminder_days_before', String(form.contract_expiry_reminder_days_before ?? 3));
            formData.append('project_handover_min_progress_percent', String(form.project_handover_min_progress_percent ?? 90));
            formData.append('smtp_custom_enabled', form.smtp_custom_enabled ? '1' : '0');
            formData.append('smtp_mailer', form.smtp_mailer || 'smtp');
            formData.append('smtp_host', form.smtp_host || '');
            formData.append('smtp_port', String(form.smtp_port ?? 587));
            formData.append('smtp_encryption', form.smtp_encryption || 'none');
            formData.append('smtp_username', form.smtp_username || '');
            formData.append('smtp_password', form.smtp_password || '');
            formData.append('smtp_from_address', form.smtp_from_address || '');
            formData.append('smtp_from_name', form.smtp_from_name || '');
            formData.append('chatbot_enabled', form.chatbot_enabled ? '1' : '0');
            formData.append('chatbot_provider', form.chatbot_provider || 'gemini');
            formData.append('chatbot_model', form.chatbot_model || '');
            formData.append('chatbot_api_key', form.chatbot_api_key || '');
            formData.append('chatbot_system_message_markdown', form.chatbot_system_message_markdown || '');
            formData.append('chatbot_history_pairs', String(form.chatbot_history_pairs ?? 8));
            if (logoFile) {
                formData.append('logo', logoFile);
            }

            const res = await axios.post('/api/v1/settings', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const data = res.data || {};
            const next = initialSettings(data);
            setBaseSettings(next);
            setForm(next);
            if (data.primary_color) applyPrimary(data.primary_color);
            if (data.logo_url) setPreview(data.logo_url);
            setLogoFile(null);
            toast.success('Đã cập nhật cài đặt hệ thống.');
            await reloadSystemStatus();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Cập nhật thất bại.');
        } finally {
            setLoading(false);
        }
    };

    const toPushErrorLabel = (reason) => {
        const key = String(reason || '').trim();
        if (!key) return 'push_failed';
        const map = {
            no_device_tokens: 'không có token thiết bị',
            firebase_disabled: 'firebase chưa cấu hình',
            firebase_access_token_unavailable: 'không lấy được access token firebase',
            push_channel_disabled: 'kênh push đang tắt',
            notification_disabled: 'người dùng đã tắt thông báo',
            category_disabled_system: 'đã tắt thông báo hệ thống',
            category_disabled_crm_realtime: 'đã tắt thông báo CRM realtime',
            duplicate_suppressed: 'thông báo trùng (bị chặn)',
            push_failed: 'gửi push thất bại',
        };
        return map[key] || key;
    };

    const submitPushTest = async () => {
        setTestingPush(true);
        try {
            const payload = {
                user_id: testForm.user_id ? Number(testForm.user_id) : undefined,
                title: testForm.title || 'Test thông báo',
                body: testForm.body || 'Kiểm tra gửi push từ hệ thống.',
            };
            const res = await axios.post('/api/v1/push/test', payload);
            const result = res.data || {};
            setLastTestResult(result);
            if (result.push_sent) {
                toast.success(`Đã gửi push tới ${result.target_user_name || 'tài khoản đích'}.`);
            } else {
                if (result?.message) {
                    toast.error(`Push test lỗi: ${result.message}`);
                    await reloadSystemStatus();
                    return;
                }
                const reason = result?.push_result?.error || result.error || 'push_failed';
                const hasUnauthenticatedError = Boolean(
                    result?.push_result?.errors &&
                    Object.values(result.push_result.errors).some((info) => String(info?.status || '').toUpperCase() === 'UNAUTHENTICATED')
                );
                if ((result?.token_count ?? 0) <= 0) {
                    toast.error('Tài khoản đích chưa có token thiết bị mobile. Hãy đăng nhập app và đồng bộ token.');
                } else if (hasUnauthenticatedError) {
                    toast.error('Firebase đang trả UNAUTHENTICATED (401). Kiểm tra lại FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY và xóa cache cấu hình.');
                } else {
                    toast.error(`Không gửi được push (${toPushErrorLabel(reason)}). Kiểm tra token/config bên dưới.`);
                }
            }
            await reloadSystemStatus();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi push test thất bại.');
        } finally {
            setTestingPush(false);
        }
    };

    const configRows = useMemo(() => {
        const rows = [];
        const firebase = systemStatus?.firebase || {};
        const pushTokens = systemStatus?.push_tokens || {};
        const notificationConfig = systemStatus?.notification_config || {};

        rows.push({ key: 'Firebase enabled', value: firebase.enabled ? 'Bật' : 'Tắt' });
        rows.push({ key: 'Firebase DB realtime', value: firebase.database_enabled ? 'Sẵn sàng' : 'Chưa cấu hình' });
        rows.push({ key: 'Firebase access token', value: firebase.access_token ? 'OK' : 'Chưa sẵn sàng' });
        rows.push({ key: 'Firebase project', value: firebase.project_id || '—' });
        rows.push({ key: 'Push channel', value: notificationConfig?.channels?.push_enabled ? 'Bật' : 'Tắt' });
        rows.push({ key: 'In-app channel', value: notificationConfig?.channels?.in_app_enabled ? 'Bật' : 'Tắt' });
        rows.push({ key: 'Email fallback', value: notificationConfig?.channels?.email_fallback_enabled ? 'Bật' : 'Tắt' });
        rows.push({ key: 'Dedupe seconds', value: String(notificationConfig?.dedupe_seconds ?? form.notifications_dedupe_seconds ?? 45) });
        rows.push({
            key: 'Meeting reminder',
            value: notificationConfig?.meeting_reminder_enabled
                ? `${notificationConfig?.meeting_reminder_minutes_before ?? form.meeting_reminder_minutes_before ?? 60} phút trước giờ họp`
                : 'Tắt',
        });
        rows.push({
            key: 'Task item late reminder',
            value: notificationConfig?.task_item_progress_reminder_enabled
                ? `Bật lúc ${notificationConfig?.task_item_progress_reminder_time ?? form.task_item_progress_reminder_time ?? '09:00'}`
                : 'Tắt',
        });
        rows.push({
            key: 'Phiếu duyệt đầu việc mới',
            value: notificationConfig?.task_item_update_submission_notification_enabled ? 'Bật' : 'Tắt',
        });
        rows.push({
            key: 'Phản hồi phiếu duyệt đầu việc',
            value: notificationConfig?.task_item_update_feedback_notification_enabled ? 'Bật' : 'Tắt',
        });
        rows.push({ key: 'Lead mới -> push phụ trách/admin', value: notificationConfig?.lead_capture_notification_enabled ? 'Bật' : 'Tắt' });
        rows.push({ key: 'Nhắc công nợ hợp đồng', value: notificationConfig?.contract_unpaid_reminder_enabled ? `${notificationConfig?.contract_unpaid_reminder_time || '08:00'} mỗi ngày` : 'Tắt' });
        rows.push({ key: 'Nhắc hết hạn hợp đồng', value: notificationConfig?.contract_expiry_reminder_enabled ? `${notificationConfig?.contract_expiry_reminder_time || '09:00'} mỗi ngày, trước ${notificationConfig?.contract_expiry_reminder_days_before ?? 3} ngày` : 'Tắt' });
        rows.push({ key: 'Ngưỡng gửi duyệt bàn giao', value: `${notificationConfig?.project_handover_min_progress_percent ?? form.project_handover_min_progress_percent ?? 90}%` });
        rows.push({ key: 'AI chatbot enabled', value: form.chatbot_enabled ? 'Bật' : 'Tắt' });
        rows.push({ key: 'AI chatbot total bots', value: String(botRows.length) });
        rows.push({ key: 'AI chatbot provider', value: form.chatbot_provider || 'gemini' });
        rows.push({ key: 'AI chatbot model', value: form.chatbot_model || '—' });
        rows.push({ key: 'AI chatbot history pairs', value: String(form.chatbot_history_pairs ?? 8) });
        rows.push({ key: 'AI chatbot key configured', value: form.chatbot_api_key ? 'Có' : 'Chưa' });
        rows.push({ key: 'Mail configured', value: notificationConfig?.mail_configured ? 'Có' : 'Chưa' });
        rows.push({ key: 'Device tokens total', value: String(pushTokens.total ?? 0) });
        rows.push({ key: 'Tokens iOS', value: String(pushTokens?.by_platform?.ios ?? 0) });
        rows.push({ key: 'Tokens Android', value: String(pushTokens?.by_platform?.android ?? 0) });
        rows.push({ key: 'Tokens Web', value: String(pushTokens?.by_platform?.web ?? 0) });
        rows.push({ key: 'Permission ON (device)', value: String(pushTokens?.permissions?.enabled_total ?? 0) });
        rows.push({ key: 'Permission OFF (device)', value: String(pushTokens?.permissions?.disabled_total ?? 0) });
        rows.push({ key: 'Android permission ON', value: String(pushTokens?.permissions?.by_platform?.android?.enabled ?? 0) });
        rows.push({ key: 'Android permission OFF', value: String(pushTokens?.permissions?.by_platform?.android?.disabled ?? 0) });
        rows.push({ key: 'Token update gần nhất', value: pushTokens.last_updated_at || '—' });

        return rows;
    }, [
        systemStatus,
        form.notifications_dedupe_seconds,
        form.meeting_reminder_minutes_before,
        form.task_item_progress_reminder_time,
        form.project_handover_min_progress_percent,
        form.chatbot_enabled,
        form.chatbot_provider,
        form.chatbot_model,
        form.chatbot_history_pairs,
        form.chatbot_api_key,
        botRows.length,
    ]);

    const firebaseStatus = systemStatus?.firebase || {};
    const pushTokens = systemStatus?.push_tokens || {};
    const pushPlatforms = pushTokens?.by_platform || {};
    const apnsEnvironment = pushTokens?.ios_apns_environment || {};
    const formatDateTime = (value) => {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString('vi-VN');
    };
    const compactToken = (value) => {
        const token = String(value || '');
        if (!token) return '—';
        if (token.length <= 24) return token;
        return `${token.slice(0, 10)}...${token.slice(-10)}`;
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Cài đặt hệ thống"
            description="Trang cấu hình dành cho administrator. Quản lý thương hiệu, pháp lý, thông báo và kết nối hệ thống."
            stats={[]}
        >
            <div className="lg:col-span-2 space-y-4">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card">
                    <div className="flex flex-wrap gap-2">
                        {TABS.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                                    activeTab === tab.key
                                        ? 'bg-primary text-white'
                                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {activeTab === 'branding' && (
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                        <h3 className="text-sm font-semibold text-slate-900">Thiết lập thương hiệu</h3>
                        <p className="text-xs text-text-muted mt-1">Đổi tên brand, màu chủ đạo và logo cho web/app.</p>

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
                                        className="h-10 w-12 rounded-lg border border-slate-200 bg-transparent"
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
                    </div>
                )}

                {activeTab === 'contact' && (
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                        <h3 className="text-sm font-semibold text-slate-900">Thông tin liên hệ & pháp lý</h3>
                        <p className="text-xs text-text-muted mt-1">Dùng cho policy, hỗ trợ người dùng và review store.</p>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-xs text-text-muted">Email hỗ trợ</label>
                                <input
                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.support_email}
                                    onChange={(e) => setForm((s) => ({ ...s, support_email: e.target.value }))}
                                    placeholder="support@yourdomain.com"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-text-muted">Số điện thoại</label>
                                <input
                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.support_phone}
                                    onChange={(e) => setForm((s) => ({ ...s, support_phone: e.target.value }))}
                                    placeholder="+84 9xx xxx xxx"
                                />
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="text-xs text-text-muted">Địa chỉ liên hệ</label>
                            <textarea
                                className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm min-h-[90px]"
                                value={form.support_address}
                                onChange={(e) => setForm((s) => ({ ...s, support_address: e.target.value }))}
                                placeholder="Địa chỉ doanh nghiệp"
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'chatbot' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-3xl">
                                    <h3 className="text-sm font-semibold text-slate-900">Cấu hình AI Chatbot (đa bot)</h3>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Administrator có thể tạo nhiều chatbot, mỗi bot có model/API key/system message riêng.
                                        Lịch sử được tách theo từng người dùng và từng bot để không bị lẫn ngữ cảnh.
                                    </p>
                                </div>
                                <div className="w-full max-w-[280px] lg:w-auto">
                                    <ToggleSwitch
                                        checked={!!form.chatbot_enabled}
                                        onChange={(value) => setForm((s) => ({ ...s, chatbot_enabled: value }))}
                                        label={form.chatbot_enabled ? 'Chatbot đang bật' : 'Chatbot đang tắt'}
                                        description="Tắt/bật trợ lý AI trên cả web và app."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-sm font-semibold text-slate-900">Danh sách chatbot</h4>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                            onClick={() => loadChatbotBots({ preferredId: editingBotId })}
                                        >
                                            Tải lại
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                                            onClick={startCreateBot}
                                        >
                                            Tạo bot mới
                                        </button>
                                    </div>
                                </div>
                                <p className="mt-1 text-xs text-text-muted">
                                    Chọn 1 bot để sửa nhanh, hoặc bấm tạo mới.
                                </p>

                                <div className="mt-3 space-y-2">
                                    {botLoading && (
                                        <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                                            Đang tải danh sách chatbot...
                                        </div>
                                    )}
                                    {!botLoading && botRows.length === 0 && (
                                        <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                                            Chưa có chatbot nào.
                                        </div>
                                    )}
                                    {!botLoading && botRows.map((bot) => (
                                        <button
                                            key={bot.id}
                                            type="button"
                                            className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                                                Number(editingBotId) === Number(bot.id)
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-slate-200/80 bg-white hover:bg-slate-50'
                                            }`}
                                            onClick={() => selectBot(bot)}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span
                                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                                                        style={{ backgroundColor: `${bot.accent_color || '#6366F1'}1A`, color: bot.accent_color || '#6366F1' }}
                                                    >
                                                        {bot.icon || '🤖'}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-900">{bot.name}</p>
                                                        <p className="truncate text-xs text-slate-500">{bot.model || 'Chưa có model'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    {bot.is_default && (
                                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                            Mặc định
                                                        </span>
                                                    )}
                                                    {!bot.is_active && (
                                                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                                            Đang tắt
                                                        </span>
                                                    )}
                                                    {!bot.configured && (
                                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                            Thiếu key/model
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-900">
                                            {editingBotId ? `Chỉnh chatbot #${editingBotId}` : 'Tạo chatbot mới'}
                                        </h4>
                                        <p className="mt-1 text-xs text-text-muted">
                                            Giao diện tối giản: nhập tên bot, model, key, prompt hệ thống là chạy.
                                        </p>
                                    </div>
                                    {editingBotId && (
                                        <button
                                            type="button"
                                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                                            onClick={() => deleteBot(editingBotId)}
                                            disabled={botDeletingId === editingBotId}
                                        >
                                            {botDeletingId === editingBotId ? 'Đang xoá...' : 'Xoá chatbot'}
                                        </button>
                                    )}
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="text-xs text-text-muted">Tên chatbot</label>
                                        <input
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.name}
                                            onChange={(e) => setBotForm((s) => ({ ...s, name: e.target.value }))}
                                            placeholder="VD: Trợ lý SEO"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted">Mô tả ngắn</label>
                                        <input
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.description}
                                            onChange={(e) => setBotForm((s) => ({ ...s, description: e.target.value }))}
                                            placeholder="Bot hỗ trợ trả lời nghiệp vụ nội bộ."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted">Provider</label>
                                        <select
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.provider}
                                            onChange={(e) => {
                                                const nextProvider = e.target.value;
                                                setBotForm((s) => ({ ...s, provider: nextProvider }));
                                                setModelOptions(
                                                    nextProvider === 'gemini'
                                                        ? DEFAULT_GEMINI_MODEL_OPTIONS
                                                        : []
                                                );
                                                setModelError('');
                                            }}
                                        >
                                            <option value="gemini">Gemini</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted">Model Gemini</label>
                                        <select
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.model}
                                            onChange={(e) => setBotForm((s) => ({ ...s, model: e.target.value }))}
                                        >
                                            {!botForm.model && (
                                                <option value="" disabled>
                                                    {modelLoading ? 'Đang tải model...' : '-- Chọn model --'}
                                                </option>
                                            )}
                                            {modelOptions.map((item) => {
                                                const value = String(item.name || item.id || '').trim();
                                                if (!value) return null;
                                                const label = String(item.display_name || item.name || item.id).trim() || value;
                                                return (
                                                    <option key={value} value={value}>
                                                        {label}
                                                    </option>
                                                );
                                            })}
                                            {botForm.model && !modelOptions.some((item) => String(item.name || item.id) === botForm.model) && (
                                                <option value={botForm.model}>{botForm.model}</option>
                                            )}
                                        </select>
                                        <p className="mt-1 text-xs text-text-muted">
                                            {String(botForm.api_key || '').trim() === ''
                                                ? `Đang dùng danh sách mặc định ${DEFAULT_GEMINI_MODEL_OPTIONS.length} model.`
                                                : (modelLoading
                                                    ? 'Đang đồng bộ model theo API key...'
                                                    : `Đã tải ${modelOptions.length} model theo API key hiện tại.`)}
                                        </p>
                                        {modelError ? (
                                            <p className="mt-1 text-xs font-semibold text-rose-600">{modelError}</p>
                                        ) : null}
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs text-text-muted">Gemini API key</label>
                                        <input
                                            type="password"
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.api_key}
                                            autoComplete="new-password"
                                            name="gemini_api_key"
                                            data-lpignore="true"
                                            onChange={(e) => {
                                                const nextValue = e.target.value;
                                                setBotForm((s) => ({ ...s, api_key: nextValue }));
                                                setModelError('');
                                            }}
                                            placeholder="AIza..."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted">Số cặp Q&A đưa vào ngữ cảnh</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="40"
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.history_pairs}
                                            onChange={(e) => setBotForm((s) => ({ ...s, history_pairs: Number(e.target.value || 8) }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted">Thứ tự hiển thị</label>
                                        <input
                                            type="number"
                                            min="0"
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.sort_order}
                                            onChange={(e) => setBotForm((s) => ({ ...s, sort_order: Number(e.target.value || 0) }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted">Màu nhận diện</label>
                                        <input
                                            type="color"
                                            className="mt-2 h-[42px] w-full rounded-2xl border border-slate-200/80 px-2 py-1"
                                            value={botForm.accent_color || '#6366F1'}
                                            onChange={(e) => setBotForm((s) => ({ ...s, accent_color: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted">Icon (emoji)</label>
                                        <input
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.icon}
                                            onChange={(e) => setBotForm((s) => ({ ...s, icon: e.target.value }))}
                                            placeholder="🤖"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <ToggleSwitch
                                        checked={!!botForm.is_active}
                                        onChange={(value) => setBotForm((s) => ({ ...s, is_active: value }))}
                                        label={botForm.is_active ? 'Bot đang bật' : 'Bot đang tắt'}
                                        description="Bot tắt sẽ không xuất hiện cho người dùng chat."
                                    />
                                    <ToggleSwitch
                                        checked={!!botForm.is_default}
                                        onChange={(value) => setBotForm((s) => ({ ...s, is_default: value }))}
                                        label={botForm.is_default ? 'Bot mặc định' : 'Không phải mặc định'}
                                        description="Bot mặc định sẽ tự được chọn khi user mở trang chat."
                                    />
                                </div>

                                <div className="mt-4">
                                    <label className="text-xs text-text-muted">System message (Markdown)</label>
                                    <textarea
                                        className="mt-2 min-h-[220px] w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm leading-6"
                                        value={botForm.system_message_markdown}
                                        onChange={(e) => setBotForm((s) => ({ ...s, system_message_markdown: e.target.value }))}
                                        placeholder={`# Vai trò trợ lý
- Trả lời theo tài liệu nội bộ.
- Nếu thiếu dữ liệu thì hỏi lại ngắn gọn.
- Không trộn lịch sử giữa các người dùng.`}
                                    />
                                </div>

                                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Luồng chat tuần tự</div>
                                    <div className="mt-1 text-sm text-slate-700">
                                        Mỗi user chat tuần tự từng câu. Trong lúc bot đang trả lời, câu mới sẽ vào hàng chờ và vẫn có thể chỉnh sửa trước khi gửi.
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                        onClick={saveBot}
                                        disabled={botSaving}
                                    >
                                        {botSaving ? 'Đang lưu...' : (editingBotId ? 'Cập nhật chatbot' : 'Tạo chatbot')}
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                        onClick={() => loadChatbotBots({ preferredId: editingBotId })}
                                    >
                                        Đồng bộ danh sách
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'notifications' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Cấu hình thông báo & lịch gửi</h3>
                                    <p className="text-xs text-text-muted mt-1">
                                        Mỗi loại thông báo được mô tả rõ gửi cho ai, nội dung gì và thời gian chạy để administrator dễ kiểm soát.
                                    </p>
                                </div>
                                <div className="text-xs text-text-muted">
                                    {settingsLoading ? 'Đang đồng bộ cài đặt...' : 'Đang dùng cấu hình lưu trong hệ thống'}
                                </div>
                            </div>

                            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                                <ToggleSwitch
                                    checked={!!form.notifications_push_enabled}
                                    onChange={(value) => setForm((s) => ({ ...s, notifications_push_enabled: value }))}
                                    label="Kênh push notification"
                                    description="Gửi thông báo đẩy tới thiết bị mobile/web đã đăng ký token."
                                />
                                <ToggleSwitch
                                    checked={!!form.notifications_in_app_enabled}
                                    onChange={(value) => setForm((s) => ({ ...s, notifications_in_app_enabled: value }))}
                                    label="Kênh thông báo trong app/web"
                                    description="Ghi nhận thông báo vào trung tâm thông báo và badge trong hệ thống."
                                />
                                <ToggleSwitch
                                    checked={!!form.notifications_email_fallback_enabled}
                                    onChange={(value) => setForm((s) => ({ ...s, notifications_email_fallback_enabled: value }))}
                                    label="Email fallback"
                                    description="Nếu push thất bại thì hệ thống sẽ thử gửi email bằng cấu hình SMTP bên dưới."
                                />
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-sm font-semibold text-slate-900">Khoảng chống trùng thông báo</div>
                                    <div className="mt-1 text-xs text-text-muted">
                                        Dùng để chặn việc bắn lặp cùng một thông báo trong thời gian quá ngắn.
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        max="3600"
                                        className="mt-3 w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-sm"
                                        value={form.notifications_dedupe_seconds}
                                        onChange={(e) => setForm((s) => ({ ...s, notifications_dedupe_seconds: Number(e.target.value || 0) }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <NotificationCard
                            title="Nhắc đầu việc chậm tiến độ"
                            subtitle="Cron kiểm tra đầu việc đang chậm so với tiến độ kỳ vọng và bắn nhắc đúng theo giờ bạn cấu hình."
                            enabled={!!form.task_item_progress_reminder_enabled}
                            onToggle={(value) => setForm((s) => ({ ...s, task_item_progress_reminder_enabled: value }))}
                            audience="Nhân sự đang được giao đầu việc bị chậm tiến độ."
                            message='Tiêu đề: "Đầu việc chậm tiến độ". Nội dung liệt kê các đầu việc bị chậm và % đang bị thiếu so với kỳ vọng.'
                        >
                            <div>
                                <label className="text-xs text-text-muted">Giờ bắn push mỗi ngày</label>
                                <input
                                    type="time"
                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.task_item_progress_reminder_time}
                                    onChange={(e) => setForm((s) => ({ ...s, task_item_progress_reminder_time: e.target.value }))}
                                />
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Logic gửi</div>
                                <div className="mt-1 text-sm text-slate-700">
                                    Mỗi ngày chỉ nhắc 1 lần cho mỗi đầu việc/người phụ trách, không gửi lặp trong cùng ngày.
                                </div>
                            </div>
                        </NotificationCard>

                        <NotificationCard
                            title="Phiếu duyệt đầu việc mới"
                            subtitle="Gửi ngay khi nhân viên hoặc người phụ trách tạo một phiếu báo cáo tiến độ đầu việc mới."
                            enabled={!!form.task_item_update_submission_notification_enabled}
                            onToggle={(value) => setForm((s) => ({ ...s, task_item_update_submission_notification_enabled: value }))}
                            audience="Quản lý dự án, quản lý phòng ban và toàn bộ admin liên quan tới công việc đó."
                            message='Tiêu đề: "Có phiếu duyệt đầu việc mới". Nội dung gồm tên đầu việc và người vừa gửi phiếu.'
                        >
                            <div className="rounded-2xl bg-slate-50 px-4 py-3 md:col-span-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Thời điểm gửi</div>
                                <div className="mt-1 text-sm text-slate-700">
                                    Gửi ngay sau khi phiếu được tạo thành công, không chờ cron và không đợi nhân viên cập nhật lại công việc.
                                </div>
                            </div>
                        </NotificationCard>

                        <NotificationCard
                            title="Phản hồi phiếu duyệt đầu việc"
                            subtitle="Gửi khi phiếu duyệt được duyệt, bị từ chối hoặc bị xóa để nhân viên biết trạng thái xử lý."
                            enabled={!!form.task_item_update_feedback_notification_enabled}
                            onToggle={(value) => setForm((s) => ({ ...s, task_item_update_feedback_notification_enabled: value }))}
                            audience="Nhân viên đã gửi phiếu và nhân sự phụ trách đầu việc nếu khác người gửi."
                            message='Ví dụ: "Phiếu duyệt đầu việc đã được duyệt / không được duyệt / đã bị xóa" kèm tên đầu việc và người phản hồi.'
                        >
                            <div className="rounded-2xl bg-slate-50 px-4 py-3 md:col-span-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Cách hoạt động</div>
                                <div className="mt-1 text-sm text-slate-700">
                                    Thông báo được bắn ngay sau khi quản lý phản hồi phiếu, nên nhân viên không cần mở lại đầu việc để kiểm tra thủ công.
                                </div>
                            </div>
                        </NotificationCard>

                        <NotificationCard
                            title="Nhắc lịch họp"
                            subtitle="Thông báo tự động cho các thành viên cuộc họp trước giờ bắt đầu."
                            enabled={!!form.meeting_reminder_enabled}
                            onToggle={(value) => setForm((s) => ({ ...s, meeting_reminder_enabled: value }))}
                            audience="Những thành viên được chọn trong lịch họp."
                            message='Thông báo gồm tên cuộc họp, thời gian bắt đầu, ghi chú và link họp nếu có.'
                        >
                            <div>
                                <label className="text-xs text-text-muted">Nhắc trước bao nhiêu phút</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1440"
                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.meeting_reminder_minutes_before}
                                    onChange={(e) => setForm((s) => ({ ...s, meeting_reminder_minutes_before: Number(e.target.value || 60) }))}
                                />
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Cách hoạt động</div>
                                <div className="mt-1 text-sm text-slate-700">
                                    Command chạy mỗi phút và tự so khớp với thời gian họp, nên không cần nhập giờ cố định.
                                </div>
                            </div>
                        </NotificationCard>

                        <NotificationCard
                            title="Thông báo khách hàng mới"
                            subtitle="Áp dụng cho khách vào từ Form tư vấn, Facebook Page hoặc CRM do nhân viên nhập tay."
                            enabled={!!form.lead_capture_notification_enabled}
                            onToggle={(value) => setForm((s) => ({ ...s, lead_capture_notification_enabled: value }))}
                            audience="Nhân viên phụ trách lead và toàn bộ admin."
                            message='Nội dung gồm: họ tên khách, số điện thoại, nguồn khách vào từ đâu và ai là người phụ trách lead.'
                        >
                            <div className="rounded-2xl bg-slate-50 px-4 py-3 md:col-span-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Thời điểm gửi</div>
                                <div className="mt-1 text-sm text-slate-700">
                                    Gửi ngay sau khi lead được ghi nhận thành công vào CRM, không đợi cron.
                                </div>
                            </div>
                        </NotificationCard>

                        <NotificationCard
                            title="Nhắc công nợ hợp đồng"
                            subtitle="Cron kiểm tra các hợp đồng đã duyệt nhưng vẫn còn công nợ chưa thu đủ."
                            enabled={!!form.contract_unpaid_reminder_enabled}
                            onToggle={(value) => setForm((s) => ({ ...s, contract_unpaid_reminder_enabled: value }))}
                            audience="Admin và nhân viên phụ trách hợp đồng."
                            message='Nội dung gồm: tên hợp đồng, còn phải thanh toán bao nhiêu và ai là người phụ trách hợp đồng.'
                        >
                            <div>
                                <label className="text-xs text-text-muted">Giờ bắn push mỗi ngày</label>
                                <input
                                    type="time"
                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.contract_unpaid_reminder_time}
                                    onChange={(e) => setForm((s) => ({ ...s, contract_unpaid_reminder_time: e.target.value }))}
                                />
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Điều kiện</div>
                                <div className="mt-1 text-sm text-slate-700">
                                    Chỉ nhắc với hợp đồng đã duyệt và còn công nợ lớn hơn 0 tại thời điểm chạy cron.
                                </div>
                            </div>
                        </NotificationCard>

                        <NotificationCard
                            title="Nhắc hợp đồng sắp hết hạn"
                            subtitle="Cron bắn thông báo lặp hằng ngày trước ngày hết hạn hợp đồng để đội phụ trách xử lý gia hạn kịp."
                            enabled={!!form.contract_expiry_reminder_enabled}
                            onToggle={(value) => setForm((s) => ({ ...s, contract_expiry_reminder_enabled: value }))}
                            audience="Admin và nhân viên phụ trách hợp đồng."
                            message='Nội dung gồm: tên hợp đồng, còn công nợ bao nhiêu (nếu có) và nhân viên đang phụ trách hợp đồng.'
                        >
                            <div>
                                <label className="text-xs text-text-muted">Giờ bắn push mỗi ngày</label>
                                <input
                                    type="time"
                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.contract_expiry_reminder_time}
                                    onChange={(e) => setForm((s) => ({ ...s, contract_expiry_reminder_time: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-text-muted">Báo trước bao nhiêu ngày</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.contract_expiry_reminder_days_before}
                                    onChange={(e) => setForm((s) => ({ ...s, contract_expiry_reminder_days_before: Number(e.target.value || 3) }))}
                                />
                            </div>
                        </NotificationCard>

                        <NotificationCard
                            title="Bàn giao dự án"
                            subtitle="Thiết lập điều kiện để phụ trách dự án được gửi phiếu duyệt bàn giao và giúp admin kiểm soát ngưỡng nghiệm thu."
                            enabled
                            onToggle={() => {}}
                            audience="Áp dụng cho phụ trách dự án. Admin và nhân viên lên hợp đồng của dự án là người được quyền duyệt hoặc từ chối."
                            message='Khi dự án đạt đủ ngưỡng tiến độ, phụ trách dự án mới được gửi phiếu bàn giao. Nếu phiếu bị phản hồi, hệ thống sẽ báo lại cho phụ trách dự án kèm lý do.'
                            showToggle={false}
                        >
                            <div>
                                <label className="text-xs text-text-muted">Tiến độ tối thiểu để gửi duyệt (%)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.project_handover_min_progress_percent}
                                    onChange={(e) => setForm((s) => ({
                                        ...s,
                                        project_handover_min_progress_percent: Number(e.target.value || 90),
                                    }))}
                                />
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Logic duyệt</div>
                                <div className="mt-1 text-sm text-slate-700">
                                    Chỉ phụ trách dự án mới được gửi phiếu. Dự án đang chờ duyệt sẽ xuất hiện trong trang Bàn giao dự án để admin hoặc nhân viên lên hợp đồng phản hồi.
                                </div>
                            </div>
                        </NotificationCard>

                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-2xl">
                                    <h3 className="text-sm font-semibold text-slate-900">Cấu hình SMTP</h3>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Dùng cho email fallback khi push thất bại. Có thể dùng cấu hình riêng của hệ thống hoặc giữ theo file `.env`.
                                    </p>
                                </div>
                                <div className="w-full max-w-[280px] lg:w-auto">
                                    <ToggleSwitch
                                        checked={!!form.smtp_custom_enabled}
                                        onChange={(value) => setForm((s) => ({ ...s, smtp_custom_enabled: value }))}
                                        label={form.smtp_custom_enabled ? 'Đang dùng SMTP riêng' : 'Đang dùng SMTP từ .env'}
                                        description="Bật để dùng cấu hình bên dưới thay cho mail config mặc định của server."
                                    />
                                </div>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-xs text-text-muted">Mailer</label>
                                    <select
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.smtp_mailer}
                                        onChange={(e) => setForm((s) => ({ ...s, smtp_mailer: e.target.value }))}
                                        disabled={!form.smtp_custom_enabled}
                                    >
                                        <option value="smtp">SMTP</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Encryption</label>
                                    <select
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.smtp_encryption}
                                        onChange={(e) => setForm((s) => ({ ...s, smtp_encryption: e.target.value }))}
                                        disabled={!form.smtp_custom_enabled}
                                    >
                                        <option value="tls">TLS</option>
                                        <option value="ssl">SSL</option>
                                        <option value="none">Không dùng</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">SMTP host</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.smtp_host}
                                        onChange={(e) => setForm((s) => ({ ...s, smtp_host: e.target.value }))}
                                        placeholder="smtp.gmail.com"
                                        disabled={!form.smtp_custom_enabled}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">SMTP port</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="65535"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.smtp_port}
                                        onChange={(e) => setForm((s) => ({ ...s, smtp_port: Number(e.target.value || 587) }))}
                                        disabled={!form.smtp_custom_enabled}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Username</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.smtp_username}
                                        onChange={(e) => setForm((s) => ({ ...s, smtp_username: e.target.value }))}
                                        placeholder="your@email.com"
                                        disabled={!form.smtp_custom_enabled}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Password / App password</label>
                                    <input
                                        type="password"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.smtp_password}
                                        onChange={(e) => setForm((s) => ({ ...s, smtp_password: e.target.value }))}
                                        placeholder="••••••••"
                                        disabled={!form.smtp_custom_enabled}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">From email</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.smtp_from_address}
                                        onChange={(e) => setForm((s) => ({ ...s, smtp_from_address: e.target.value }))}
                                        placeholder="no-reply@yourdomain.com"
                                        disabled={!form.smtp_custom_enabled}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">From name</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.smtp_from_name}
                                        onChange={(e) => setForm((s) => ({ ...s, smtp_from_name: e.target.value }))}
                                        placeholder="Jobs ClickOn"
                                        disabled={!form.smtp_custom_enabled}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Test bắn thông báo thiết bị</h3>
                                    <p className="text-xs text-text-muted mt-1">Chọn tài khoản đích và gửi ngay một push test.</p>
                                </div>
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                                    onClick={reloadSystemStatus}
                                    disabled={statusLoading}
                                >
                                    {statusLoading ? 'Đang tải...' : 'Làm mới config'}
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                                <select
                                    className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={testForm.user_id}
                                    onChange={(e) => setTestForm((s) => ({ ...s, user_id: e.target.value }))}
                                >
                                    <option value="">-- Chọn người nhận --</option>
                                    {users.map((u) => (
                                        <option key={u.id} value={u.id}>{u.name} • {u.email}</option>
                                    ))}
                                </select>
                                <input
                                    className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={testForm.title}
                                    onChange={(e) => setTestForm((s) => ({ ...s, title: e.target.value }))}
                                    placeholder="Tiêu đề push"
                                />
                                <input
                                    className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={testForm.body}
                                    onChange={(e) => setTestForm((s) => ({ ...s, body: e.target.value }))}
                                    placeholder="Nội dung push"
                                />
                            </div>
                            <div className="mt-3">
                                <button
                                    type="button"
                                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                    disabled={testingPush}
                                    onClick={submitPushTest}
                                >
                                    {testingPush ? 'Đang gửi...' : 'Gửi push test'}
                                </button>
                            </div>

                            {lastTestResult && (
                                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                    <h4 className="text-sm font-semibold text-slate-900">Kết quả push test gần nhất</h4>
                                    <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                                        <div>Người nhận: <span className="font-semibold text-slate-900">{lastTestResult.target_user_name || '—'} (ID: {lastTestResult.target_user_id || '—'})</span></div>
                                        <div>Email đích: <span className="font-semibold text-slate-900">{lastTestResult.target_user_email || '—'}</span></div>
                                        <div>Kết quả: <span className={`font-semibold ${lastTestResult.push_sent ? 'text-emerald-600' : 'text-rose-600'}`}>{lastTestResult.push_sent ? 'Đã gửi' : 'Chưa gửi'}</span></div>
                                        <div>Lý do: <span className="font-semibold text-slate-900">{lastTestResult?.push_result?.error || lastTestResult.error || '—'}</span></div>
                                        <div>FCM sent/failed: <span className="font-semibold text-slate-900">{lastTestResult?.push_result?.sent ?? 0}/{lastTestResult?.push_result?.failed ?? 0}</span></div>
                                        <div>Token tổng: <span className="font-semibold text-slate-900">{lastTestResult.token_count ?? 0}</span></div>
                                        <div>Token Android: <span className="font-semibold text-slate-900">{lastTestResult?.token_by_platform?.android ?? 0}</span></div>
                                        <div>Token iOS: <span className="font-semibold text-slate-900">{lastTestResult?.token_by_platform?.ios ?? 0}</span></div>
                                        <div>Token Web: <span className="font-semibold text-slate-900">{lastTestResult?.token_by_platform?.web ?? 0}</span></div>
                                        <div>Token quyền ON: <span className="font-semibold text-slate-900">{lastTestResult.token_notifications_enabled ?? 0}</span></div>
                                        <div>Token quyền OFF: <span className="font-semibold text-slate-900">{lastTestResult.token_notifications_disabled ?? 0}</span></div>
                                        <div>Requested user_id: <span className="font-semibold text-slate-900">{lastTestResult?.debug?.requested_user_id ?? '—'}</span></div>
                                        <div>Acting user_id: <span className="font-semibold text-slate-900">{lastTestResult?.debug?.acting_user_id ?? '—'}</span></div>
                                        <div>DB connection: <span className="font-semibold text-slate-900">{lastTestResult?.debug?.db_connection ?? '—'}</span></div>
                                        <div>DB name: <span className="font-semibold text-slate-900">{lastTestResult?.debug?.db_database ?? '—'}</span></div>
                                        <div>DB host: <span className="font-semibold text-slate-900">{lastTestResult?.debug?.db_host ?? '—'}</span></div>
                                    </div>
                                    {Array.isArray(lastTestResult?.debug?.recent_token_users) && lastTestResult.debug.recent_token_users.length > 0 && (
                                        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                                            <div className="font-semibold text-slate-700">Token owners gần nhất (debug)</div>
                                            <div className="mt-2 space-y-1 text-slate-600">
                                                {lastTestResult.debug.recent_token_users.map((row, idx) => (
                                                    <div key={`${row.user_id}-${idx}`}>
                                                        #{idx + 1} user_id={row.user_id} • {row.platform || 'unknown'} • {row.updated_at || '—'}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {lastTestResult?.push_result?.errors && Object.keys(lastTestResult.push_result.errors).length > 0 && (
                                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs">
                                            <div className="font-semibold text-rose-700">Chi tiết lỗi FCM</div>
                                            <div className="mt-1 space-y-1 text-rose-700">
                                                {Object.entries(lastTestResult.push_result.errors).map(([token, info]) => (
                                                    <div key={token}>
                                                        • {(info?.status || 'UNKNOWN')} - {info?.message || 'FCM request failed'}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {Array.isArray(lastTestResult.token_samples) && lastTestResult.token_samples.length > 0 && (
                                        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                                            <div className="font-semibold text-slate-700">Token mẫu đang lưu cho user đích</div>
                                            <div className="mt-2 space-y-1 text-slate-600">
                                                {lastTestResult.token_samples.map((sample, idx) => (
                                                    <div key={`${sample.token_suffix || 'token'}-${idx}`} className="rounded-lg border border-slate-100 px-2 py-1.5">
                                                        <div>#{idx + 1} • {sample.platform || 'unknown'} • quyền: {sample.notifications_enabled === false ? 'OFF' : (sample.notifications_enabled === true ? 'ON' : 'UNKNOWN')}</div>
                                                        <div>suffix: <span className="font-semibold text-slate-900">{sample.token_suffix || '—'}</span></div>
                                                        <div>last_seen: {sample.last_seen_at || '—'} • updated: {sample.updated_at || '—'}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'diagnostics' && (
                    <div className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-3">
                            <div className="xl:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-900">Trạng thái kết nối hệ thống</h3>
                                        <p className="mt-1 text-xs text-text-muted">Di chuyển từ dashboard sang đây để administrator kiểm tra tập trung.</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                                        onClick={reloadSystemStatus}
                                        disabled={statusLoading}
                                    >
                                        {statusLoading ? 'Đang tải...' : 'Làm mới'}
                                    </button>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200/80 p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-slate-900">Firebase server</h4>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${firebaseStatus.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                {firebaseStatus.enabled ? 'Sẵn sàng' : 'Chưa cấu hình'}
                                            </span>
                                        </div>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500">Realtime DB</span>
                                                <span className="font-semibold text-slate-900">{firebaseStatus.database_enabled ? 'OK' : 'Thiếu DB URL'}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500">Access token push</span>
                                                <span className="font-semibold text-slate-900">{firebaseStatus.access_token ? 'OK' : 'Chưa lấy được'}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500">Project</span>
                                                <span className="font-semibold text-slate-900">{firebaseStatus.project_id || '—'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200/80 p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-slate-900">Thiết bị nhận thông báo</h4>
                                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                                {pushTokens.total ?? 0} token
                                            </span>
                                        </div>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500">iOS</span>
                                                <span className="font-semibold text-slate-900">{pushPlatforms.ios ?? 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500">Android</span>
                                                <span className="font-semibold text-slate-900">{pushPlatforms.android ?? 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500">Web</span>
                                                <span className="font-semibold text-slate-900">{pushPlatforms.web ?? 0}</span>
                                            </div>
                                            <div className="pt-2 text-xs text-text-muted">
                                                Cập nhật gần nhất: {pushTokens.last_updated_at || '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                                <h3 className="text-sm font-semibold text-slate-900">Môi trường APNs iOS</h3>
                                <p className="mt-1 text-xs text-text-muted">Đối chiếu token production/development khi test TestFlight và máy dev.</p>
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                        <span className="text-sm text-slate-600">Production</span>
                                        <span className="text-sm font-semibold text-slate-900">{apnsEnvironment.production ?? 0}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                        <span className="text-sm text-slate-600">Development</span>
                                        <span className="text-sm font-semibold text-slate-900">{apnsEnvironment.development ?? 0}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                        <span className="text-sm text-slate-600">Chưa xác định</span>
                                        <span className="text-sm font-semibold text-slate-900">{apnsEnvironment.unknown ?? 0}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
                            <div className="border-b border-slate-200/80 px-4 py-3">
                                <h3 className="text-sm font-semibold text-slate-900">Danh sách config kỹ thuật & thông báo</h3>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {configRows.map((row) => (
                                    <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                                        <span className="text-slate-500">{row.key}</span>
                                        <span className="text-right font-semibold text-slate-900">{row.value || '—'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'mobile_devices' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Thiết bị di động người dùng</h3>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Theo dõi token push, môi trường iOS, trạng thái quyền thông báo và thiết bị đang gắn với từng tài khoản.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                                    onClick={() => fetchDevices(1)}
                                    disabled={deviceLoading}
                                >
                                    {deviceLoading ? 'Đang tải...' : 'Làm mới'}
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={deviceFilters.search}
                                    onChange={(e) => setDeviceFilters((s) => ({ ...s, search: e.target.value }))}
                                    placeholder="Tìm theo user, email, điện thoại, token"
                                />
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={deviceFilters.platform}
                                    onChange={(e) => setDeviceFilters((s) => ({ ...s, platform: e.target.value }))}
                                >
                                    <option value="">Tất cả nền tảng</option>
                                    <option value="ios">iOS</option>
                                    <option value="android">Android</option>
                                    <option value="web">Web</option>
                                </select>
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={deviceFilters.apns_environment}
                                    onChange={(e) => setDeviceFilters((s) => ({ ...s, apns_environment: e.target.value }))}
                                >
                                    <option value="">Tất cả môi trường APNs</option>
                                    <option value="production">production</option>
                                    <option value="development">development</option>
                                </select>
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={deviceFilters.notifications_enabled}
                                    onChange={(e) => setDeviceFilters((s) => ({ ...s, notifications_enabled: e.target.value }))}
                                >
                                    <option value="">Tất cả quyền thông báo</option>
                                    <option value="true">Đang bật</option>
                                    <option value="false">Đang tắt</option>
                                    <option value="null">Chưa xác định</option>
                                </select>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                    onClick={() => fetchDevices(1)}
                                >
                                    Lọc danh sách
                                </button>
                                <button
                                    type="button"
                                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                    onClick={() => {
                                        const next = {
                                            search: '',
                                            platform: '',
                                            apns_environment: '',
                                            notifications_enabled: '',
                                        };
                                        setDeviceFilters(next);
                                        fetchDevices(1, next);
                                    }}
                                >
                                    Xóa bộ lọc
                                </button>
                                <div className="ml-auto text-xs text-text-muted">
                                    Tổng thiết bị: <span className="font-semibold text-slate-900">{deviceMeta.total || 0}</span>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-text-subtle">
                                        <tr>
                                            <th className="px-4 py-3">Người dùng</th>
                                            <th className="px-4 py-3">Thiết bị</th>
                                            <th className="px-4 py-3">Nền tảng</th>
                                            <th className="px-4 py-3">Token push</th>
                                            <th className="px-4 py-3">Quyền thông báo</th>
                                            <th className="px-4 py-3">Hoạt động gần nhất</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {deviceLoading && (
                                            <tr>
                                                <td className="px-4 py-6 text-center text-text-muted" colSpan={6}>
                                                    Đang tải danh sách thiết bị...
                                                </td>
                                            </tr>
                                        )}
                                        {!deviceLoading && deviceRows.length === 0 && (
                                            <tr>
                                                <td className="px-4 py-6 text-center text-text-muted" colSpan={6}>
                                                    Chưa có thiết bị nào khớp điều kiện lọc.
                                                </td>
                                            </tr>
                                        )}
                                        {!deviceLoading && deviceRows.map((row) => (
                                            <tr key={row.id}>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-semibold text-slate-900">{row.user?.name || 'Không rõ user'}</div>
                                                    <div className="mt-1 text-xs text-text-muted">{row.user?.email || '—'}</div>
                                                    <div className="mt-1 text-xs text-text-muted">
                                                        Vai trò: {row.user?.role || '—'} • SĐT: {row.user?.phone || '—'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-semibold text-slate-900">{row.device_name || 'Chưa gửi tên thiết bị'}</div>
                                                    <div className="mt-1 text-xs text-text-muted">ID thiết bị: #{row.id}</div>
                                                    <div className="mt-1 text-xs text-text-muted">Cập nhật: {formatDateTime(row.updated_at)}</div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-semibold text-slate-900">{row.platform || 'unknown'}</div>
                                                    <div className="mt-1 text-xs text-text-muted">
                                                        APNs: {row.apns_environment || '—'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-mono text-xs text-slate-700">{compactToken(row.token)}</div>
                                                    <div className="mt-2">
                                                        <button
                                                            type="button"
                                                            className="text-xs font-semibold text-primary"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(String(row.token || ''));
                                                                toast.success('Đã copy token thiết bị.');
                                                            }}
                                                        >
                                                            Copy token
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                        row.notifications_enabled === true
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : row.notifications_enabled === false
                                                                ? 'bg-rose-100 text-rose-700'
                                                                : 'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {row.notifications_enabled === true
                                                            ? 'Đang bật'
                                                            : row.notifications_enabled === false
                                                                ? 'Đang tắt'
                                                                : 'Chưa xác định'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 align-top text-xs text-text-muted">
                                                    <div>Seen: {formatDateTime(row.last_seen_at)}</div>
                                                    <div className="mt-1">Updated: {formatDateTime(row.updated_at)}</div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-text-muted">
                                <span>Trang {deviceMeta.current_page || 1}/{deviceMeta.last_page || 1}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 disabled:opacity-40"
                                        disabled={(deviceMeta.current_page || 1) <= 1 || deviceLoading}
                                        onClick={() => fetchDevices((deviceMeta.current_page || 1) - 1)}
                                    >
                                        Trước
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 disabled:opacity-40"
                                        disabled={(deviceMeta.current_page || 1) >= (deviceMeta.last_page || 1) || deviceLoading}
                                        onClick={() => fetchDevices((deviceMeta.current_page || 1) + 1)}
                                    >
                                        Sau
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                    <div className="flex flex-wrap gap-3">
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
                            onClick={() => {
                                setForm(baseSettings);
                                setLogoFile(null);
                                setPreview(baseSettings?.logo_url || '');
                            }}
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
