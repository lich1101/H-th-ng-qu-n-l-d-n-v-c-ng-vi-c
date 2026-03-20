import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

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
    const [payload, setPayload] = useState({
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
        server_time: null,
    });
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
            const data = res.data || {};
            setPayload(data);
            const resolvedBotId = Number(data?.bot?.id || 0);
            if (resolvedBotId > 0 && resolvedBotId !== selectedBotId) {
                setSelectedBotId(resolvedBotId);
            }
            setQueueDrafts((prev) => {
                const next = { ...prev };
                (data.queue || []).forEach((item) => {
                    if (next[item.id] === undefined) {
                        next[item.id] = item.content || '';
                    }
                });
                Object.keys(next).forEach((id) => {
                    if (!(data.queue || []).some((row) => String(row.id) === String(id))) {
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
    const bots = Array.isArray(payload?.bots) ? payload.bots : [];
    const selectedBot = payload?.bot || null;
    const inputTrimmed = input.trim();
    const showStopButton = isProcessing && inputTrimmed.length === 0;

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
            const data = res.data || {};
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
            setPayload(res.data || payload);
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
            setPayload(res.data || payload);
            toast.success('Đã cập nhật nội dung hàng chờ.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không cập nhật được hàng chờ.');
        }
    };

    const deleteQueueItem = async (messageId) => {
        try {
            const res = await axios.delete(`/api/v1/chatbot/messages/${messageId}`);
            setPayload(res.data || payload);
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
            <div className="lg:col-span-2 space-y-4">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">Trạng thái chatbot</h3>
                            <p className="mt-1 text-xs text-text-muted">
                                Bot đang dùng: <strong>{selectedBot?.name || 'Chưa chọn bot'}</strong> • Provider: {selectedBot?.provider || payload?.chatbot?.provider || 'gemini'} • Model: {selectedBot?.model || 'chưa cấu hình'} •
                                Lấy ngữ cảnh {selectedBot?.history_pairs || payload?.chatbot?.history_pairs || 0} cặp Q&A gần nhất theo từng người dùng.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
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
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chatbotEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {chatbotEnabled ? 'Đang bật' : 'Đang tắt'}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chatbotConfigured ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                {chatbotConfigured ? 'Đã cấu hình key/model' : 'Thiếu key/model'}
                            </span>
                        </div>
                    </div>
                    {!chatbotEnabled || !chatbotConfigured ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            Chatbot chưa sẵn sàng. Administrator cần vào <strong>Cài đặt hệ thống</strong> để bật chatbot, nhập Gemini API key, model và system message.
                        </div>
                    ) : null}
                </div>

                <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
                    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
                        <div className="border-b border-slate-200/80 px-4 py-3">
                            <h3 className="text-sm font-semibold text-slate-900">Hội thoại của bạn</h3>
                            <p className="mt-1 text-xs text-text-muted">{queueDescription}</p>
                        </div>

                        <div
                            ref={scrollRef}
                            className="max-h-[520px] space-y-3 overflow-y-auto px-4 py-4"
                        >
                            {loading ? (
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                    Đang tải hội thoại...
                                </div>
                            ) : null}

                            {!loading && (payload.messages || []).length === 0 ? (
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                    Chưa có hội thoại. Hãy gửi câu hỏi đầu tiên.
                                </div>
                            ) : null}

                            {(payload.messages || []).map((message) => {
                                const isUser = message.role === 'user';
                                return (
                                    <div
                                        key={message.id}
                                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                                isUser
                                                    ? 'bg-primary text-white'
                                                    : 'border border-slate-200/80 bg-slate-50 text-slate-900'
                                            }`}
                                        >
                                            <div className="whitespace-pre-wrap break-words leading-6">
                                                {message.content}
                                            </div>
                                            <div className={`mt-2 flex items-center gap-2 text-[11px] ${isUser ? 'text-white/85' : 'text-slate-500'}`}>
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
                                    </div>
                                );
                            })}
                        </div>

                        <div className="border-t border-slate-200/80 px-4 py-3">
                            <textarea
                                rows={3}
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Nhập câu hỏi cho trợ lý AI..."
                                disabled={!chatbotEnabled || !chatbotConfigured}
                            />
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs text-text-muted">
                                    {isProcessing ? 'Chatbot đang phản hồi tuần tự. Tin nhắn mới sẽ vào hàng chờ.' : 'Sẵn sàng nhận câu hỏi mới.'}
                                </div>
                                <button
                                    type="button"
                                    onClick={showStopButton ? handleStop : handleSend}
                                    disabled={showStopButton ? (!canStop || stopping) : (!canSend || sending)}
                                    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                                        showStopButton ? 'bg-rose-500' : 'bg-primary'
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

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                            <h3 className="text-sm font-semibold text-slate-900">Hàng chờ</h3>
                            <p className="mt-1 text-xs text-text-muted">
                                Bạn có thể sửa nội dung trước khi chatbot xử lý.
                            </p>

                            <div className="mt-3 space-y-3">
                                {(payload.queue || []).length === 0 ? (
                                    <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                        Không có tin nhắn trong hàng chờ.
                                    </div>
                                ) : null}

                                {(payload.queue || []).map((item) => (
                                    <div key={item.id} className="rounded-xl border border-slate-200/80 p-3">
                                        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
                                            <span>#{item.id}</span>
                                            <span>{STATUS_LABELS[item.status] || item.status}</span>
                                        </div>
                                        <textarea
                                            rows={3}
                                            className="w-full rounded-xl border border-slate-200/80 px-2 py-1.5 text-sm"
                                            value={queueDrafts[item.id] ?? item.content ?? ''}
                                            onChange={(e) => setQueueDrafts((prev) => ({
                                                ...prev,
                                                [item.id]: e.target.value,
                                            }))}
                                        />
                                        <div className="mt-2 flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                                                onClick={() => updateQueueItem(item.id)}
                                            >
                                                Lưu sửa
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600"
                                                onClick={() => deleteQueueItem(item.id)}
                                            >
                                                Xoá khỏi hàng chờ
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                            <h3 className="text-sm font-semibold text-slate-900">Lưu ý vận hành</h3>
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                                <li>Mỗi tài khoản có lịch sử hội thoại riêng, không trộn dữ liệu với user khác.</li>
                                <li>Mỗi bot tách lịch sử riêng theo từng user + bot, tránh lẫn ngữ cảnh giữa các trợ lý.</li>
                                <li>System message dạng Markdown do administrator quản lý tại Cài đặt hệ thống.</li>
                                <li>Lượt chat xử lý tuần tự 1-1 để tránh đứt ngữ cảnh.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
