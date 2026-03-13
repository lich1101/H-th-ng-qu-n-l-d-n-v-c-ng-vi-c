import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';

export default function FacebookPages(props) {
    const connected = Boolean(props.facebookConnected);
    const expiresAt = props.facebookTokenExpiresAt;
    const [pages, setPages] = useState([]);
    const [token, setToken] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [showManual, setShowManual] = useState(false);

    const fetchPages = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/facebook/pages');
            setPages(res.data || []);
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Không tải được danh sách Page.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPages();
    }, []);

    const syncPages = async () => {
        setSyncing(true);
        setMessage('');
        try {
            const payload = token.trim()
                ? { user_access_token: token.trim() }
                : {};
            const res = await axios.post('/api/v1/facebook/pages/sync', payload);
            setPages(res.data?.pages || []);
            setMessage(res.data?.message || 'Đã đồng bộ danh sách Page.');
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Đồng bộ thất bại.');
        } finally {
            setSyncing(false);
        }
    };

    const subscribePage = async (pageId) => {
        setMessage('');
        try {
            const res = await axios.post(`/api/v1/facebook/pages/${pageId}/subscribe`);
            setMessage(res.data?.message || 'Đã kích hoạt webhook.');
            fetchPages();
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Kích hoạt webhook thất bại.');
        }
    };

    const unsubscribePage = async (pageId) => {
        if (!window.confirm('Bạn có chắc muốn hủy kích hoạt Page này?')) {
            return;
        }
        setMessage('');
        try {
            const res = await axios.post(`/api/v1/facebook/pages/${pageId}/unsubscribe`);
            setMessage(res.data?.message || 'Đã hủy kích hoạt webhook.');
            fetchPages();
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Hủy kích hoạt thất bại.');
        }
    };

    const stats = useMemo(() => {
        const total = pages.length;
        const subscribed = pages.filter((p) => p.is_subscribed).length;
        return [
            { label: 'Page đã kết nối', value: total },
            { label: 'Webhook hoạt động', value: subscribed },
        ];
    }, [pages]);

    const handleConnect = () => {
        window.location.href = route('facebook.login');
    };

    const handleDisconnect = async () => {
        setMessage('');
        try {
            await axios.post(route('facebook.disconnect'));
            setMessage('Đã ngắt kết nối Facebook.');
            fetchPages();
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Không thể ngắt kết nối.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Facebook Pages"
            description="Kết nối Page Facebook để tự động tạo khách hàng tiềm năng từ tin nhắn."
            stats={stats}
        >
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <h3 className="font-semibold text-slate-900">Kết nối Page</h3>
                    <p className="text-sm text-text-muted mt-1">
                        Đăng nhập Facebook để lấy danh sách Page quản lý.
                    </p>
                    <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-slate-200/80 p-4">
                            <p className="text-xs text-text-muted">Trạng thái</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                                {connected ? 'Đã kết nối Facebook Login' : 'Chưa kết nối'}
                            </p>
                            {connected && expiresAt && (
                                <p className="text-xs text-text-muted mt-1">
                                    Hết hạn: {new Date(expiresAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleConnect}
                            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition"
                        >
                            Đăng nhập Facebook
                        </button>
                        <button
                            type="button"
                            onClick={syncPages}
                            disabled={syncing}
                            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
                        >
                            {syncing ? 'Đang đồng bộ...' : 'Đồng bộ danh sách Page'}
                        </button>
                        {connected && (
                            <button
                                type="button"
                                onClick={handleDisconnect}
                                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                            >
                                Ngắt kết nối
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowManual((prev) => !prev)}
                            className="text-xs text-slate-500 underline"
                        >
                            {showManual ? 'Ẩn nhập token thủ công' : 'Nhập token thủ công (tuỳ chọn)'}
                        </button>
                        {showManual && (
                            <div className="space-y-2">
                                <input
                                    className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                                    placeholder="User Access Token"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                />
                            </div>
                        )}
                        {message && (
                            <p className="text-sm text-emerald-600">{message}</p>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Danh sách Page</h3>
                        <button
                            type="button"
                            onClick={fetchPages}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                        >
                            Làm mới
                        </button>
                    </div>
                    {loading ? (
                        <p className="text-sm text-text-muted">Đang tải...</p>
                    ) : pages.length === 0 ? (
                        <p className="text-sm text-text-muted">Chưa có Page nào được kết nối.</p>
                    ) : (
                        <div className="space-y-3">
                            {pages.map((page) => (
                                <div key={page.id} className="rounded-2xl border border-slate-200/80 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="font-semibold text-slate-900">{page.name}</p>
                                        <p className="text-xs text-text-muted">Page ID: {page.page_id}</p>
                                        {page.category && (
                                            <p className="text-xs text-text-muted">Category: {page.category}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${page.is_subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {page.is_subscribed ? 'Webhook hoạt động' : 'Chưa subscribe'}
                                        </span>
                                        {!page.is_subscribed && (
                                            <button
                                                type="button"
                                                onClick={() => subscribePage(page.id)}
                                                className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition"
                                            >
                                                Kích hoạt
                                            </button>
                                        )}
                                        {page.is_subscribed && (
                                            <button
                                                type="button"
                                                onClick={() => unsubscribePage(page.id)}
                                                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                                            >
                                                Hủy kích hoạt
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageContainer>
    );
}
