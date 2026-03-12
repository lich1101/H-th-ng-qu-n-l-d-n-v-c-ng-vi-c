import React from 'react';
import { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

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
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        title: '',
        scheduled_at: '',
        meeting_link: '',
        description: '',
        minutes: '',
    });
    const toast = useToast();

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
            toast.error(getErrorMessage(error, 'Không tải được danh sách lịch họp.'));
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

    const createMeeting = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/v1/meetings', {
                ...form,
                scheduled_at: form.scheduled_at,
            });
            setForm({ title: '', scheduled_at: '', meeting_link: '', description: '', minutes: '' });
            setEditingId(null);
            setShowForm(false);
            await fetchMeetings(meetingPage);
            toast.success('Tạo lịch họp thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Tạo lịch họp thất bại.'));
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
        setShowForm(true);
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
            setShowForm(false);
            await fetchMeetings(meetingPage);
            toast.success('Cập nhật lịch họp thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Cập nhật lịch họp thất bại.'));
        }
    };

    const deleteMeeting = async (id) => {
        try {
            await axios.delete(`/api/v1/meetings/${id}`);
            if (editingId === id) {
                setEditingId(null);
                setForm({ title: '', scheduled_at: '', meeting_link: '', description: '', minutes: '' });
                setShowForm(false);
            }
            await fetchMeetings(meetingPage);
            toast.success('Xóa lịch họp thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Xóa lịch họp thất bại.'));
        }
    };

    const applyFilters = async (e) => {
        e.preventDefault();
        await fetchMeetings(1, meetingFilters);
    };

    const openCreate = () => {
        setEditingId(null);
        setForm({ title: '', scheduled_at: '', meeting_link: '', description: '', minutes: '' });
        setShowForm(true);
    };

    const closeForm = () => {
        setEditingId(null);
        setForm({ title: '', scheduled_at: '', meeting_link: '', description: '', minutes: '' });
        setShowForm(false);
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
            description="Lên lịch họp, gửi lời mời và lưu biên bản theo từng dự án/công việc."
            stats={[
                { label: 'Tổng lịch họp', value: meetingMeta.total },
                { label: 'Chế độ', value: editingId ? 'Đang chỉnh sửa' : 'Tạo mới' },
                { label: 'Nguồn dữ liệu', value: 'API nội bộ' },
                { label: 'Hỗ trợ', value: 'CRUD đầy đủ' },
            ]}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">Danh sách lịch họp</h3>
                    <form onSubmit={applyFilters} className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-2xl bg-primary text-white px-3 py-2 text-sm font-semibold"
                            onClick={openCreate}
                        >
                            Thêm mới
                        </button>
                        <input
                            type="text"
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            placeholder="Tìm tiêu đề"
                            value={meetingFilters.search}
                            onChange={(e) => setMeetingFilters((prev) => ({ ...prev, search: e.target.value }))}
                        />
                        <input
                            type="date"
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={meetingFilters.date_from}
                            onChange={(e) => setMeetingFilters((prev) => ({ ...prev, date_from: e.target.value }))}
                        />
                        <input
                            type="date"
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={meetingFilters.date_to}
                            onChange={(e) => setMeetingFilters((prev) => ({ ...prev, date_to: e.target.value }))}
                        />
                        <button type="submit" className="text-sm text-primary font-semibold">Lọc</button>
                    </form>
                </div>

                <div className="space-y-3">
                    {meetings.map((meeting) => (
                        <div key={meeting.id} className="rounded-2xl border border-slate-200/80 p-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-slate-900">{meeting.title}</h4>
                                <div className="flex items-center gap-3 text-xs">
                                    <button className="text-primary" onClick={() => startEdit(meeting)} type="button">Sửa</button>
                                    <button className="text-danger" onClick={() => deleteMeeting(meeting.id)} type="button">Xóa</button>
                                </div>
                            </div>
                            <p className="text-xs text-text-muted mt-1">{meeting.scheduled_at}</p>
                            {meeting.meeting_link && (
                                <a className="text-xs text-primary mt-2 inline-block" href={meeting.meeting_link} target="_blank" rel="noreferrer">
                                    Mở liên kết họp
                                </a>
                            )}
                            {meeting.description && (
                                <p className="text-xs text-text-muted mt-2">{meeting.description}</p>
                            )}
                        </div>
                    ))}
                    {!meetings.length && (
                        <p className="text-sm text-text-muted">Chưa có lịch họp.</p>
                    )}
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
                    <span>Trang {meetingMeta.current_page} / {meetingMeta.last_page}</span>
                    <div className="flex gap-2">
                        <button type="button" className="px-3 py-1 rounded-full border border-slate-200/80" onClick={goPrevPage}>Trước</button>
                        <button type="button" className="px-3 py-1 rounded-full border border-slate-200/80" onClick={goNextPage}>Sau</button>
                    </div>
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Cập nhật lịch họp #${editingId}` : 'Tạo lịch họp mới'}
                description="Lên lịch họp, liên kết họp và biên bản."
                size="lg"
            >
                <form onSubmit={editingId ? updateMeeting : createMeeting} className="space-y-3 text-sm">
                    <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Tiêu đề lịch họp"
                        required
                    />
                    <input
                        type="datetime-local"
                        value={form.scheduled_at}
                        onChange={(e) => setForm((prev) => ({ ...prev, scheduled_at: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        required
                    />
                    <input
                        type="text"
                        value={form.meeting_link}
                        onChange={(e) => setForm((prev) => ({ ...prev, meeting_link: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Liên kết họp"
                    />
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        rows={3}
                        placeholder="Ghi chú cuộc họp"
                    />
                    <textarea
                        value={form.minutes}
                        onChange={(e) => setForm((prev) => ({ ...prev, minutes: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        rows={3}
                        placeholder="Biên bản"
                    />
                    <div className="flex items-center gap-3">
                        <button type="submit" className="flex-1 rounded-2xl bg-primary text-white py-2.5 font-semibold">
                            {editingId ? 'Cập nhật lịch họp' : 'Tạo lịch họp'}
                        </button>
                        <button type="button" className="flex-1 rounded-2xl border border-slate-200 py-2.5 font-semibold" onClick={closeForm}>
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
