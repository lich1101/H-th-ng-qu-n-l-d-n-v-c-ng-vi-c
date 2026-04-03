import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';
import { VIETNAM_TIME_ZONE, formatVietnamDate, formatVietnamDateTime } from '@/lib/vietnamTime';

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const pad = (value) => String(value).padStart(2, '0');
const vietnamMonthFormatter = new Intl.DateTimeFormat('vi-VN', {
    month: 'long',
    year: 'numeric',
    timeZone: VIETNAM_TIME_ZONE,
});

const toDateKey = (raw) => {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return String(raw).slice(0, 10);
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toDateTimeLocal = (raw) => {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return String(raw).replace(' ', 'T').slice(0, 16);
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDateTime = (raw) => {
    return formatVietnamDateTime(raw, raw || '—');
};

const getMonthRange = (monthDate) => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    return {
        date_from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        date_to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    };
};

const buildCalendarCells = (monthDate) => {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        return {
            key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
            date,
            isCurrentMonth: date.getMonth() === monthDate.getMonth(),
        };
    });
};

const defaultDateTimeByDate = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00`;

function FormField({ label, required = false, children, className = '' }) {
    return (
        <div className={className}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
        </div>
    );
}

export default function Meetings(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canManage = ['admin', 'quan_ly'].includes(userRole);
    const canDelete = ['admin', 'quan_ly'].includes(userRole);

    const [meetings, setMeetings] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [meetingMeta, setMeetingMeta] = useState({
        current_page: 1,
        last_page: 1,
        total: 0,
    });

    const [currentMonth, setCurrentMonth] = useState(() => new Date());
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [filters, setFilters] = useState(() => {
        const range = getMonthRange(new Date());
        return {
            search: '',
            date_from: range.date_from,
            date_to: range.date_to,
            attendee_id: '',
            per_page: 200,
            page: 1,
        };
    });

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showDetails, setShowDetails] = useState(false);
    const [detailMeeting, setDetailMeeting] = useState(null);
    const [form, setForm] = useState({
        title: '',
        scheduled_at: defaultDateTimeByDate(new Date()),
        meeting_link: '',
        description: '',
        minutes: '',
        attendee_ids: [],
    });

    const getErrorMessage = (error, fallback) =>
        error?.response?.data?.message || fallback;

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/api/v1/users/lookup', {
                params: { per_page: 300 },
            });
            setUsers(response.data?.data || []);
        } catch {
            setUsers([]);
        }
    };

    const handleSearch = (val) => {
        const next = { ...filters, search: val, page: 1 };
        setFilters(next);
    };

    const fetchMeetings = async (nextPage = 1, nextFilters = filters) => {
        setLoading(true);
        try {
            const response = await axios.get('/api/v1/meetings', {
                params: {
                    search: nextFilters.search || undefined,
                    date_from: nextFilters.date_from || undefined,
                    date_to: nextFilters.date_to || undefined,
                    attendee_id: nextFilters.attendee_id || undefined,
                    per_page: nextFilters.per_page || 200,
                    page: nextPage,
                },
            });
            setMeetings(response.data?.data || []);
            setMeetingMeta({
                current_page: response.data?.current_page || 1,
                last_page: response.data?.last_page || 1,
                total: response.data?.total || 0,
            });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không tải được danh sách lịch họp.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchMeetings(1, filters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const meetingsByDate = useMemo(() => {
        const map = {};
        meetings.forEach((meeting) => {
            const key = toDateKey(meeting.scheduled_at);
            if (!key) return;
            if (!map[key]) map[key] = [];
            map[key].push(meeting);
        });
        Object.keys(map).forEach((key) => {
            map[key].sort((a, b) => {
                return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
            });
        });
        return map;
    }, [meetings]);

    const selectedDateKey = toDateKey(selectedDate);
    const selectedMeetings = meetingsByDate[selectedDateKey] || [];
    const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);
    const monthLabel = vietnamMonthFormatter.format(currentMonth);

    const toggleAttendee = (userId) => {
        setForm((prev) => {
            const current = prev.attendee_ids || [];
            const exists = current.includes(userId);
            return {
                ...prev,
                attendee_ids: exists
                    ? current.filter((id) => id !== userId)
                    : [...current, userId],
            };
        });
    };

    const openCreate = () => {
        setEditingId(null);
        setForm({
            title: '',
            scheduled_at: defaultDateTimeByDate(selectedDate),
            meeting_link: '',
            description: '',
            minutes: '',
            attendee_ids: [],
        });
        setShowForm(true);
    };

    const startEdit = (meeting) => {
        setEditingId(meeting.id);
        setForm({
            title: meeting.title || '',
            scheduled_at: toDateTimeLocal(meeting.scheduled_at),
            meeting_link: meeting.meeting_link || '',
            description: meeting.description || '',
            minutes: meeting.minutes || '',
            attendee_ids: (meeting.attendees || [])
                .map((attendee) => Number(attendee.user_id || attendee.user?.id || 0))
                .filter((id) => id > 0),
        });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingId(null);
    };

    const saveMeeting = async (event) => {
        event.preventDefault();
        if (!canManage) {
            toast.error('Bạn không có quyền thao tác lịch họp.');
            return;
        }
        if (!form.title.trim() || !form.scheduled_at) {
            toast.error('Vui lòng nhập tiêu đề và thời gian họp.');
            return;
        }
        try {
            const payload = {
                title: form.title.trim(),
                scheduled_at: form.scheduled_at,
                meeting_link: form.meeting_link?.trim() || null,
                description: form.description?.trim() || null,
                minutes: form.minutes?.trim() || null,
                attendee_ids: form.attendee_ids || [],
            };
            if (editingId) {
                await axios.put(`/api/v1/meetings/${editingId}`, payload);
                toast.success('Cập nhật lịch họp thành công.');
            } else {
                await axios.post('/api/v1/meetings', payload);
                toast.success('Tạo lịch họp thành công, hệ thống đã gửi thông báo cho thành viên.');
            }
            closeForm();
            await fetchMeetings(meetingMeta.current_page || 1, filters);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Lưu lịch họp thất bại.'));
        }
    };

    const deleteMeeting = async (meetingId) => {
        if (!canDelete) {
            toast.error('Bạn không có quyền xóa lịch họp.');
            return;
        }
        if (!window.confirm('Bạn có chắc muốn xóa lịch họp này?')) return;
        try {
            await axios.delete(`/api/v1/meetings/${meetingId}`);
            toast.success('Xóa lịch họp thành công.');
            if (showDetails && detailMeeting?.id === meetingId) {
                setShowDetails(false);
                setDetailMeeting(null);
            }
            await fetchMeetings(meetingMeta.current_page || 1, filters);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Xóa lịch họp thất bại.'));
        }
    };

    const applyFilters = async (event) => {
        event.preventDefault();
        await fetchMeetings(1, filters);
    };

    const openMeetingDetails = (meeting) => {
        setDetailMeeting(meeting);
        setShowDetails(true);
    };

    const moveMonth = (delta) => {
        const next = new Date(currentMonth);
        next.setMonth(next.getMonth() + delta);
        setCurrentMonth(next);
    };

    const useCurrentMonthRange = async () => {
        const range = getMonthRange(currentMonth);
        const nextFilters = { ...filters, ...range };
        setFilters(nextFilters);
        await fetchMeetings(1, nextFilters);
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Lịch họp"
            description="Lịch họp theo dạng lịch tháng, có chọn nhiều thành viên và xem nhanh thông tin cuộc họp."
        >
            <FilterToolbar enableSearch
                title="Bảng điều khiển lịch họp"
                description="Tìm nhanh lịch họp qua tiêu đề, mô tả hoặc thành viên."
                searchValue={filters.search}
                onSearch={handleSearch}
                actions={(
                    <FilterActionGroup className="justify-end">
                        <button type="submit" form="meeting-filter-form" className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                            Lọc
                        </button>
                        <button type="button" className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700" onClick={useCurrentMonthRange}>
                            Tháng đang xem
                        </button>
                    </FilterActionGroup>
                )}
            >
                <form id="meeting-filter-form" onSubmit={applyFilters} className="grid gap-3 xl:grid-cols-[auto_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]">
                    <FilterActionGroup className="xl:self-end">
                        <button
                            type="button"
                            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
                            onClick={openCreate}
                            disabled={!canManage}
                        >
                            Thêm lịch họp
                        </button>
                    </FilterActionGroup>
                    <FilterField label="Từ ngày">
                        <input
                            type="date"
                            className={filterControlClass}
                            value={filters.date_from}
                            onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
                        />
                    </FilterField>
                    <FilterField label="Đến ngày">
                        <input
                            type="date"
                            className={filterControlClass}
                            value={filters.date_to}
                            onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
                        />
                    </FilterField>
                    <FilterField label="Thành viên">
                        <select
                            className={filterControlClass}
                            value={filters.attendee_id}
                            onChange={(e) => setFilters((prev) => ({ ...prev, attendee_id: e.target.value }))}
                        >
                            <option value="">Tất cả thành viên</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                    </FilterField>
                </form>
            </FilterToolbar>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                    <div className="flex items-center justify-between mb-3">
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                            onClick={() => moveMonth(-1)}
                        >
                            Tháng trước
                        </button>
                        <h3 className="text-sm font-semibold text-slate-900 capitalize">{monthLabel}</h3>
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                            onClick={() => moveMonth(1)}
                        >
                            Tháng sau
                        </button>
                    </div>
                    <div className="grid grid-cols-7 gap-2 mb-2">
                        {WEEK_DAYS.map((day) => (
                            <div key={day} className="text-center text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                                {day}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {calendarCells.map((cell) => {
                            const dayMeetings = meetingsByDate[cell.key] || [];
                            const isSelected = cell.key === selectedDateKey;
                            return (
                                <button
                                    key={cell.key}
                                    type="button"
                                    className={`min-h-[96px] rounded-xl border p-2 text-left transition ${
                                        isSelected
                                            ? 'border-primary bg-primary/5'
                                            : cell.isCurrentMonth
                                                ? 'border-slate-200/80 bg-white'
                                                : 'border-slate-100 bg-slate-50 text-slate-400'
                                    }`}
                                    onClick={() => setSelectedDate(cell.date)}
                                >
                                    <div className="text-xs font-semibold">{cell.date.getDate()}</div>
                                    <div className="mt-1 space-y-1">
                                        {dayMeetings.slice(0, 2).map((meeting) => (
                                            <div key={meeting.id} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary truncate">
                                                {meeting.title}
                                            </div>
                                        ))}
                                        {dayMeetings.length > 2 && (
                                            <div className="text-[10px] text-text-muted">+{dayMeetings.length - 2} lịch họp</div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-slate-900">
                            Sự kiện ngày {formatVietnamDate(selectedDate, '—')}
                        </h3>
                        <span className="text-xs text-text-muted">{selectedMeetings.length} lịch họp</span>
                    </div>
                    <p className="text-xs text-text-muted mb-3">
                        Chuột phải vào lịch họp để xem nhanh thành viên, ghi chú, link và thời gian bắt đầu.
                    </p>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                        {loading && (
                            <p className="text-sm text-text-muted">Đang tải dữ liệu lịch họp...</p>
                        )}
                        {!loading && selectedMeetings.length === 0 && (
                            <p className="text-sm text-text-muted">Không có lịch họp trong ngày này.</p>
                        )}
                        {!loading && selectedMeetings.map((meeting) => (
                            <div
                                key={meeting.id}
                                className="rounded-2xl border border-slate-200/80 p-3"
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    openMeetingDetails(meeting);
                                }}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-semibold text-slate-900">{meeting.title}</p>
                                        <p className="text-xs text-text-muted mt-1">{formatDateTime(meeting.scheduled_at)}</p>
                                        <p className="text-xs text-text-muted mt-1">
                                            Thành viên: {(meeting.attendees || []).length}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        {canManage && (
                                            <button type="button" className="text-primary font-semibold" onClick={() => startEdit(meeting)}>
                                                Sửa
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button type="button" className="text-danger font-semibold" onClick={() => deleteMeeting(meeting.id)}>
                                                Xóa
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {meeting.meeting_link && (
                                    <a className="text-xs text-primary mt-2 inline-block" href={meeting.meeting_link} target="_blank" rel="noreferrer">
                                        Mở liên kết họp
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
                        <span>Tổng lịch trong bộ lọc: {meetingMeta.total}</span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="rounded-full border border-slate-200/80 px-3 py-1"
                                disabled={meetingMeta.current_page <= 1}
                                onClick={() => fetchMeetings(meetingMeta.current_page - 1, filters)}
                            >
                                Trước
                            </button>
                            <span>
                                {meetingMeta.current_page}/{meetingMeta.last_page}
                            </span>
                            <button
                                type="button"
                                className="rounded-full border border-slate-200/80 px-3 py-1"
                                disabled={meetingMeta.current_page >= meetingMeta.last_page}
                                onClick={() => fetchMeetings(meetingMeta.current_page + 1, filters)}
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Cập nhật lịch họp #${editingId}` : 'Tạo lịch họp mới'}
                description="Chọn thời gian họp, thành viên tham gia và ghi chú cuộc họp."
                size="lg"
            >
                <form onSubmit={saveMeeting} className="space-y-3 text-sm">
                    <FormField label="Tiêu đề cuộc họp" required>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: Họp chốt tiến độ dự án"
                            required
                        />
                    </FormField>
                    <FormField label="Thời gian bắt đầu" required>
                        <input
                            type="datetime-local"
                            value={form.scheduled_at}
                            onChange={(e) => setForm((prev) => ({ ...prev, scheduled_at: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            required
                        />
                    </FormField>
                    <FormField label="Liên kết họp">
                        <input
                            type="text"
                            value={form.meeting_link}
                            onChange={(e) => setForm((prev) => ({ ...prev, meeting_link: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Google Meet, Zoom hoặc tài liệu chung"
                        />
                    </FormField>
                    <FormField label="Ghi chú cuộc họp">
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Nêu mục tiêu, đầu việc cần trao đổi"
                        />
                    </FormField>
                    <FormField label="Biên bản cuộc họp">
                        <textarea
                            value={form.minutes}
                            onChange={(e) => setForm((prev) => ({ ...prev, minutes: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Dùng khi cần lưu kết quả họp hoặc quyết định cuối cùng"
                        />
                    </FormField>
                    <div className="rounded-2xl border border-slate-200/80 p-3">
                        <p className="text-xs font-semibold text-slate-900 mb-2">Thành viên tham gia (multi select)</p>
                        <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                            {users.map((user) => {
                                const checked = (form.attendee_ids || []).includes(user.id);
                                return (
                                    <label key={user.id} className="flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleAttendee(user.id)}
                                        />
                                        <span>{user.name}</span>
                                        <span className="text-xs text-text-muted">({user.role})</span>
                                    </label>
                                );
                            })}
                            {users.length === 0 && (
                                <p className="text-xs text-text-muted">Không tải được danh sách thành viên.</p>
                            )}
                        </div>
                    </div>
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

            <Modal
                open={showDetails}
                onClose={() => setShowDetails(false)}
                title={detailMeeting?.title || 'Chi tiết lịch họp'}
                description="Thông tin cuộc họp từ thao tác chuột phải."
                size="md"
            >
                {!detailMeeting ? (
                    <p className="text-sm text-text-muted">Không có dữ liệu.</p>
                ) : (
                    <div className="space-y-3 text-sm">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-text-subtle">Thời gian bắt đầu</p>
                            <p className="font-semibold text-slate-900">{formatDateTime(detailMeeting.scheduled_at)}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-text-subtle">Thành viên tham gia</p>
                            {detailMeeting.attendees?.length ? (
                                <div className="mt-1 flex flex-wrap gap-2">
                                    {detailMeeting.attendees.map((attendee) => (
                                        <span key={attendee.id || `${detailMeeting.id}-${attendee.user_id}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                            {attendee.user?.name || `#${attendee.user_id}`}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-text-muted">Không có thành viên.</p>
                            )}
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-text-subtle">Ghi chú cuộc họp</p>
                            <p className="text-slate-800">{detailMeeting.description || '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-text-subtle">Biên bản</p>
                            <p className="text-slate-800">{detailMeeting.minutes || '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-text-subtle">Liên kết họp</p>
                            {detailMeeting.meeting_link ? (
                                <a href={detailMeeting.meeting_link} target="_blank" rel="noreferrer" className="text-primary font-semibold">
                                    {detailMeeting.meeting_link}
                                </a>
                            ) : (
                                <p className="text-text-muted">—</p>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </PageContainer>
    );
}
