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

const formatBytes = (value) => {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const nameInitial = (name, fallback = 'U') => {
    if (!name) return fallback;
    const text = String(name).trim();
    if (!text) return fallback;
    return text.charAt(0).toUpperCase();
};

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

const sanitizeDisplayUrl = (value) => {
    return String(value || '').replace(/[),.;!?]+$/g, '');
};

const normalizeHref = (value) => {
    const raw = sanitizeDisplayUrl(value);
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const renderTextWithLinks = (value, { linkClassName = '', textClassName = '' } = {}) => {
    const text = String(value || '');
    if (!text) return null;

    const lines = text.split('\n');
    return lines.map((line, lineIndex) => {
        const parts = [];
        let lastIndex = 0;
        let match;
        URL_REGEX.lastIndex = 0;
        while ((match = URL_REGEX.exec(line)) !== null) {
            const rawUrl = match[0];
            const start = match.index;
            const end = start + rawUrl.length;
            if (start > lastIndex) {
                parts.push({
                    type: 'text',
                    value: line.slice(lastIndex, start),
                });
            }
            parts.push({
                type: 'link',
                value: sanitizeDisplayUrl(rawUrl),
            });
            lastIndex = end;
        }
        if (lastIndex < line.length) {
            parts.push({
                type: 'text',
                value: line.slice(lastIndex),
            });
        }

        return (
            <React.Fragment key={`line-${lineIndex}`}>
                {parts.map((part, partIndex) => {
                    if (part.type === 'link') {
                        const href = normalizeHref(part.value);
                        return (
                            <a
                                key={`part-${lineIndex}-${partIndex}`}
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClassName}
                            >
                                {part.value}
                            </a>
                        );
                    }
                    return (
                        <span key={`part-${lineIndex}-${partIndex}`} className={textClassName}>
                            {part.value}
                        </span>
                    );
                })}
                {lineIndex < lines.length - 1 ? <br /> : null}
            </React.Fragment>
        );
    });
};

export default function ChatbotAssistant({ auth }) {
    const toast = useToast();
    const scrollRef = useRef(null);
    const fileInputRef = useRef(null);
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
    const [pendingAttachment, setPendingAttachment] = useState(null);
    const [sendingPreview, setSendingPreview] = useState(null);
    const [queueOpen, setQueueOpen] = useState(true);
    const [connectionError, setConnectionError] = useState('');

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
            if (connectionError) {
                setConnectionError('');
            }
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
            const message = error?.response?.data?.message || 'Không tải được hội thoại chatbot.';
            setConnectionError(message);
            if (!silent) {
                toast.error(message);
            }
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
        return () => {
            if (pendingAttachment?.previewUrl) {
                URL.revokeObjectURL(pendingAttachment.previewUrl);
            }
        };
    }, [pendingAttachment]);

    useEffect(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [payload.messages.length, sendingPreview?.id]);

    const isProcessing = !!payload?.state?.is_processing;
    const chatbotEnabled = !!payload?.chatbot?.enabled;
    const chatbotConfigured = !!payload?.chatbot?.configured;
    const bots = Array.isArray(payload?.bots) ? payload.bots : [];
    const selectedBot = payload?.bot || null;
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const queue = Array.isArray(payload?.queue) ? payload.queue : [];
    const inputTrimmed = input.trim();
    const hasPendingAttachment = !!pendingAttachment?.file;
    const showStopButton = isProcessing && inputTrimmed.length === 0 && !hasPendingAttachment;
    const queueCount = queue.length;
    const assistantAvatar = selectedBot?.icon || 'AI';
    const assistantAvatarUrl = (selectedBot?.avatar_url || '').toString();
    const currentUserName = auth?.user?.name || 'Bạn';
    const currentUserAvatarUrl = (auth?.user?.avatar_url || '').toString();

    const canSend = chatbotEnabled && chatbotConfigured && (inputTrimmed.length > 0 || hasPendingAttachment);
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

        const draftContent = inputTrimmed;
        const draftAttachment = pendingAttachment;
        const localPreview = {
            id: `local-${Date.now()}`,
            content: draftContent,
            created_at: new Date().toISOString(),
            attachment: draftAttachment
                ? {
                      name: draftAttachment.name,
                      size: draftAttachment.size,
                      is_image: draftAttachment.isImage,
                      url: draftAttachment.previewUrl || '',
                  }
                : null,
        };

        setSending(true);
        setSendingPreview(localPreview);
        setInput('');
        setPendingAttachment(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        try {
            const formData = new FormData();
            if (draftContent.length > 0) {
                formData.append('content', draftContent);
            }
            if (selectedBotId) {
                formData.append('bot_id', String(selectedBotId));
            }
            if (draftAttachment?.file) {
                formData.append('attachment', draftAttachment.file);
            }
            const res = await axios.post('/api/v1/chatbot/messages', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const data = normalizePayload(res.data);
            setPayload(data);
            setSendingPreview(null);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không gửi được câu hỏi.');
            setSendingPreview((prev) => (prev ? { ...prev, failed: true } : null));
            setTimeout(() => {
                setSendingPreview((prev) => (prev?.failed ? null : prev));
            }, 900);
        } finally {
            setSending(false);
            if (draftAttachment?.previewUrl) {
                URL.revokeObjectURL(draftAttachment.previewUrl);
            }
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

    const clearPendingAttachment = () => {
        if (pendingAttachment?.previewUrl) {
            URL.revokeObjectURL(pendingAttachment.previewUrl);
        }
        setPendingAttachment(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleAttachmentChange = (event) => {
        const file = event?.target?.files?.[0];
        if (!file) return;

        if (pendingAttachment?.previewUrl) {
            URL.revokeObjectURL(pendingAttachment.previewUrl);
        }

        const isImage = String(file.type || '').toLowerCase().startsWith('image/');
        const previewUrl = isImage ? URL.createObjectURL(file) : null;
        setPendingAttachment({
            file,
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream',
            isImage,
            previewUrl,
        });
    };

    const handleInputKeyDown = (event) => {
        if (event?.nativeEvent?.isComposing) {
            return;
        }
        if (event.key !== 'Enter' || event.shiftKey) {
            return;
        }
        event.preventDefault();
        if (!canSend) {
            return;
        }
        handleSend();
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
        if (inputTrimmed.length > 0 || hasPendingAttachment) {
            return 'Đang trả lời. Tin nhắn hoặc file bạn gửi lúc này sẽ vào hàng chờ.';
        }
        return 'Đang trả lời. Bạn có thể bấm Dừng để ngắt phản hồi hiện tại.';
    }, [isProcessing, inputTrimmed.length, hasPendingAttachment]);

    useEffect(() => {
        if (queueCount > 0) {
            setQueueOpen(true);
        }
    }, [queueCount]);

    return (
        <PageContainer
            auth={auth}
            title="Trợ lý AI"
            description="Trợ lý nội bộ dùng Gemini. Chat theo từng người dùng, có hàng chờ và dừng phản hồi."
            stats={[]}
        >
            <div className="lg:col-span-2">
                <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.45)]">
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
                        <div className="rounded-[20px] border border-slate-200/80 bg-white shadow-card">
                        <div className="border-b border-slate-200/80 px-5 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-semibold text-slate-900">Hội thoại của bạn</h3>
                                    <p className="mt-1 text-sm text-text-muted">{queueDescription}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chatbotEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                        {chatbotEnabled ? 'Đang bật' : 'Đang tắt'}
                                    </span>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chatbotConfigured ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {chatbotConfigured ? 'Đủ cấu hình' : 'Thiếu key/model'}
                                    </span>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isProcessing ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {isProcessing ? 'Đang trả lời tuần tự' : 'Sẵn sàng'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    {assistantAvatarUrl ? (
                                        <img
                                            src={assistantAvatarUrl}
                                            alt={selectedBot?.name || 'Trợ lý AI'}
                                            className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                                        />
                                    ) : (
                                        <span
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm"
                                            style={{ backgroundColor: `${selectedBot?.accent_color || '#6366F1'}1A`, color: selectedBot?.accent_color || '#6366F1' }}
                                        >
                                            {assistantAvatar}
                                        </span>
                                    )}
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-slate-800">
                                            {selectedBot?.name || 'Chưa chọn bot'}
                                        </div>
                                        <div className="truncate text-xs text-slate-500">
                                            {(selectedBot?.provider || payload?.chatbot?.provider || 'gemini').toUpperCase()} · {selectedBot?.model || 'chưa cấu hình'} · {selectedBot?.history_pairs || payload?.chatbot?.history_pairs || 0} cặp ngữ cảnh
                                        </div>
                                    </div>
                                </div>

                                <div className="w-full max-w-[340px]">
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
                                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    Chatbot chưa sẵn sàng. Administrator vào <strong>Cài đặt hệ thống</strong> để bật chatbot, nhập Gemini API key, model và system message.
                                </div>
                            ) : null}
                            {connectionError ? (
                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                    Polling gặp lỗi: <strong>{connectionError}</strong>. Hệ thống sẽ tiếp tục tự đồng bộ khi API ổn định.
                                </div>
                            ) : null}
                        </div>

                            <div
                                ref={scrollRef}
                                className="h-[56vh] min-h-[360px] max-h-[620px] space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50/75 to-slate-100/40 px-5 py-5"
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
                                const attachment = message?.attachment && typeof message.attachment === 'object'
                                    ? message.attachment
                                    : null;
                                const hasText = String(message.content || '').trim().length > 0;
                                return (
                                    <div
                                        key={message.id}
                                        className={`chat-fade flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {!isUser ? (
                                            assistantAvatarUrl ? (
                                                <img
                                                    src={assistantAvatarUrl}
                                                    alt={displayName}
                                                    className="mt-1 h-9 w-9 flex-none rounded-full border border-slate-200 object-cover shadow-sm"
                                                />
                                            ) : (
                                                <div className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm">
                                                    {avatarLabel}
                                                </div>
                                            )
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
                                            {hasText ? (
                                                <div className="whitespace-pre-wrap break-words leading-6">
                                                    {renderTextWithLinks(message.content, {
                                                        linkClassName: isUser
                                                            ? 'underline decoration-white/70 underline-offset-2 hover:text-white'
                                                            : 'font-medium text-primary underline underline-offset-2 hover:text-primary/80',
                                                        textClassName: isUser ? 'text-white' : 'text-slate-900',
                                                    })}
                                                </div>
                                            ) : (
                                                <div className={`${isUser ? 'text-white/85' : 'text-slate-500'} text-sm`}>
                                                    Tin nhắn chỉ có tệp đính kèm.
                                                </div>
                                            )}
                                            {attachment?.url ? (
                                                <div className={`mt-2 rounded-xl border p-2.5 ${isUser ? 'border-white/30 bg-white/10' : 'border-slate-200 bg-slate-50'}`}>
                                                    {attachment.is_image ? (
                                                        <a href={attachment.url} target="_blank" rel="noreferrer" className="block">
                                                            <img
                                                                src={attachment.url}
                                                                alt={attachment.name || 'attachment'}
                                                                className="max-h-56 w-full rounded-lg object-contain"
                                                            />
                                                        </a>
                                                    ) : (
                                                        <a
                                                            href={attachment.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                                                                isUser ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/10">📎</span>
                                                            <span className="min-w-0 flex-1 truncate">{attachment.name || 'Tệp đính kèm'}</span>
                                                            <span className="text-[10px] opacity-80">{formatBytes(attachment.size)}</span>
                                                        </a>
                                                    )}
                                                    <div className={`mt-1 text-[11px] ${isUser ? 'text-white/80' : 'text-slate-500'}`}>
                                                        {attachment.name || 'Tệp đính kèm'}
                                                        {attachment.size ? ` • ${formatBytes(attachment.size)}` : ''}
                                                    </div>
                                                </div>
                                            ) : null}
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
                                            currentUserAvatarUrl ? (
                                                <img
                                                    src={currentUserAvatarUrl}
                                                    alt={displayName}
                                                    className="mt-1 h-9 w-9 flex-none rounded-full border border-primary/30 object-cover shadow-sm"
                                                />
                                            ) : (
                                                <div className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary shadow-sm">
                                                    {avatarLabel}
                                                </div>
                                            )
                                        ) : null}
                                    </div>
                                );
                            })}
                            {sendingPreview ? (
                                <div className="chat-fade flex justify-end gap-2.5">
                                    <div className="max-w-[min(88%,760px)] rounded-2xl bg-primary px-4 py-3 text-sm text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.65)] ring-2 ring-primary/25">
                                        {sendingPreview.content ? (
                                            <div className="whitespace-pre-wrap break-words leading-6">
                                                {sendingPreview.content}
                                            </div>
                                        ) : (
                                            <div className="text-white/85">Tin nhắn chỉ có tệp đính kèm.</div>
                                        )}
                                        {sendingPreview?.attachment ? (
                                            <div className="mt-2 rounded-xl border border-white/30 bg-white/10 p-2.5">
                                                {sendingPreview.attachment?.is_image && sendingPreview.attachment?.url ? (
                                                    <img
                                                        src={sendingPreview.attachment.url}
                                                        alt={sendingPreview.attachment.name || 'attachment'}
                                                        className="max-h-48 w-full rounded-lg object-contain"
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/10">📎</span>
                                                        <span className="min-w-0 flex-1 truncate">{sendingPreview.attachment.name || 'Tệp đính kèm'}</span>
                                                        <span className="text-[10px] opacity-80">{formatBytes(sendingPreview.attachment.size)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">
                                            <span className="inline-flex h-2 w-2 rounded-full bg-white animate-pulse" />
                                            {sendingPreview?.failed ? 'Gửi thất bại' : 'Đang gửi...'}
                                        </div>
                                    </div>
                                    {currentUserAvatarUrl ? (
                                        <img
                                            src={currentUserAvatarUrl}
                                            alt={currentUserName}
                                            className="mt-1 h-9 w-9 flex-none rounded-full border border-primary/30 object-cover shadow-sm"
                                        />
                                    ) : (
                                        <div className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary shadow-sm">
                                            {nameInitial(currentUserName, 'U')}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>

                            <div className="border-t border-slate-200/80 bg-gradient-to-b from-slate-50/70 to-white px-5 py-4">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <label className="block text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
                                    Soạn tin nhắn
                                </label>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                    Enter gửi • Shift+Enter xuống dòng
                                </span>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={handleAttachmentChange}
                            />

                            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                                {pendingAttachment ? (
                                    <div className="border-b border-slate-200/80 px-3 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                                                onClick={clearPendingAttachment}
                                                title="Bỏ tệp đính kèm"
                                            >
                                                ✕
                                            </button>
                                            <div className="min-w-0 flex-1 text-xs text-slate-700">
                                                <div className="truncate font-semibold">{pendingAttachment.name}</div>
                                                <div className="text-slate-500">{formatBytes(pendingAttachment.size)}</div>
                                            </div>
                                            {pendingAttachment.isImage && pendingAttachment.previewUrl ? (
                                                <img
                                                    src={pendingAttachment.previewUrl}
                                                    alt={pendingAttachment.name}
                                                    className="h-12 w-12 rounded-xl border border-slate-200 object-cover"
                                                />
                                            ) : (
                                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200 text-base">
                                                    📎
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                <textarea
                                    rows={3}
                                    className="w-full resize-none rounded-t-2xl border-0 bg-transparent px-4 py-3 text-sm leading-6 focus:outline-none"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleInputKeyDown}
                                    placeholder={isProcessing ? 'Nhập để đưa vào hàng chờ...' : 'Nhập câu hỏi cho trợ lý AI...'}
                                    disabled={!chatbotEnabled || !chatbotConfigured}
                                />

                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-3 py-2.5">
                                    <div className="text-xs text-text-muted">
                                        {isProcessing ? `Đang xử lý ${payload?.state?.current_message_id ? `#${payload.state.current_message_id}` : 'hội thoại hiện tại'}.` : 'Sẵn sàng nhận câu hỏi mới.'}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={!chatbotEnabled || !chatbotConfigured}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            title="Đính kèm file/ảnh"
                                        >
                                            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
                                                <path d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 01-7.78-7.78l8.49-8.49a3.5 3.5 0 014.95 4.95l-8.5 8.49a1.5 1.5 0 01-2.12-2.12l7.78-7.78" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={showStopButton ? handleStop : handleSend}
                                            disabled={showStopButton ? (!canStop || stopping) : (!canSend || sending)}
                                            className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                                showStopButton ? 'bg-rose-500 hover:bg-rose-600' : 'bg-primary hover:brightness-95'
                                            }`}
                                            title={showStopButton ? 'Dừng phản hồi' : (isProcessing ? 'Gửi vào hàng chờ' : 'Gửi tin nhắn')}
                                        >
                                            {showStopButton ? (
                                                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                                                    <rect x="7" y="7" width="10" height="10" rx="1.5" />
                                                </svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                                                    <path d="M3.4 11.2l15.6-8.1c1-.5 2.2.4 1.9 1.5l-2.7 13.2c-.2 1.1-1.6 1.5-2.4.8l-4.2-3.6-2.7 2.6c-.5.5-1.4.2-1.5-.5l-.4-4.1-3.3-1c-1-.3-1.1-1.7-.3-2.2z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            </div>
                        </div>

                        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
                            <div className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-card">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-slate-900">Hàng chờ</h3>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                        {queueCount}
                                    </span>
                                    <button
                                        type="button"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                        onClick={() => setQueueOpen((prev) => !prev)}
                                        title={queueOpen ? 'Thu gọn hàng chờ' : 'Mở rộng hàng chờ'}
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            className={`h-4 w-4 fill-none stroke-current transition-transform ${queueOpen ? '' : '-rotate-90'}`}
                                            strokeWidth="2"
                                        >
                                            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <p className="mt-1 text-xs text-text-muted">
                                Bạn có thể sửa nội dung trước khi chatbot xử lý.
                            </p>

                            <div className={`mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1 ${queueOpen ? '' : 'hidden'}`}>
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
                                        {item?.attachment?.name ? (
                                            <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-xs text-slate-700">
                                                <span>📎</span>
                                                <span className="min-w-0 flex-1 truncate">{item.attachment.name}</span>
                                                <span className="text-[10px] text-slate-500">{formatBytes(item.attachment.size)}</span>
                                            </div>
                                        ) : null}
                                        <div className="mt-2 flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white hover:brightness-95"
                                                onClick={() => updateQueueItem(item.id)}
                                                title="Lưu nội dung hàng chờ"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                                                    <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                                                onClick={() => deleteQueueItem(item.id)}
                                                title="Xóa khỏi hàng chờ"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                                                    <path d="M5 7h14" strokeLinecap="round" />
                                                    <path d="M9 7V5h6v2" strokeLinecap="round" />
                                                    <path d="M8 7l1 12h6l1-12" strokeLinecap="round" strokeLinejoin="round" />
                                                    <path d="M10 11v5M14 11v5" strokeLinecap="round" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            </div>

                            <div className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-card">
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
            </div>
        </PageContainer>
    );
}
