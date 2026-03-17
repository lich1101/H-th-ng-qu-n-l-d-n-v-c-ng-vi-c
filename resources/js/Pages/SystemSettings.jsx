import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const TABS = [
    { key: 'branding', label: 'Thương hiệu' },
    { key: 'contact', label: 'Liên hệ & pháp lý' },
    { key: 'notifications', label: 'Thông báo thiết bị' },
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
    notifications_dedupe_seconds: settings?.notifications_dedupe_seconds ?? 45,
    meeting_reminder_minutes_before: settings?.meeting_reminder_minutes_before ?? 60,
    task_item_progress_reminder_enabled: settings?.task_item_progress_reminder_enabled ?? true,
});

export default function SystemSettings(props) {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState('branding');
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState(initialSettings(props.settings));
    const [logoFile, setLogoFile] = useState(null);
    const [preview, setPreview] = useState(props.settings?.logo_url || '');
    const [showPreview, setShowPreview] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [systemStatus, setSystemStatus] = useState(null);
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

    useEffect(() => {
        if (!logoFile) return undefined;
        const url = URL.createObjectURL(logoFile);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [logoFile]);

    useEffect(() => {
        setForm(initialSettings(props.settings));
        setPreview(props.settings?.logo_url || '');
    }, [props.settings]);

    useEffect(() => {
        reloadSystemStatus();
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            formData.append('notifications_dedupe_seconds', String(form.notifications_dedupe_seconds ?? 45));
            formData.append('meeting_reminder_minutes_before', String(form.meeting_reminder_minutes_before ?? 60));
            formData.append('task_item_progress_reminder_enabled', form.task_item_progress_reminder_enabled ? '1' : '0');
            if (logoFile) {
                formData.append('logo', logoFile);
            }

            const res = await axios.post('/api/v1/settings', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const data = res.data || {};
            setForm(initialSettings(data));
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
        rows.push({ key: 'Meeting reminder', value: `${notificationConfig?.meeting_reminder_minutes_before ?? form.meeting_reminder_minutes_before ?? 60} phút trước giờ họp` });
        rows.push({ key: 'Task item late reminder', value: notificationConfig?.task_item_progress_reminder_enabled ? 'Bật' : 'Tắt' });
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
    }, [systemStatus, form.notifications_dedupe_seconds, form.meeting_reminder_minutes_before]);

    return (
        <PageContainer
            auth={props.auth}
            title="Cài đặt hệ thống"
            description="Trang cấu hình dành cho admin. Quản lý thương hiệu, thông tin pháp lý và thông báo thiết bị."
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

                {activeTab === 'notifications' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                            <h3 className="text-sm font-semibold text-slate-900">Cài đặt thông báo thiết bị</h3>
                            <p className="text-xs text-text-muted mt-1">Bật/tắt kênh gửi, chống trùng và lịch nhắc tự động.</p>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <label className="flex items-center justify-between rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                                    <span>Bật push notification</span>
                                    <input
                                        type="checkbox"
                                        checked={!!form.notifications_push_enabled}
                                        onChange={(e) => setForm((s) => ({ ...s, notifications_push_enabled: e.target.checked }))}
                                    />
                                </label>
                                <label className="flex items-center justify-between rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                                    <span>Bật thông báo trong app/web</span>
                                    <input
                                        type="checkbox"
                                        checked={!!form.notifications_in_app_enabled}
                                        onChange={(e) => setForm((s) => ({ ...s, notifications_in_app_enabled: e.target.checked }))}
                                    />
                                </label>
                                <label className="flex items-center justify-between rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                                    <span>Bật email fallback</span>
                                    <input
                                        type="checkbox"
                                        checked={!!form.notifications_email_fallback_enabled}
                                        onChange={(e) => setForm((s) => ({ ...s, notifications_email_fallback_enabled: e.target.checked }))}
                                    />
                                </label>
                                <label className="flex items-center justify-between rounded-2xl border border-slate-200/80 px-4 py-3 text-sm">
                                    <span>Bật nhắc đầu việc chậm tiến độ</span>
                                    <input
                                        type="checkbox"
                                        checked={!!form.task_item_progress_reminder_enabled}
                                        onChange={(e) => setForm((s) => ({ ...s, task_item_progress_reminder_enabled: e.target.checked }))}
                                    />
                                </label>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-xs text-text-muted">Khoảng chống trùng thông báo (giây)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="3600"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.notifications_dedupe_seconds}
                                        onChange={(e) => setForm((s) => ({ ...s, notifications_dedupe_seconds: Number(e.target.value || 0) }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-muted">Nhắc lịch họp trước (phút)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="1440"
                                        className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                        value={form.meeting_reminder_minutes_before}
                                        onChange={(e) => setForm((s) => ({ ...s, meeting_reminder_minutes_before: Number(e.target.value || 60) }))}
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

                            <div className="mt-5 rounded-2xl border border-slate-200/80">
                                <div className="border-b border-slate-200/80 px-4 py-3 text-sm font-semibold text-slate-900">
                                    Danh sách config thông báo toàn hệ thống
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {configRows.map((row) => (
                                        <div key={row.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                                            <span className="text-slate-500">{row.key}</span>
                                            <span className="font-semibold text-slate-900">{row.value || '—'}</span>
                                        </div>
                                    ))}
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
                                setForm(initialSettings(props.settings));
                                setLogoFile(null);
                                setPreview(props.settings?.logo_url || '');
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
