import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const createDefaultPayload = () => ({
    chatbot: {
        enabled: false,
        provider: 'gemini',
        model: '',
        history_pairs: 8,
        configured: false,
    },
    state: {
        is_processing: false,
        stop_requested: false,
        current_message_id: null,
        last_error: null,
    },
    messages: [],
    queue: [],
    bots: [],
    bot: null,
    server_time: null,
});

const normalizePayload = (raw) => {
    const defaults = createDefaultPayload();
    const incoming = raw && typeof raw === 'object' ? raw : {};
    return {
        ...defaults,
        ...incoming,
        chatbot: {
            ...defaults.chatbot,
            ...(incoming.chatbot && typeof incoming.chatbot === 'object' ? incoming.chatbot : {}),
        },
        state: {
            ...defaults.state,
            ...(incoming.state && typeof incoming.state === 'object' ? incoming.state : {}),
        },
        messages: Array.isArray(incoming.messages) ? incoming.messages : [],
        queue: Array.isArray(incoming.queue) ? incoming.queue : [],
        bots: Array.isArray(incoming.bots) ? incoming.bots : [],
    };
};

const STATUS_LABELS = {
    queued: 'Đang chờ',
    processing: 'Đang xử lý',
    completed: 'Hoàn tất',
    failed: 'Lỗi',
    cancelled: 'Đã dừng',
};

const formatTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
    });
};

const nameInitial = (name, fallback = 'U') => {
    if (!name) return fallback;
    const text = String(name).trim();
    if (!text) return fallback;
    return text.charAt(0).toUpperCase();
};

export default function ChatbotAssistant({ auth }) {
    const toast = useToast();
    const scrollRef = useRef(null);
    const readBotIdFromUrl = () => {
        if (typeof window === 'undefined') return null;
        const raw = new URLSearchParams(window.location.search).get('bot_id');
        if (!raw) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [input, setInput] = useState('');
    const [selectedBotId, setSelectedBotId] = useState(readBotIdFromUrl());
    const [payload, setPayload] = useState(createDefaultPayload());
    const [queueDrafts, setQueueDrafts] = useState({});

    const fetchMessages = async ({ silent = false, botId = selectedBotId } = {}) => {
        if (!silent) setLoading(true);
        try {
            const res = await axios.get('/api/v1/chatbot/messages', {
                params: {
                    limit: 220,
                    ...(botId ? { bot_id: botId } : {}),
                },
            });
            const data = normalizePayload(res.data);
            setPayload(data);
            const resolvedBotId = Number(data?.bot?.id || 0);
            if (resolvedBotId > 0 && resolvedBotId !== selectedBotId) {
                setSelectedBotId(resolvedBotId);
            }
            setQueueDrafts((prev) => {
                const next = { ...prev };
                data.queue.forEach((item) => {
                    if (next[item.id] === undefined) {
                        next[item.id] = item.content || '';
                    }
                });
                Object.keys(next).forEach((id) => {
                    if (!data.queue.some((row) => String(row.id) === String(id))) {
                        delete next[id];
                    }
                });
                return next;
            });
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được hội thoại chatbot.');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        fetchMessages({ botId: selectedBotId });
        const timer = setInterval(() => {
            fetchMessages({ silent: true, botId: selectedBotId });
        }, 3000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBotId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (selectedBotId) {
            url.searchParams.set('bot_id', String(selectedBotId));
        } else {
            url.searchParams.delete('bot_id');
        }
        window.history.replaceState({}, '', url.toString());
    }, [selectedBotId]);

    useEffect(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [payload.messages.length]);

    const isProcessing = !!payload?.state?.is_processing;
    const chatbotEnabled = !!payload?.chatbot?.enabled;
    const chatbotConfigured = !!payload?.chatbot?.configured;
    const bots = payload.bots;
    const selectedBot = payload?.bot || null;
    const messages = payload.messages;
    const queue = payload.queue;
    const inputTrimmed = input.trim();
    const showStopButton = isProcessing && inputTrimmed.length === 0;
    const queueCount = queue.length;
    const assistantAvatar = selectedBot?.icon || 'AI';
    const currentUserName = auth?.user?.name || 'Bạn';

    const canSend = chatbotEnabled && chatbotConfigured && inputTrimmed.length > 0;
    const canStop = chatbotEnabled && chatbotConfigured && isProcessing;

    const statusTone = (status) => {
        switch (status) {
            case 'failed':
                return 'text-rose-700 bg-rose-100';
            case 'cancelled':
                return 'text-slate-600 bg-slate-200';
            case 'processing':
                return 'text-blue-700 bg-blue-100';
            case 'queued':
                return 'text-amber-700 bg-amber-100';
            default:
                return 'text-emerald-700 bg-emerald-100';
        }
    };

    const handleSend = async () => {
        if (!canSend || sending) return;

        setSending(true);
        try {
            const res = await axios.post('/api/v1/chatbot/messages', {
                content: inputTrimmed,
                ...(selectedBotId ? { bot_id: selectedBotId } : {}),
            });
            const data = normalizePayload(res.data);
            setPayload(data);
            setInput('');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không gửi được câu hỏi.');
        } finally {
            setSending(false);
        }
    };

    const handleStop = async () => {
        if (!canStop || stopping) return;

        setStopping(true);
        try {
            const res = await axios.post('/api/v1/chatbot/stop', {
                ...(selectedBotId ? { bot_id: selectedBotId } : {}),
            });
            setPayload(normalizePayload(res.data));
            toast.success('Đã gửi yêu cầu dừng phản hồi hiện tại.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không gửi được yêu cầu dừng.');
        } finally {
            setStopping(false);
        }
    };

    const updateQueueItem = async (messageId) => {
        const content = String(queueDrafts[messageId] ?? '').trim();
        if (!content) {
            toast.error('Nội dung hàng chờ không được để trống.');
            return;
        }

        try {
            const res = await axios.put(`/api/v1/chatbot/messages/${messageId}`, {
                content,
            });
            setPayload(normalizePayload(res.data));
            toast.success('Đã cập nhật nội dung hàng chờ.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không cập nhật được hàng chờ.');
        }
    };

    const deleteQueueItem = async (messageId) => {
        try {
            const res = await axios.delete(`/api/v1/chatbot/messages/${messageId}`);
            setPayload(normalizePayload(res.data));
            setQueueDrafts((prev) => {
                const next = { ...prev };
                delete next[messageId];
                return next;
            });
            toast.success('Đã xoá tin nhắn khỏi hàng chờ.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không xoá được tin nhắn hàng chờ.');
        }
    };

    const queueDescription = useMemo(() => {
        if (!isProcessing) return 'Không có phiên trả lời đang chạy.';
        if (inputTrimmed.length > 0) {
            return 'Đang trả lời. Nếu bấm gửi lúc này, tin nhắn sẽ vào hàng chờ.';
        }
        return 'Đang trả lời. Bạn có thể bấm Dừng để ngắt phản hồi hiện tại.';
    }, [isProcessing, inputTrimmed.length]);

    return (
        <PageContainer
            auth={auth}
            title="Trợ lý AI"
            description="Trợ lý nội bộ dùng Gemini. Chat theo từng người dùng, có hàng chờ và dừng phản hồi."
            stats={[]}
        >
            <div className="lg:col-span-2 space-y-5">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold text-slate-900">Trạng thái chatbot</h3>
                            <p className="mt-1 text-sm text-text-muted">
                                Bot: <strong>{selectedBot?.name || 'Chưa chọn bot'}</strong> • Provider: <strong>{selectedBot?.provider || payload?.chatbot?.provider || 'gemini'}</strong> • Model:{' '}
                                <strong>{selectedBot?.model || 'chưa cấu hình'}</strong> • Ngữ cảnh: <strong>{selectedBot?.history_pairs || payload?.chatbot?.history_pairs || 0}</strong> cặp Q&A.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chatbotEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {chatbotEnabled ? 'Đang bật' : 'Đang tắt'}
                                </span>
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chatbotConfigured ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {chatbotConfigured ? 'Đã cấu hình key/model' : 'Thiếu key/model'}
                                </span>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                    Hàng chờ: {queueCount}
                                </span>
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isProcessing ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                                    {isProcessing ? 'Đang phản hồi' : 'Rảnh'}
                                </span>
                            </div>
                        </div>

                        <div className="w-full max-w-[320px]">
                            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
                                Chọn chatbot
                            </label>
                            <select
                                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-primary focus:outline-none"
                                value={selectedBot?.id || selectedBotId || ''}
                                onChange={(e) => {
                                    const nextId = Number(e.target.value || 0);
                                    setSelectedBotId(Number.isFinite(nextId) && nextId > 0 ? nextId : null);
                                }}
                            >
                                {bots.length === 0 ? (
                                    <option value="">Chưa có chatbot</option>
                                ) : null}
                                {bots.map((bot) => (
                                    <option key={bot.id} value={bot.id}>
                                        {bot.icon || '🤖'} {bot.name}
                                        {bot.is_default ? ' (mặc định)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {!chatbotEnabled || !chatbotConfigured ? (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            Chatbot chưa sẵn sàng. Administrator vào <strong>Cài đặt hệ thống</strong> để bật chatbot, nhập Gemini API key, model và system message.
                        </div>
                    ) : null}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
                    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
                        <div className="border-b border-slate-200/80 px-5 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-semibold text-slate-900">Hội thoại của bạn</h3>
                                    <p className="mt-1 text-sm text-text-muted">{queueDescription}</p>
                                </div>
                                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${isProcessing ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {isProcessing ? 'Đang trả lời tuần tự' : 'Sẵn sàng'}
                                </div>
                            </div>
                        </div>

                        <div
                            ref={scrollRef}
                            className="h-[56vh] min-h-[360px] max-h-[620px] space-y-4 overflow-y-auto bg-slate-50/60 px-5 py-5"
                        >
                            {loading ? (
                                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                                    Đang tải hội thoại...
                                </div>
                            ) : null}

                            {!loading && messages.length === 0 ? (
                                <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                                    Chưa có hội thoại. Hãy gửi câu hỏi đầu tiên.
                                </div>
                            ) : null}

                            {messages.map((message) => {
                                const isUser = message.role === 'user';
                                const displayName = isUser ? currentUserName : (selectedBot?.name || 'Trợ lý AI');
                                const avatarLabel = isUser ? nameInitial(currentUserName, 'U') : assistantAvatar;
                                return (
                                    <div
                                        key={message.id}
                                        className={`chat-fade flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {!isUser ? (
                                            <div className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm">
                                                {avatarLabel}
                                            </div>
                                        ) : null}

                                        <div
                                            className={`max-w-[min(88%,760px)] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                                isUser
                                                    ? 'bg-primary text-white'
                                                    : 'border border-slate-200/80 bg-white text-slate-900'
                                            }`}
                                        >
                                            <div className={`mb-1 text-[11px] font-semibold ${isUser ? 'text-white/85' : 'text-slate-500'}`}>
                                                {displayName}
                                            </div>
                                            <div className="whitespace-pre-wrap break-words leading-6">
                                                {message.content}
                                            </div>
                                            <div className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] ${isUser ? 'text-white/85' : 'text-slate-500'}`}>
                                                <span>{formatTime(message.created_at)}</span>
                                                <span className={`rounded-full px-2 py-0.5 font-semibold ${isUser ? 'bg-white/20 text-white' : statusTone(message.status)}`}>
                                                    {STATUS_LABELS[message.status] || message.status}
                                                </span>
                                            </div>
                                            {message.error_message ? (
                                                <div className={`mt-2 text-xs ${isUser ? 'text-white/90' : 'text-rose-600'}`}>
                                                    {message.error_message}
                                                </div>
                                            ) : null}
                                        </div>

                                        {isUser ? (
                                            <div className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary shadow-sm">
                                                {avatarLabel}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="border-t border-slate-200/80 px-5 py-4">
                            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
                                Tin nhắn mới
                            </label>
                            <textarea
                                rows={4}
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2.5 text-sm leading-6 focus:border-primary focus:outline-none"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Nhập câu hỏi cho trợ lý AI..."
                                disabled={!chatbotEnabled || !chatbotConfigured}
                            />
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs text-text-muted">
                                    {isProcessing ? `Đang xử lý ${payload?.state?.current_message_id ? `#${payload.state.current_message_id}` : 'hội thoại hiện tại'}.` : 'Sẵn sàng nhận câu hỏi mới.'}
                                </div>
                                <button
                                    type="button"
                                    onClick={showStopButton ? handleStop : handleSend}
                                    disabled={showStopButton ? (!canStop || stopping) : (!canSend || sending)}
                                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                        showStopButton ? 'bg-rose-500 hover:bg-rose-600' : 'bg-primary hover:brightness-95'
                                    }`}
                                >
                                    {showStopButton
                                        ? (stopping ? 'Đang dừng...' : 'Dừng')
                                        : (sending
                                            ? 'Đang gửi...'
                                            : (isProcessing ? 'Gửi vào hàng chờ' : 'Gửi'))}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-slate-900">Hàng chờ</h3>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                    {queueCount}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-text-muted">
                                Bạn có thể sửa nội dung trước khi chatbot xử lý.
                            </p>

                            <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                {queueCount === 0 ? (
                                    <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                        Không có tin nhắn trong hàng chờ.
                                    </div>
                                ) : null}

                                {queue.map((item) => (
                                    <div key={item.id} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <div className="text-[11px] font-semibold text-slate-600">#{item.id}</div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-slate-500">
                                                    {formatDateTime(item.created_at)}
                                                </span>
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(item.status)}`}>
                                                    {STATUS_LABELS[item.status] || item.status}
                                                </span>
                                            </div>
                                        </div>
                                        <textarea
                                            rows={3}
                                            className="w-full rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 text-sm focus:border-primary focus:outline-none"
                                            value={queueDrafts[item.id] ?? item.content ?? ''}
                                            onChange={(e) => setQueueDrafts((prev) => ({
                                                ...prev,
                                                [item.id]: e.target.value,
                                            }))}
                                        />
                                        <div className="mt-2 flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
                                                onClick={() => updateQueueItem(item.id)}
                                            >
                                                Lưu
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                                                onClick={() => deleteQueueItem(item.id)}
                                            >
                                                Xoá
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                            <h3 className="text-sm font-semibold text-slate-900">Quy tắc vận hành</h3>
                            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-600">
                                <li>Mỗi tài khoản có lịch sử hội thoại riêng, không trộn dữ liệu với user khác.</li>
                                <li>Mỗi bot tách lịch sử riêng theo từng user + bot, tránh lẫn ngữ cảnh giữa các trợ lý.</li>
                                <li>System message dạng Markdown do administrator quản lý tại Cài đặt hệ thống.</li>
                                <li>Lượt chat xử lý tuần tự 1-1 để đảm bảo ngữ cảnh ổn định.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
