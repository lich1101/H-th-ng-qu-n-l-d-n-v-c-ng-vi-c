import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDateTime } from '@/lib/vietnamTime';

const TAB_GROUPS = [
    {
        key: 'core',
        label: 'Cơ Bản',
        tabs: [
            { key: 'branding', label: 'Thương hiệu' },
            { key: 'contact', label: 'Liên hệ & pháp lý' },
            { key: 'mobile_app', label: 'App mobile' },
        ],
    },
    {
        key: 'automation',
        label: 'Tự Động & CRM',
        tabs: [
            { key: 'notification_channels', label: 'Kênh thông báo' },
            { key: 'task_notifications', label: 'Task & họp' },
            { key: 'crm_contract_notifications', label: 'CRM & hợp đồng' },
            { key: 'smtp', label: 'SMTP email' },
            { key: 'push_testing', label: 'Test push' },
            { key: 'client_rotation', label: 'Xoay khách hàng' },
        ],
    },
    {
        key: 'integrations',
        label: 'Tích Hợp',
        tabs: [
            { key: 'chatbot', label: 'AI Chatbot' },
            { key: 'gsc', label: 'Google Search Console' },
        ],
    },
    {
        key: 'ops',
        label: 'Thiết Bị & Kiểm Tra',
        tabs: [
            { key: 'mobile_devices', label: 'Thiết bị người dùng' },
            { key: 'diagnostics', label: 'Chẩn đoán hệ thống' },
        ],
    },
];
const TABS = TAB_GROUPS.flatMap((group) => group.tabs);
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));
const LEGACY_TAB_ALIASES = {
    notifications: 'notification_channels',
};

const DEFAULT_GEMINI_MODEL_OPTIONS = [
    { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', name: 'gemini-2.0-flash-lite', display_name: 'Gemini 2.0 Flash Lite' },
    { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'gemini-1.5-flash', display_name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b', name: 'gemini-1.5-flash-8b', display_name: 'Gemini 1.5 Flash 8B' },
];

const ROLE_LABELS = {
    administrator: 'Administrator',
    admin: 'Admin',
    quan_ly: 'Quản lý',
    nhan_vien: 'Nhân viên',
    ke_toan: 'Kế toán',
};

const CLIENT_ROTATION_SCOPE_OPTIONS = [
    {
        value: 'same_department',
        title: 'Chỉ trong cùng phòng ban',
        description: 'Chỉ những nhân sự đã chọn và cùng phòng ban với người đang giữ khách mới được nhận xoay.',
    },
    {
        value: 'global_staff',
        title: 'Toàn bộ nhân sự đã chọn',
        description: 'Không giới hạn theo phòng ban, miễn là người nhận nằm trong danh sách xoay và chưa vượt quota/ngày.',
    },
    {
        value: 'balanced_department',
        title: 'Chia đều theo phòng ban',
        description: 'Khách đủ điều kiện sẽ được điều chuyển sang phòng ban khác phòng ban hiện tại, rồi chia đều tiếp cho nhân sự trong phòng ban nhận.',
    },
];

const normalizeRotationScopeMode = (settings) => {
    const scopeMode = String(settings?.client_rotation_scope_mode || '').trim();
    if (['same_department', 'global_staff', 'balanced_department'].includes(scopeMode)) {
        return scopeMode;
    }

    return settings?.client_rotation_same_department_only ? 'same_department' : 'global_staff';
};

const normalizeParticipantModeMap = (value, participantIds = []) => {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const selected = new Set(normalizeIdList(participantIds));
    const next = {};

    Object.entries(raw).forEach(([rawUserId, mode]) => {
        const userId = Number(rawUserId || 0);
        if (!Number.isInteger(userId) || userId <= 0 || !selected.has(userId) || !mode || typeof mode !== 'object') {
            return;
        }

        const onlyReceive = Boolean(mode.only_receive);
        const onlyGive = Boolean(mode.only_give);
        if (!onlyReceive && !onlyGive) {
            return;
        }

        next[String(userId)] = {
            only_receive: onlyReceive,
            only_give: onlyGive,
        };
    });

    return next;
};

const participantRotationMode = (participantModes, userId) => {
    const key = String(Number(userId || 0));
    const mode = participantModes?.[key] || {};
    const onlyReceive = Boolean(mode.only_receive);
    const onlyGive = Boolean(mode.only_give);

    if (onlyReceive && !onlyGive) {
        return {
            onlyReceive,
            onlyGive,
            modeKey: 'only_receive',
            label: 'Chỉ nhận vào',
            hint: 'Khách của nhân sự này không bị xoay ra, nhưng vẫn được nhận khách mới.',
        };
    }

    if (onlyGive && !onlyReceive) {
        return {
            onlyReceive,
            onlyGive,
            modeKey: 'only_give',
            label: 'Chỉ cho đi',
            hint: 'Nhân sự này vẫn có thể mất khách khi quá hạn nhưng sẽ không nhận khách auto-rotation vào.',
        };
    }

    if (onlyReceive && onlyGive) {
        return {
            onlyReceive,
            onlyGive,
            modeKey: 'normal',
            label: 'Đang bật cả 2 nên xử lý như bình thường',
            hint: 'Khi bật đồng thời cả 2, hệ thống coi nhân sự này như chế độ bình thường.',
        };
    }

    return {
        onlyReceive,
        onlyGive,
        modeKey: 'normal',
        label: 'Bình thường',
        hint: 'Nhân sự này vừa có thể nhận vào, vừa có thể bị xoay khách ra nếu quá hạn.',
    };
};

const initialSettings = (settings) => ({
    client_rotation_scope_mode: normalizeRotationScopeMode(settings),
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
    gsc_enabled: settings?.gsc_enabled ?? false,
    gsc_client_id: settings?.gsc_client_id || '',
    gsc_client_secret: settings?.gsc_client_secret || '',
    gsc_refresh_token: settings?.gsc_refresh_token || '',
    gsc_row_limit: settings?.gsc_row_limit ?? 2500,
    gsc_data_state: settings?.gsc_data_state || 'all',
    gsc_alert_threshold_percent: settings?.gsc_alert_threshold_percent ?? 30,
    gsc_recipes_path_token: settings?.gsc_recipes_path_token || '/recipes',
    gsc_brand_terms: Array.isArray(settings?.gsc_brand_terms) ? settings.gsc_brand_terms.join('\n') : '',
    gsc_sync_time: settings?.gsc_sync_time || '11:17',
    client_rotation_enabled: settings?.client_rotation_enabled ?? false,
    client_rotation_comment_stale_days: settings?.client_rotation_comment_stale_days ?? 3,
    client_rotation_opportunity_stale_days: settings?.client_rotation_opportunity_stale_days ?? 30,
    client_rotation_contract_stale_days: settings?.client_rotation_contract_stale_days ?? 90,
    client_rotation_warning_days: settings?.client_rotation_warning_days ?? 3,
    client_rotation_daily_receive_limit: settings?.client_rotation_daily_receive_limit ?? 5,
    client_rotation_same_department_only: normalizeRotationScopeMode(settings) === 'same_department',
    client_rotation_lead_type_ids: Array.isArray(settings?.client_rotation_lead_type_ids)
        ? settings.client_rotation_lead_type_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : [],
    client_rotation_participant_user_ids: Array.isArray(settings?.client_rotation_participant_user_ids)
        ? settings.client_rotation_participant_user_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : [],
    client_rotation_participant_modes: normalizeParticipantModeMap(
        settings?.client_rotation_participant_modes,
        Array.isArray(settings?.client_rotation_participant_user_ids) ? settings.client_rotation_participant_user_ids : []
    ),
    app_android_apk_url: settings?.app_android_apk_url || '',
    app_ios_testflight_url: settings?.app_ios_testflight_url || '',
    app_release_notes: settings?.app_release_notes || '',
    app_release_version: settings?.app_release_version || '',
});

const normalizeIdList = (value) => (
    Array.isArray(value)
        ? value
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
        : []
);

const moveIdInList = (list, targetId, direction) => {
    const current = normalizeIdList(list);
    const index = current.indexOf(targetId);
    if (index < 0) return current;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
};

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
    const [apkFile, setApkFile] = useState(null);
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
    const [botAvatarFile, setBotAvatarFile] = useState(null);
    const [botAvatarPreview, setBotAvatarPreview] = useState('');
    const [botAvatarRemoved, setBotAvatarRemoved] = useState(false);
    const [systemStatus, setSystemStatus] = useState(null);
    const [deviceLoading, setDeviceLoading] = useState(false);
    const [deviceRows, setDeviceRows] = useState([]);
    const [deviceMeta, setDeviceMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [deviceFilters, setDeviceFilters] = useState({
        search: '',
        platform: '',
        apns_environment: '',
        notifications_enabled: '',
        per_page: 20,
    });
    const [users, setUsers] = useState([]);
    const [rotationLeadTypes, setRotationLeadTypes] = useState([]);
    const [rotationParticipants, setRotationParticipants] = useState([]);
    const [testingPush, setTestingPush] = useState(false);
    const [lastTestResult, setLastTestResult] = useState(null);
    const [testForm, setTestForm] = useState({
        user_id: '',
        title: 'Test thông báo',
        body: 'Kiểm tra gửi push từ trang cài đặt.',
    });
    const gscOauthRedirectUrl = useMemo(() => {
        if (typeof window === 'undefined') {
            return '/cai-dat-he-thong/gsc/oauth/callback';
        }
        return `${window.location.origin}/cai-dat-he-thong/gsc/oauth/callback`;
    }, []);

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

    const fetchClientRotationLookups = async () => {
        try {
            const [leadRes, staffRes] = await Promise.all([
                axios.get('/api/v1/lead-types').catch(() => ({ data: [] })),
                axios.get('/api/v1/users/lookup', {
                    params: { purpose: 'client_rotation_staff' },
                }).catch(() => ({ data: { data: [] } })),
            ]);

            setRotationLeadTypes(Array.isArray(leadRes.data) ? leadRes.data : []);
            setRotationParticipants(Array.isArray(staffRes.data?.data) ? staffRes.data.data : []);
        } catch {
            setRotationLeadTypes([]);
            setRotationParticipants([]);
        }
    };

    const toggleRotationSelection = (field, rawId) => {
        const targetId = Number(rawId || 0);
        if (!Number.isInteger(targetId) || targetId <= 0) return;

        setForm((prev) => {
            const current = normalizeIdList(prev[field]);
            const exists = current.includes(targetId);
            const next = exists
                ? current.filter((id) => id !== targetId)
                : [...current, targetId];
            const nextParticipantModes = field === 'client_rotation_participant_user_ids'
                ? normalizeParticipantModeMap(prev.client_rotation_participant_modes, next)
                : prev.client_rotation_participant_modes;

            return {
                ...prev,
                [field]: next,
                client_rotation_participant_modes: nextParticipantModes,
            };
        });
    };

    const toggleRotationParticipantMode = (rawId, field) => {
        const userId = Number(rawId || 0);
        if (!Number.isInteger(userId) || userId <= 0) return;

        setForm((prev) => {
            const selectedIds = normalizeIdList(prev.client_rotation_participant_user_ids);
            if (!selectedIds.includes(userId)) {
                return prev;
            }

            const modes = normalizeParticipantModeMap(prev.client_rotation_participant_modes, selectedIds);
            const current = modes[String(userId)] || {};
            const nextMode = {
                only_receive: field === 'only_receive' ? !Boolean(current.only_receive) : Boolean(current.only_receive),
                only_give: field === 'only_give' ? !Boolean(current.only_give) : Boolean(current.only_give),
            };

            if (!nextMode.only_receive && !nextMode.only_give) {
                delete modes[String(userId)];
            } else {
                modes[String(userId)] = nextMode;
            }

            return {
                ...prev,
                client_rotation_participant_modes: modes,
            };
        });
    };

    const moveRotationLeadTypePriority = (rawId, direction) => {
        const targetId = Number(rawId || 0);
        if (!Number.isInteger(targetId) || targetId <= 0) return;

        setForm((prev) => ({
            ...prev,
            client_rotation_lead_type_ids: moveIdInList(prev.client_rotation_lead_type_ids, targetId, direction),
        }));
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

    const connectGoogleSearchConsole = async () => {
        const clientId = String(form.gsc_client_id || '').trim();
        const clientSecret = String(form.gsc_client_secret || '').trim();
        if (clientId === '' || clientSecret === '') {
            toast.error('Hãy nhập Client ID và Client Secret trước khi bấm Connect.');
            return;
        }

        const baseClientId = String(baseSettings.gsc_client_id || '').trim();
        const baseClientSecret = String(baseSettings.gsc_client_secret || '').trim();
        if (clientId !== baseClientId || clientSecret !== baseClientSecret) {
            try {
                const formData = new FormData();
                formData.append('gsc_client_id', clientId);
                formData.append('gsc_client_secret', clientSecret);

                const res = await axios.post('/api/v1/settings', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                const data = res.data || {};
                const next = initialSettings(data);
                setBaseSettings((prev) => ({
                    ...prev,
                    gsc_client_id: next.gsc_client_id,
                    gsc_client_secret: next.gsc_client_secret,
                    gsc_refresh_token: next.gsc_refresh_token,
                }));
                setForm((prev) => ({
                    ...prev,
                    gsc_client_id: next.gsc_client_id,
                    gsc_client_secret: next.gsc_client_secret,
                    gsc_refresh_token: next.gsc_refresh_token,
                }));
            } catch (e) {
                toast.error(e?.response?.data?.message || 'Không lưu được Client ID/Secret trước khi Connect.');
                return;
            }
        }

        window.location.assign('/cai-dat-he-thong/gsc/oauth/connect');
    };

    const applyBotRows = (rows, preferredId = null) => {
        const list = Array.isArray(rows) ? rows : [];
        setBotRows(list);
        if (list.length === 0) {
            setEditingBotId(null);
            setBotForm(initialBotForm());
            setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
            setModelError('');
            setBotAvatarFile(null);
            setBotAvatarPreview('');
            setBotAvatarRemoved(false);
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
        setBotAvatarFile(null);
        setBotAvatarPreview((selected?.avatar_url || '').toString());
        setBotAvatarRemoved(false);
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
                    per_page: nextFilters.per_page || 20,
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
        setBotAvatarFile(null);
        setBotAvatarPreview('');
        setBotAvatarRemoved(false);
    };

    const selectBot = (bot) => {
        const selectedForm = initialBotForm(bot);
        setEditingBotId(Number(bot.id));
        setBotForm(selectedForm);
        setModelOptions(DEFAULT_GEMINI_MODEL_OPTIONS);
        setModelError('');
        setBotAvatarFile(null);
        setBotAvatarPreview((bot?.avatar_url || '').toString());
        setBotAvatarRemoved(false);
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
            const payload = new FormData();
            payload.append('name', botForm.name.trim());
            payload.append('description', botForm.description?.trim() || '');
            payload.append('provider', botForm.provider || 'gemini');
            payload.append('model', botForm.model.trim());
            payload.append('api_key', botForm.api_key || '');
            payload.append('history_pairs', String(Number(botForm.history_pairs || 8)));
            payload.append('accent_color', botForm.accent_color || '#6366F1');
            payload.append('icon', botForm.icon || '🤖');
            payload.append('sort_order', String(Number(botForm.sort_order || 0)));
            payload.append('is_active', botForm.is_active ? '1' : '0');
            payload.append('is_default', botForm.is_default ? '1' : '0');
            payload.append('system_message_markdown', botForm.system_message_markdown || '');
            payload.append('remove_avatar', botAvatarRemoved ? '1' : '0');
            if (botAvatarFile) {
                payload.append('avatar', botAvatarFile);
            }

            let res;
            if (editingBotId) {
                payload.append('_method', 'PUT');
                res = await axios.post(`/api/v1/chatbot/bots/${editingBotId}`, payload, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            } else {
                res = await axios.post('/api/v1/chatbot/bots', payload, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
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
        if (!botAvatarFile) return undefined;
        const url = URL.createObjectURL(botAvatarFile);
        setBotAvatarPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [botAvatarFile]);

    useEffect(() => {
        const next = initialSettings(props.settings);
        setBaseSettings(next);
        setForm(next);
        setPreview(props.settings?.logo_url || '');
    }, [props.settings]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tab = String(params.get('tab') || '').trim();
        const normalizedTab = LEGACY_TAB_ALIASES[tab] || tab;
        if (normalizedTab && TAB_KEYS.has(normalizedTab)) {
            setActiveTab(normalizedTab);
        }
    }, []);

    useEffect(() => {
        reloadSystemStatus();
        fetchUsers();
        fetchClientRotationLookups();
        loadAdminSettings();
        loadChatbotBots();
        fetchDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const oauthStatus = String(params.get('gsc_oauth') || '').trim();
        if (oauthStatus === '') {
            return;
        }

        setActiveTab('gsc');
        const message = String(params.get('gsc_oauth_message') || '').trim();
        if (oauthStatus === 'success') {
            toast.success(message || 'Đã kết nối Google Search Console thành công.');
        } else {
            toast.error(message || 'Kết nối Google Search Console thất bại.');
        }

        const tab = String(params.get('tab') || '').trim();
        const normalizedTab = LEGACY_TAB_ALIASES[tab] || tab;
        const nextParams = new URLSearchParams();
        if (normalizedTab && TAB_KEYS.has(normalizedTab)) {
            nextParams.set('tab', normalizedTab);
        }

        const nextQuery = nextParams.toString();
        const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
        window.history.replaceState({}, document.title, nextUrl);
        void reloadSystemStatus();
        void loadAdminSettings();
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
            formData.append('gsc_enabled', form.gsc_enabled ? '1' : '0');
            formData.append('gsc_client_id', form.gsc_client_id || '');
            formData.append('gsc_client_secret', form.gsc_client_secret || '');
            formData.append('gsc_refresh_token', form.gsc_refresh_token || '');
            formData.append('gsc_row_limit', String(form.gsc_row_limit ?? 2500));
            formData.append('gsc_data_state', form.gsc_data_state || 'all');
            formData.append('gsc_alert_threshold_percent', String(form.gsc_alert_threshold_percent ?? 30));
            formData.append('gsc_recipes_path_token', form.gsc_recipes_path_token || '/recipes');
            formData.append('gsc_brand_terms', form.gsc_brand_terms || '');
            formData.append('gsc_sync_time', form.gsc_sync_time || '11:17');
            formData.append('client_rotation_enabled', form.client_rotation_enabled ? '1' : '0');
            formData.append('client_rotation_comment_stale_days', String(form.client_rotation_comment_stale_days ?? 3));
            formData.append('client_rotation_opportunity_stale_days', String(form.client_rotation_opportunity_stale_days ?? 30));
            formData.append('client_rotation_contract_stale_days', String(form.client_rotation_contract_stale_days ?? 90));
            formData.append('client_rotation_warning_days', String(form.client_rotation_warning_days ?? 3));
            formData.append('client_rotation_daily_receive_limit', String(form.client_rotation_daily_receive_limit ?? 5));
            formData.append('client_rotation_scope_mode', form.client_rotation_scope_mode || 'global_staff');
            formData.append('client_rotation_same_department_only', (form.client_rotation_scope_mode || 'global_staff') === 'same_department' ? '1' : '0');
            formData.append(
                'client_rotation_lead_type_ids',
                JSON.stringify(normalizeIdList(form.client_rotation_lead_type_ids))
            );
            formData.append(
                'client_rotation_participant_user_ids',
                JSON.stringify(normalizeIdList(form.client_rotation_participant_user_ids))
            );
            formData.append(
                'client_rotation_participant_modes',
                JSON.stringify(
                    normalizeParticipantModeMap(
                        form.client_rotation_participant_modes,
                        form.client_rotation_participant_user_ids
                    )
                )
            );
            formData.append('app_android_apk_url', form.app_android_apk_url || '');
            formData.append('app_ios_testflight_url', form.app_ios_testflight_url || '');
            formData.append('app_release_notes', form.app_release_notes || '');
            formData.append('app_release_version', form.app_release_version || '');
            if (logoFile) {
                formData.append('logo', logoFile);
            }
            if (apkFile) {
                formData.append('app_android_apk_file', apkFile);
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
            setApkFile(null);
            toast.success('Đã cập nhật cài đặt hệ thống.');
            await reloadSystemStatus();
        } catch (e) {
            const validationErrors = e?.response?.data?.errors;
            const firstValidationMessage = validationErrors && typeof validationErrors === 'object'
                ? Object.values(validationErrors).flat().find(Boolean)
                : null;
            toast.error(firstValidationMessage || e?.response?.data?.message || 'Cập nhật thất bại.');
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
        const gscStatus = systemStatus?.gsc || {};
        const pushTokens = systemStatus?.push_tokens || {};
        const notificationConfig = systemStatus?.notification_config || {};

        rows.push({ key: 'Firebase enabled', value: firebase.enabled ? 'Bật' : 'Tắt' });
        rows.push({ key: 'Firebase DB realtime', value: firebase.database_enabled ? 'Sẵn sàng' : 'Chưa cấu hình' });
        rows.push({ key: 'Firebase access token', value: firebase.access_token ? 'OK' : 'Chưa sẵn sàng' });
        rows.push({ key: 'Firebase project', value: firebase.project_id || '—' });
        rows.push({ key: 'GSC enabled', value: gscStatus.enabled ? 'Bật' : 'Tắt' });
        rows.push({ key: 'GSC credential ready', value: gscStatus.credentials_ready ? 'Đủ' : 'Thiếu' });
        rows.push({ key: 'GSC access token', value: gscStatus.access_token_available ? 'Có' : 'Chưa có' });
        rows.push({ key: 'GSC sync time', value: gscStatus.sync_time || form.gsc_sync_time || '11:17' });
        rows.push({ key: 'GSC row limit', value: String(gscStatus.row_limit ?? form.gsc_row_limit ?? 2500) });
        rows.push({ key: 'GSC data state', value: gscStatus.data_state || form.gsc_data_state || 'all' });
        rows.push({ key: 'GSC brand terms', value: String(gscStatus.brand_terms_count ?? 0) });
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
        form.gsc_sync_time,
        form.gsc_row_limit,
        form.gsc_data_state,
        botRows.length,
    ]);

    const firebaseStatus = systemStatus?.firebase || {};
    const pushTokens = systemStatus?.push_tokens || {};
    const pushPlatforms = pushTokens?.by_platform || {};
    const apnsEnvironment = pushTokens?.ios_apns_environment || {};
    const formatDateTime = (value) => {
        return formatVietnamDateTime(value, value ? String(value) : '—');
    };
    const compactToken = (value) => {
        const token = String(value || '');
        if (!token) return '—';
        if (token.length <= 24) return token;
        return `${token.slice(0, 10)}...${token.slice(-10)}`;
    };
    const selectedRotationLeadTypeIds = normalizeIdList(form.client_rotation_lead_type_ids);
    const selectedRotationParticipantIds = normalizeIdList(form.client_rotation_participant_user_ids);
    const rotationScopeMode = form.client_rotation_scope_mode || 'global_staff';
    const selectedRotationParticipantModes = useMemo(
        () => normalizeParticipantModeMap(form.client_rotation_participant_modes, selectedRotationParticipantIds),
        [form.client_rotation_participant_modes, selectedRotationParticipantIds]
    );
    const selectedRotationLeadTypes = useMemo(() => {
        const byId = new Map(
            (rotationLeadTypes || []).map((item) => [Number(item?.id || 0), item])
        );
        return selectedRotationLeadTypeIds
            .map((id) => byId.get(id))
            .filter(Boolean);
    }, [rotationLeadTypes, selectedRotationLeadTypeIds]);
    const orderedRotationLeadTypes = useMemo(() => {
        const selectedIdSet = new Set(selectedRotationLeadTypeIds);
        const selected = selectedRotationLeadTypes;
        const unselected = (rotationLeadTypes || []).filter((item) => !selectedIdSet.has(Number(item?.id || 0)));
        return [...selected, ...unselected];
    }, [rotationLeadTypes, selectedRotationLeadTypeIds, selectedRotationLeadTypes]);

    return (
        <PageContainer
            auth={props.auth}
            title="Cài đặt hệ thống"
            description="Trang cấu hình dành cho administrator. Quản lý thương hiệu, pháp lý, thông báo và kết nối hệ thống."
            stats={[]}
        >
            <div className="lg:col-span-2 space-y-4">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card">
                    <div className="grid gap-3 xl:grid-cols-2">
                        {TAB_GROUPS.map((group) => (
                            <div key={group.key} className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                    {group.label}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {group.tabs.map((tab) => (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                                                activeTab === tab.key
                                                    ? 'bg-primary text-white'
                                                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">Phần setting đang tách riêng</h3>
                            <p className="mt-1 text-xs text-text-muted">
                                Cấu hình chấm công, giờ làm, nhắc chấm công và WiFi đang nằm ở màn riêng để không nhồi quá nhiều vào trang này.
                            </p>
                        </div>
                        <a
                            href={route('attendance.index')}
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Mở cài đặt chấm công & WiFi
                        </a>
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
                                                    {bot.avatar_url ? (
                                                        <img
                                                            src={bot.avatar_url}
                                                            alt={bot.name}
                                                            className="h-8 w-8 shrink-0 rounded-full border border-slate-200 object-cover"
                                                        />
                                                    ) : (
                                                        <span
                                                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                                                            style={{ backgroundColor: `${bot.accent_color || '#6366F1'}1A`, color: bot.accent_color || '#6366F1' }}
                                                        >
                                                            {bot.icon || '🤖'}
                                                        </span>
                                                    )}
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
                                    <div className="space-y-2">
                                        <label className="text-xs text-text-muted">Icon (emoji)</label>
                                        <input
                                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                            value={botForm.icon}
                                            onChange={(e) => setBotForm((s) => ({ ...s, icon: e.target.value }))}
                                            placeholder="🤖"
                                        />
                                        <p className="text-[11px] text-text-muted">Nếu đã upload avatar ảnh thì icon emoji chỉ dùng làm fallback.</p>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs text-text-muted">Avatar chatbot (upload ảnh)</label>
                                        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-3 py-3">
                                            {botAvatarPreview ? (
                                                <img
                                                    src={botAvatarPreview}
                                                    alt="Avatar chatbot"
                                                    className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                                                />
                                            ) : (
                                                <span
                                                    className="inline-flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold"
                                                    style={{ backgroundColor: `${botForm.accent_color || '#6366F1'}1A`, color: botForm.accent_color || '#6366F1' }}
                                                >
                                                    {botForm.icon || '🤖'}
                                                </span>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2">
                                                <label className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                                                    Chọn ảnh
                                                    <input
                                                        type="file"
                                                        accept="image/png,image/jpeg,image/webp"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0] || null;
                                                            setBotAvatarFile(file);
                                                            setBotAvatarRemoved(false);
                                                        }}
                                                    />
                                                </label>
                                                <button
                                                    type="button"
                                                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                    disabled={!botAvatarPreview && !botAvatarFile}
                                                    onClick={() => {
                                                        setBotAvatarFile(null);
                                                        setBotAvatarPreview('');
                                                        setBotAvatarRemoved(true);
                                                    }}
                                                >
                                                    Gỡ avatar
                                                </button>
                                            </div>
                                            <p className="w-full text-[11px] text-text-muted">
                                                Định dạng hỗ trợ: JPG, PNG, WEBP. Kích thước tối đa 5MB.
                                            </p>
                                        </div>
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

                {activeTab === 'gsc' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-3xl">
                                    <h3 className="text-sm font-semibold text-slate-900">Google Search Console theo dự án</h3>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Khi dự án có URL website, trang chi tiết dự án sẽ tự đồng bộ dữ liệu Search Console
                                        (clicks/impressions/biến động) và hiển thị biểu đồ cột + thống kê theo ngày.
                                    </p>
                                </div>
                                <div className="w-full max-w-[280px] lg:w-auto">
                                    <ToggleSwitch
                                        checked={!!form.gsc_enabled}
                                        onChange={(value) => setForm((s) => ({ ...s, gsc_enabled: value }))}
                                        label={form.gsc_enabled ? 'GSC đang bật' : 'GSC đang tắt'}
                                        description="Chỉ administrator mới được bật/tắt và cấu hình."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <h4 className="text-sm font-semibold text-slate-900">Credential OAuth2 (Refresh Token)</h4>
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-xs text-text-muted">Google OAuth Client ID</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.gsc_client_id}
                                        onChange={(e) => setForm((s) => ({ ...s, gsc_client_id: e.target.value }))}
                                        placeholder="xxx.apps.googleusercontent.com"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Google OAuth Client Secret</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.gsc_client_secret}
                                        onChange={(e) => setForm((s) => ({ ...s, gsc_client_secret: e.target.value }))}
                                        placeholder="GOCSPX-..."
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="text-xs text-text-muted">Refresh Token (được dùng để tự refresh access token)</label>
                                <textarea
                                    className="mt-2 min-h-[90px] w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.gsc_refresh_token}
                                    onChange={(e) => setForm((s) => ({ ...s, gsc_refresh_token: e.target.value }))}
                                    placeholder="1//0g...."
                                />
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                    onClick={connectGoogleSearchConsole}
                                >
                                    Connect Google (tự lấy refresh token)
                                </button>
                                <div className="text-xs text-text-muted">
                                    Nếu vừa đổi Client ID/Secret, hệ thống sẽ tự lưu trước khi chuyển sang Google.
                                </div>
                            </div>
                            <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-text-muted">
                                OAuth Redirect URL cần khai báo trong Google Cloud:
                                <div className="mt-1 break-all font-mono text-[11px] text-slate-700">{gscOauthRedirectUrl}</div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <h4 className="text-sm font-semibold text-slate-900">Cấu hình đồng bộ & phân đoạn</h4>
                            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <div>
                                    <label className="text-xs text-text-muted">Giờ đồng bộ mỗi ngày (HH:mm)</label>
                                    <input
                                        type="time"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.gsc_sync_time}
                                        onChange={(e) => setForm((s) => ({ ...s, gsc_sync_time: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Row limit / ngày</label>
                                    <input
                                        type="number"
                                        min={100}
                                        max={25000}
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.gsc_row_limit}
                                        onChange={(e) => setForm((s) => ({ ...s, gsc_row_limit: Number(e.target.value || 2500) }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Data state</label>
                                    <select
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.gsc_data_state}
                                        onChange={(e) => setForm((s) => ({ ...s, gsc_data_state: e.target.value }))}
                                    >
                                        <option value="all">all</option>
                                        <option value="final">final</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Ngưỡng alert % clicks</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.gsc_alert_threshold_percent}
                                        onChange={(e) => setForm((s) => ({ ...s, gsc_alert_threshold_percent: Number(e.target.value || 30) }))}
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-xs text-text-muted">Token path phân đoạn Recipes</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.gsc_recipes_path_token}
                                        onChange={(e) => setForm((s) => ({ ...s, gsc_recipes_path_token: e.target.value }))}
                                        placeholder="/recipes"
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="text-xs text-text-muted">Brand terms (mỗi dòng 1 term hoặc phân tách bằng dấu phẩy)</label>
                                <textarea
                                    className="mt-2 min-h-[120px] w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={form.gsc_brand_terms}
                                    onChange={(e) => setForm((s) => ({ ...s, gsc_brand_terms: e.target.value }))}
                                    placeholder={'an phat glass\nanphatglass'}
                                />
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <h4 className="text-sm font-semibold text-slate-900">Hướng dẫn lấy credential GSC</h4>
                            <div className="mt-3 space-y-2 text-sm text-slate-700">
                                <p>1. Tạo OAuth Client (Web application) trên Google Cloud Console và bật Search Console API.</p>
                                <p>2. Điền `client_id`, `client_secret`, bấm <span className="font-semibold">Lưu cài đặt</span>.</p>
                                <p>3. Bấm <span className="font-semibold">Connect Google (tự lấy refresh token)</span> để hệ thống tự lưu refresh token.</p>
                                <p>4. Scope sử dụng: `https://www.googleapis.com/auth/webmasters.readonly`.</p>
                                <p>5. Thêm URL website vào từng dự án. Khi mở trang chi tiết dự án, hệ thống sẽ tự sync và hiển thị biểu đồ theo ngày.</p>
                            </div>
                            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-text-muted">
                                Trạng thái token hiện tại: {systemStatus?.gsc?.access_token_available ? 'Đã có access token' : 'Chưa có access token'} •
                                Hết hạn lúc: {systemStatus?.gsc?.access_token_expires_at ? formatDateTime(systemStatus.gsc.access_token_expires_at) : '—'}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'notification_channels' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Kênh thông báo hệ thống</h3>
                                    <p className="text-xs text-text-muted mt-1">
                                        Chỉ giữ lại phần bật/tắt kênh gửi và chống gửi trùng để administrator xử lý nhanh.
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
                                    description="Nếu push thất bại thì hệ thống sẽ thử gửi email bằng cấu hình SMTP."
                                />
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-sm font-semibold text-slate-900">Khoảng chống trùng thông báo</div>
                                    <div className="mt-1 text-xs text-text-muted">
                                        Chặn việc bắn lặp cùng một thông báo trong thời gian quá ngắn.
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
                    </div>
                )}

                {activeTab === 'task_notifications' && (
                    <div className="space-y-4">
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
                    </div>
                )}

                {activeTab === 'crm_contract_notifications' && (
                    <div className="space-y-4">
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
                    </div>
                )}

                {activeTab === 'smtp' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-2xl">
                                    <h3 className="text-sm font-semibold text-slate-900">Cấu hình SMTP</h3>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Dùng cho email fallback khi push thất bại. Tách riêng khỏi tab thông báo để admin thao tác mail dễ hơn.
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
                    </div>
                )}

                {activeTab === 'push_testing' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Test bắn thông báo thiết bị</h3>
                                    <p className="text-xs text-text-muted mt-1">
                                        Tách riêng khỏi cấu hình kênh gửi để admin test nhanh mà không phải kéo qua cả trang thông báo.
                                    </p>
                                </div>
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

                {activeTab === 'client_rotation' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-3xl">
                                    <h3 className="text-sm font-semibold text-slate-900">Cơ chế xoay vòng khách hàng không được chăm sóc</h3>
                                    <p className="mt-1 text-xs leading-5 text-text-muted">
                                        Cron chạy lúc <span className="font-semibold text-slate-900">12:00 trưa mỗi ngày</span> để vừa bắn cảnh báo,
                                        vừa điều chuyển khách theo thứ tự ưu tiên <span className="font-semibold text-slate-900">nhiều hợp đồng hơn</span> →
                                        <span className="font-semibold text-slate-900"> nếu bằng nhau thì nhiều cơ hội hơn</span> →
                                        <span className="font-semibold text-slate-900"> nếu đều là lead thuần thì random</span>.
                                        Khách được đếm tuần tự theo 3 tầng: quá {form.client_rotation_contract_stale_days || 0} ngày chưa có hợp đồng mới thì mới bắt đầu đếm {form.client_rotation_opportunity_stale_days || 0} ngày cho cơ hội; quá tiếp tầng cơ hội thì mới bắt đầu đếm {form.client_rotation_comment_stale_days || 0} ngày cho bình luận / ghi chú.
                                    </p>
                                </div>
                                <div className="w-full max-w-[320px]">
                                    <ToggleSwitch
                                        checked={form.client_rotation_enabled}
                                        onChange={(value) => setForm((s) => ({ ...s, client_rotation_enabled: value }))}
                                        label={form.client_rotation_enabled ? 'Đang bật tự động xoay' : 'Đang tắt tự động xoay'}
                                        description="Nếu tắt, cron vẫn có thể chạy nhưng sẽ bỏ qua toàn bộ khách hàng."
                                    />
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <div>
                                    <label className="text-xs text-text-muted">Quá hạn bình luận / ghi chú</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="3650"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.client_rotation_comment_stale_days}
                                        onChange={(e) => setForm((s) => ({
                                            ...s,
                                            client_rotation_comment_stale_days: Number(e.target.value || 1),
                                        }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Quá hạn cơ hội mới</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="3650"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.client_rotation_opportunity_stale_days}
                                        onChange={(e) => setForm((s) => ({
                                            ...s,
                                            client_rotation_opportunity_stale_days: Number(e.target.value || 1),
                                        }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Quá hạn hợp đồng mới</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="3650"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.client_rotation_contract_stale_days}
                                        onChange={(e) => setForm((s) => ({
                                            ...s,
                                            client_rotation_contract_stale_days: Number(e.target.value || 1),
                                        }))}
                                    />
                                </div>
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Nhịp cảnh báo cố định</div>
                                    <div className="mt-2 space-y-1 text-sm text-slate-700">
                                        <div>Chăm sóc: còn 2 ngày thì nhắc mỗi ngày.</div>
                                        <div>Cơ hội: còn 14 ngày thì nhắc mỗi 3 ngày.</div>
                                        <div>Hợp đồng: còn 45 ngày thì nhắc mỗi 7 ngày.</div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Max nhận / người / ngày</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.client_rotation_daily_receive_limit}
                                        onChange={(e) => setForm((s) => ({
                                            ...s,
                                            client_rotation_daily_receive_limit: Number(e.target.value || 1),
                                        }))}
                                    />
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Phạm vi nhận khách</div>
                                <div className="mt-2 grid gap-3 md:grid-cols-3">
                                    {CLIENT_ROTATION_SCOPE_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setForm((s) => ({
                                                ...s,
                                                client_rotation_scope_mode: option.value,
                                                client_rotation_same_department_only: option.value === 'same_department',
                                            }))}
                                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                                                rotationScopeMode === option.value
                                                    ? 'border-primary/40 bg-primary/5'
                                                    : 'border-slate-200/80 bg-white hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="text-sm font-semibold text-slate-900">{option.title}</div>
                                            <div className="mt-1 text-xs text-text-muted">{option.description}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-3">
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Điều kiện xoay</div>
                                    <p className="mt-1 text-sm text-slate-700">
                                        Hệ thống đếm tuần tự: trước hết chờ quá {form.client_rotation_contract_stale_days || 0} ngày không có hợp đồng mới, sau đó mới bắt đầu đếm {form.client_rotation_opportunity_stale_days || 0} ngày không có cơ hội mới, và chỉ khi tầng cơ hội cũng quá hạn thì mới bắt đầu đếm {form.client_rotation_comment_stale_days || 0} ngày không có bình luận/ghi chú mới để quyết định xoay.
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                        Bình luận mới chỉ reset mốc chăm sóc. Cơ hội mới reset cả mốc cơ hội và mốc chăm sóc. Hợp đồng mới reset cả 3 mốc: bình luận, cơ hội và hợp đồng.
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                        Nếu không còn người nhận tự động hợp lệ hoặc tất cả đã hết suất trong ngày, khách đủ điều kiện sẽ được đưa vào kho số để nhân sự nhận thủ công.
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                        Nếu chọn nhiều loại khách, hệ thống sẽ xét theo đúng thứ tự loại khách bạn sắp xếp ở danh sách bên dưới, rồi mới áp dụng rule ưu tiên trong từng loại.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Chọn người nhận</div>
                                    <p className="mt-1 text-sm text-slate-700">
                                        {rotationScopeMode === 'same_department'
                                            ? 'Chỉ xét nhóm nhân sự đã chọn và cùng phòng ban. Hệ thống ưu tiên người có số auto-rotation tích lũy ít nhất, rồi đến số khách đang phụ trách ít nhất, rồi đến số nhận hôm nay ít nhất, cuối cùng random khi bằng nhau.'
                                            : rotationScopeMode === 'balanced_department'
                                                ? 'Cron gom toàn bộ khách đủ điều kiện, chọn phòng ban nhận khác phòng ban hiện tại theo thứ tự: số auto-rotation đổ về phòng ít nhất, rồi tổng tải khách của nhóm nhận ít nhất, rồi số khách phòng ban đó đã nhận hôm nay ít nhất, cuối cùng random. Sau khi chốt phòng ban, hệ thống mới chia đều tiếp cho nhân sự trong phòng đó theo rule hiện tại.'
                                                : 'Xét trên toàn bộ nhân sự đã chọn trong cấu hình. Hệ thống ưu tiên người có số auto-rotation tích lũy ít nhất, rồi đến số khách đang phụ trách ít nhất, rồi đến số nhận hôm nay ít nhất, cuối cùng random khi bằng nhau.'}
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                        Thứ tự đưa khách vào hàng chờ xoay là: số hợp đồng giảm dần, nếu bằng nhau thì số cơ hội giảm dần; nếu cả hai cùng là khách tiềm năng thuần thì random trong nhóm đồng hạng, sau đó mới xét tới mức độ quá hạn và các tie-break còn lại.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Thông báo</div>
                                    <p className="mt-1 text-sm text-slate-700">
                                        Cảnh báo chạy theo từng tầng: chăm sóc còn 2 ngày thì nhắc mỗi ngày, cơ hội còn 14 ngày thì nhắc mỗi 3 ngày, hợp đồng còn 45 ngày thì nhắc mỗi 7 ngày. Khi có hợp đồng mới, bộ đếm sẽ reset theo hợp đồng đó; khi xoay hoặc đổi phụ trách thành công, bộ đếm cũng reset lại từ đầu.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-900">Loại khách áp dụng</h3>
                                        <p className="mt-1 text-xs text-text-muted">
                                            Chỉ các khách thuộc loại được chọn mới đi vào cơ chế xoay vòng. Nếu chọn nhiều loại, thứ tự ở danh sách ưu tiên bên dưới sẽ quyết định loại nào được xét trước.
                                        </p>
                                    </div>
                                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                        Đã chọn {selectedRotationLeadTypeIds.length}
                                    </div>
                                </div>

                                {selectedRotationLeadTypes.length > 0 ? (
                                    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Thứ tự ưu tiên loại khách</div>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    #1 là ưu tiên cao nhất. Trong cùng một loại khách, hệ thống vẫn giữ nguyên rule hiện tại: xét loại khách trước, rồi mới tới số hợp đồng, số cơ hội và các tie-break còn lại.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-3 space-y-2">
                                            {selectedRotationLeadTypes.map((leadType, index) => {
                                                const leadTypeId = Number(leadType?.id || 0);

                                                return (
                                                    <div
                                                        key={`priority-${leadTypeId}`}
                                                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-3"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="inline-flex h-7 min-w-[44px] items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
                                                                    #{index + 1}
                                                                </span>
                                                                <span className="truncate text-sm font-semibold text-slate-900">
                                                                    {leadType?.name || `Loại #${leadTypeId}`}
                                                                </span>
                                                            </div>
                                                            <div className="mt-1 text-xs text-slate-500">
                                                                ID: {leadTypeId}{leadType?.color_hex ? ` • ${leadType.color_hex}` : ''}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => moveRotationLeadTypePriority(leadTypeId, -1)}
                                                                disabled={index === 0}
                                                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                                                aria-label={`Đẩy ${leadType?.name || `loại ${leadTypeId}`} lên ưu tiên cao hơn`}
                                                            >
                                                                ↑
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => moveRotationLeadTypePriority(leadTypeId, 1)}
                                                                disabled={index === selectedRotationLeadTypes.length - 1}
                                                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                                                aria-label={`Đẩy ${leadType?.name || `loại ${leadTypeId}`} xuống ưu tiên thấp hơn`}
                                                            >
                                                                ↓
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                                    {orderedRotationLeadTypes.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                            Chưa tải được danh sách loại khách.
                                        </div>
                                    ) : orderedRotationLeadTypes.map((leadType) => {
                                        const leadTypeId = Number(leadType.id || 0);
                                        const checked = selectedRotationLeadTypeIds.includes(leadTypeId);
                                        const checkedIndex = selectedRotationLeadTypeIds.indexOf(leadTypeId);

                                        return (
                                            <label
                                                key={leadTypeId}
                                                className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                                                    checked
                                                        ? 'border-primary/30 bg-primary/5'
                                                        : 'border-slate-200/80 bg-white hover:bg-slate-50'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                                    checked={checked}
                                                    onChange={() => toggleRotationSelection('client_rotation_lead_type_ids', leadTypeId)}
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm font-semibold text-slate-900">{leadType.name || `Loại #${leadTypeId}`}</div>
                                                        {checked ? (
                                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                                                Ưu tiên #{checkedIndex + 1}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <div className="mt-1 text-xs text-text-muted">
                                                        ID: {leadTypeId}{leadType.color_hex ? ` • ${leadType.color_hex}` : ''}
                                                    </div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-900">Nhân sự tham gia xoay vòng</h3>
                                        <p className="mt-1 text-xs text-text-muted">
                                            Chỉ quản lý/nhân viên đang hoạt động mới hợp lệ. Người phụ trách hiện tại và người nhận đều phải nằm trong danh sách này.
                                        </p>
                                    </div>
                                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                        Đã chọn {selectedRotationParticipantIds.length}
                                    </div>
                                </div>

                                <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                                    {rotationParticipants.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                            Chưa tải được danh sách nhân sự xoay vòng.
                                        </div>
                                    ) : rotationParticipants.map((user) => {
                                        const userId = Number(user.id || 0);
                                        const checked = selectedRotationParticipantIds.includes(userId);
                                        const mode = participantRotationMode(selectedRotationParticipantModes, userId);

                                        return (
                                            <div
                                                key={userId}
                                                className={`rounded-2xl border px-4 py-3 transition ${
                                                    checked
                                                        ? 'border-primary/30 bg-primary/5'
                                                        : 'border-slate-200/80 bg-white hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <input
                                                        type="checkbox"
                                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                                        checked={checked}
                                                        onChange={() => toggleRotationSelection('client_rotation_participant_user_ids', userId)}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <div className="text-sm font-semibold text-slate-900">{user.name || `User #${userId}`}</div>
                                                            {checked ? (
                                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                                                    {mode.label}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <div className="mt-1 text-xs text-text-muted">
                                                            {ROLE_LABELS[String(user.role || '').toLowerCase()] || user.role || 'Nhân sự'}
                                                            {user.email ? ` • ${user.email}` : ''}
                                                        </div>
                                                        <div className="mt-1 text-xs text-text-muted">
                                                            User ID: {userId}{user.department_id ? ` • Phòng ban #${user.department_id}` : ''}
                                                        </div>
                                                        {checked ? (
                                                            <>
                                                                <div className="mt-3 flex flex-wrap gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            toggleRotationParticipantMode(userId, 'only_receive');
                                                                        }}
                                                                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                                                            mode.onlyReceive
                                                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                                                        }`}
                                                                    >
                                                                        Chỉ nhận vào
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            toggleRotationParticipantMode(userId, 'only_give');
                                                                        }}
                                                                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                                                            mode.onlyGive
                                                                                ? 'border-amber-300 bg-amber-50 text-amber-700'
                                                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                                                        }`}
                                                                    >
                                                                        Chỉ cho đi
                                                                    </button>
                                                                </div>
                                                                <div className="mt-2 text-xs text-slate-500">
                                                                    {mode.hint}
                                                                </div>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
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

                {activeTab === 'mobile_app' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                            <h3 className="text-sm font-semibold text-slate-900">Phân phối ứng dụng mobile</h3>
                            <p className="mt-1 text-xs text-text-muted">
                                Cấu hình một nơi chung để nhân sự tải APK Android hoặc mở TestFlight iOS từ web.
                            </p>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-xs text-text-muted">Phiên bản phát hành</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.app_release_version}
                                        onChange={(e) => setForm((s) => ({ ...s, app_release_version: e.target.value }))}
                                        placeholder="Ví dụ: 1.0.8"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Link TestFlight iOS</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.app_ios_testflight_url}
                                        onChange={(e) => setForm((s) => ({ ...s, app_ios_testflight_url: e.target.value }))}
                                        placeholder="https://testflight.apple.com/join/..."
                                    />
                                </div>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-xs text-text-muted">Link APK Android</label>
                                    <input
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.app_android_apk_url}
                                        onChange={(e) => setForm((s) => ({ ...s, app_android_apk_url: e.target.value }))}
                                        placeholder="https://jobs.clickon.vn/storage/app-builds/..."
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Upload file APK</label>
                                    <div className="mt-2 flex items-center gap-3">
                                        <label className="flex-1 cursor-pointer rounded-2xl border border-dashed border-slate-200/80 px-3 py-2 text-sm text-text-muted hover:border-primary">
                                            {apkFile ? apkFile.name : 'Chọn file .apk'}
                                            <input
                                                type="file"
                                                accept=".apk,application/vnd.android.package-archive"
                                                className="hidden"
                                                onChange={(e) => setApkFile(e.target.files?.[0] || null)}
                                            />
                                        </label>
                                        {form.app_android_apk_url ? (
                                            <a
                                                href={form.app_android_apk_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="rounded-2xl border border-slate-200/80 px-4 py-2 text-sm font-semibold text-slate-700"
                                            >
                                                Mở link
                                            </a>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4">
                                <label className="text-xs text-text-muted">Ghi chú phát hành</label>
                                <textarea
                                    className="mt-2 min-h-[180px] w-full rounded-2xl border border-slate-200/80 px-3 py-3 text-sm"
                                    value={form.app_release_notes}
                                    onChange={(e) => setForm((s) => ({ ...s, app_release_notes: e.target.value }))}
                                    placeholder={'Ví dụ:\n- Sửa lỗi chấm công Wi-Fi\n- Cập nhật biểu đồ dashboard\n- Tối ưu giao diện hợp đồng'}
                                />
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

                            <div className="border-t border-slate-100 px-4 py-3">
                                <PaginationControls
                                    page={deviceMeta.current_page}
                                    lastPage={deviceMeta.last_page}
                                    total={deviceMeta.total}
                                    perPage={deviceFilters.per_page}
                                    label="thiết bị"
                                    loading={deviceLoading}
                                    className="mt-0 border-0 bg-transparent px-0 py-0"
                                    onPageChange={(page) => fetchDevices(page, deviceFilters)}
                                    onPerPageChange={(perPage) => {
                                        const next = { ...deviceFilters, per_page: perPage };
                                        setDeviceFilters(next);
                                        fetchDevices(1, next);
                                    }}
                                />
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
                                setApkFile(null);
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
