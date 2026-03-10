import React from 'react';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';

export default function Meetings(props) {
    const initialQuery = (() => {
        if (typeof window === 'undefined') {
            return { search: '', date_from: '', date_to: '', per_page: 10, page: 1 };
        }
        const params = new URLSearchParams(window.location.search);
        const perPage = Number(params.get('per_page') || 10);
        const page = Number(params.get('page') || 1);
        return {
            search: params.get('search') || '',
            date_from: params.get('date_from') || '',
            date_to: params.get('date_to') || '',
            per_page: Number.isNaN(perPage) ? 10 : perPage,
            page: Number.isNaN(page) ? 1 : page,
        };
    })();

    const [meetings, setMeetings] = useState([]);
    const [meetingMeta, setMeetingMeta] = useState({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [meetingPage, setMeetingPage] = useState(initialQuery.page);
    const [meetingFilters, setMeetingFilters] = useState({
        search: initialQuery.search,
        date_from: initialQuery.date_from,
        date_to: initialQuery.date_to,
        per_page: initialQuery.per_page,
    });
    const [editingId, setEditingId] = useState(null);
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);
    const [form, setForm] = useState({
        title: '',
        scheduled_at: '',
        meeting_link: '',
        description: '',
        minutes: '',
    });

    const showToast = (type, message) => {
        setToast({ type, message });
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    };

    const getErrorMessage = (error, fallback) => {
        return error?.response?.data?.message || fallback;
    };

    const syncMeetingUrl = (filters, page) => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams();
        if (filters.search) params.set('search', filters.search);
        if (filters.date_from) params.set('date_from', filters.date_from);
        if (filters.date_to) params.set('date_to', filters.date_to);
        if (Number(filters.per_page) !== 10) params.set('per_page', String(filters.per_page));
        if (page > 1) params.set('page', String(page));
        const queryString = params.toString();
        const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
        window.history.replaceState({}, '', newUrl);
    };

    const fetchMeetings = async (page = 1, filtersArg = meetingFilters) => {
        try {
            const response = await axios.get('/api/v1/meetings', {
                params: {
                    ...filtersArg,
                    page,
                },
            });
            const resolvedPage = response.data.current_page || 1;
            setMeetings(response.data.data || []);
            setMeetingMeta({
                current_page: resolvedPage,
                last_page: response.data.last_page || 1,
                total: response.data.total || 0,
            });
            setMeetingPage(resolvedPage);
            syncMeetingUrl(filtersArg, resolvedPage);
        } catch (error) {
            showToast('error', getErrorMessage(error, 'Không tải được danh sách lịch họp.'));
        }
    };

    useEffect(() => {
        fetchMeetings(initialQuery.page, {
            search: initialQuery.search,
            date_from: initialQuery.date_from,
            date_to: initialQuery.date_to,
            per_page: initialQuery.per_page,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

    const createMeeting = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/v1/meetings', {
                ...form,
                scheduled_at: form.scheduled_at,
            });
            setForm({ title: '', scheduled_at: '', meeting_link: '', description: '', minutes: '' });
            setEditingId(null);
            await fetchMeetings(meetingPage);
            showToast('success', 'Tạo lịch họp thành công.');
        } catch (error) {
            showToast('error', getErrorMessage(error, 'Tạo lịch họp thất bại.'));
        }
    };

    const startEdit = (meeting) => {
        setEditingId(meeting.id);
        setForm({
            title: meeting.title || '',
            scheduled_at: meeting.scheduled_at ? meeting.scheduled_at.slice(0, 16) : '',
            meeting_link: meeting.meeting_link || '',
            description: meeting.description || '',
            minutes: meeting.minutes || '',
        });
    };

    const updateMeeting = async (e) => {
        e.preventDefault();
        if (!editingId) return;
        try {
            await axios.put(`/api/v1/meetings/${editingId}`, {
                ...form,
                scheduled_at: form.scheduled_at,
            });
            setForm({ title: '', scheduled_at: '', meeting_link: '', description: '', minutes: '' });
            setEditingId(null);
            await fetchMeetings(meetingPage);
            showToast('success', 'Cập nhật lịch họp thành công.');
        } catch (error) {
            showToast('error', getErrorMessage(error, 'Cập nhật lịch họp thất bại.'));
        }
    };

    const deleteMeeting = async (id) => {
        try {
            await axios.delete(`/api/v1/meetings/${id}`);
            if (editingId === id) {
                setEditingId(null);
                setForm({ title: '', scheduled_at: '', meeting_link: '', description: '', minutes: '' });
            }
            await fetchMeetings(meetingPage);
            showToast('success', 'Xóa lịch họp thành công.');
        } catch (error) {
            showToast('error', getErrorMessage(error, 'Xóa lịch họp thất bại.'));
        }
    };

    const applyFilters = async (e) => {
        e.preventDefault();
        await fetchMeetings(1, meetingFilters);
    };

    const goPrevPage = () => {
        if (meetingMeta.current_page > 1) {
            fetchMeetings(meetingMeta.current_page - 1);
        }
    };

    const goNextPage = () => {
        if (meetingMeta.current_page < meetingMeta.last_page) {
            fetchMeetings(meetingMeta.current_page + 1);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Lịch họp bàn giao"
            description="Lên lịch meeting, gửi lời mời và lưu biên bản theo từng dự án/task."
            stats={[
                { label: 'Tổng lịch họp', value: meetingMeta.total },
                { label: 'Chế độ', value: editingId ? 'Đang chỉnh sửa' : 'Tạo mới' },
                { label: 'Nguồn dữ liệu', value: 'API nội bộ' },
                { label: 'Hỗ trợ', value: 'CRUD đầy đủ' },
            ]}
        >
            {toast && (
                <div
                    className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
                        toast.type === 'success'
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}
                >
                    {toast.message}
                </div>
            )}

            <form
                onSubmit={editingId ? updateMeeting : createMeeting}
                className="mb-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm grid gap-3 md:grid-cols-2"
            >
                <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="rounded-lg border-slate-300 text-sm"
                    placeholder="Tiêu đề lịch họp"
                    required
                />
                <input
                    type="datetime-local"
                    value={form.scheduled_at}
                    onChange={(e) => setForm((prev) => ({ ...prev, scheduled_at: e.target.value }))}
                    className="rounded-lg border-slate-300 text-sm"
                    required
                />
                <input
                    type="url"
                    value={form.meeting_link}
                    onChange={(e) => setForm((prev) => ({ ...prev, meeting_link: e.target.value }))}
                    className="rounded-lg border-slate-300 text-sm"
                    placeholder="Link họp"
                />
                <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="rounded-lg border-slate-300 text-sm"
                    placeholder="Mô tả cuộc họp"
                />
                <input
                    type="text"
                    value={form.minutes}
                    onChange={(e) => setForm((prev) => ({ ...prev, minutes: e.target.value }))}
                    className="rounded-lg border-slate-300 text-sm"
                    placeholder="Biên bản tóm tắt"
                />
                <div className="md:col-span-2 flex gap-2">
                    <button type="submit" className="rounded-lg bg-sky-600 text-white font-semibold text-sm px-4 py-2">
                        {editingId ? 'Lưu chỉnh sửa' : 'Tạo lịch họp'}
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={() => {
                                setEditingId(null);
                                setForm({ title: '', scheduled_at: '', meeting_link: '', description: '', minutes: '' });
                            }}
                            className="rounded-lg border border-slate-300 text-slate-700 font-semibold text-sm px-4 py-2"
                        >
                            Hủy
                        </button>
                    )}
                </div>
            </form>

            <form
                onSubmit={applyFilters}
                className="mb-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm grid gap-3 md:grid-cols-5"
            >
                <input
                    type="text"
                    value={meetingFilters.search}
                    onChange={(e) => setMeetingFilters((prev) => ({ ...prev, search: e.target.value }))}
                    className="rounded-lg border-slate-300 text-sm"
                    placeholder="Tìm theo tiêu đề/mô tả/link"
                />
                <input
                    type="date"
                    value={meetingFilters.date_from}
                    onChange={(e) => setMeetingFilters((prev) => ({ ...prev, date_from: e.target.value }))}
                    className="rounded-lg border-slate-300 text-sm"
                />
                <input
                    type="date"
                    value={meetingFilters.date_to}
                    onChange={(e) => setMeetingFilters((prev) => ({ ...prev, date_to: e.target.value }))}
                    className="rounded-lg border-slate-300 text-sm"
                />
                <select
                    value={meetingFilters.per_page}
                    onChange={(e) => setMeetingFilters((prev) => ({ ...prev, per_page: Number(e.target.value) }))}
                    className="rounded-lg border-slate-300 text-sm"
                >
                    <option value={5}>5 / trang</option>
                    <option value={10}>10 / trang</option>
                    <option value={20}>20 / trang</option>
                </select>
                <button type="submit" className="rounded-lg bg-slate-800 text-white font-semibold text-sm px-4 py-2">
                    Lọc dữ liệu
                </button>
            </form>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 font-semibold">Lịch họp sắp tới</div>
                <div className="divide-y divide-slate-100">
                    {meetings.map((meeting) => (
                        <div key={meeting.id} className="px-4 py-3 flex justify-between text-sm">
                            <div>
                                <p className="font-medium">{meeting.title}</p>
                                <p className="text-slate-500">{meeting.meeting_link || 'Chưa có link họp'}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-slate-700">
                                    {new Date(meeting.scheduled_at).toLocaleString('vi-VN')}
                                </p>
                                <div className="mt-1 flex gap-2 justify-end">
                                    <button
                                        type="button"
                                        className="text-xs text-sky-700"
                                        onClick={() => startEdit(meeting)}
                                    >
                                        Sửa
                                    </button>
                                    <button
                                        type="button"
                                        className="text-xs text-rose-700"
                                        onClick={() => deleteMeeting(meeting.id)}
                                    >
                                        Xóa
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
                    <span>
                        Trang {meetingMeta.current_page}/{meetingMeta.last_page}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={goPrevPage}
                            disabled={meetingMeta.current_page <= 1}
                            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                        >
                            Trước
                        </button>
                        <button
                            type="button"
                            onClick={goNextPage}
                            disabled={meetingMeta.current_page >= meetingMeta.last_page}
                            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                        >
                            Sau
                        </button>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
