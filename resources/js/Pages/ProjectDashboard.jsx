import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, {
    FILTER_GRID_RESPONSIVE,
    FILTER_GRID_SUBMIT_ROW,
    FILTER_SUBMIT_BUTTON_CLASS,
    FILTER_SUBMIT_PRIMARY_BUTTON_CLASS,
    FilterActionGroup,
    FilterField,
    filterControlClass,
} from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import TagMultiSelect from '@/Components/TagMultiSelect';
import AppIcon from '@/Components/AppIcon';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate } from '@/lib/vietnamTime';
import { Link } from '@inertiajs/inertia-react';

const paceTone = {
    behind: {
        label: 'Chậm tiến độ',
        chip: 'bg-rose-100 text-rose-700 border border-rose-200',
        bar: 'bg-rose-500',
    },
    on_track: {
        label: 'Kịp tiến độ',
        chip: 'bg-blue-100 text-blue-700 border border-blue-200',
        bar: 'bg-blue-500',
    },
    ahead: {
        label: 'Vượt tiến độ',
        chip: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        bar: 'bg-emerald-500',
    },
};

const projectStatusTone = {
    moi_tao: 'bg-slate-100 text-slate-700 border border-slate-200',
    dang_trien_khai: 'bg-blue-100 text-blue-700 border border-blue-200',
    cho_duyet: 'bg-amber-100 text-amber-700 border border-amber-200',
    hoan_thanh: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    tam_dung: 'bg-rose-100 text-rose-700 border border-rose-200',
};

const cardClass = 'rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-card';

function toInt(value, fallback = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.trunc(parsed);
}

function toPercent(value, digits = 1) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return '0%';
    return `${parsed.toFixed(digits)}%`;
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
}

function buildRouteUrl(routeName, params = {}) {
    const baseUrl = route(routeName);
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            const normalized = value.map((item) => String(item || '').trim()).filter(Boolean);
            if (normalized.length > 0) {
                searchParams.set(key, normalized.join(','));
            }
            return;
        }

        const normalized = String(value ?? '').trim();
        if (normalized) {
            searchParams.set(key, normalized);
        }
    });

    const queryString = searchParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

function normalizeFilters(filters) {
    const normalizeIds = (items) => Array.from(new Set((items || [])
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)))
        .sort((a, b) => a - b);

    const normalizeStrings = (items) => Array.from(new Set((items || [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));

    return {
        search: String(filters?.search || '').trim(),
        staff_ids: normalizeIds(filters?.staff_ids),
        project_statuses: normalizeStrings(filters?.project_statuses),
        pace_statuses: normalizeStrings(filters?.pace_statuses),
    };
}

function PaceBadge({ pace }) {
    const tone = paceTone[pace?.status] || paceTone.on_track;
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tone.chip}`}>
            {pace?.label || tone.label}
        </span>
    );
}

function SegmentedPaceBar({ summary }) {
    const rates = summary?.pace_rates || {};
    const paceCounts = summary?.pace_counts || {};
    const behind = Math.max(0, Number(rates.behind || 0));
    const onTrack = Math.max(0, Number(rates.on_track || 0));
    const ahead = Math.max(0, Number(rates.ahead || 0));
    const segments = [
        {
            key: 'behind',
            label: 'Chậm tiến độ',
            rate: behind,
            count: toInt(paceCounts.behind),
            barClass: 'bg-rose-500',
        },
        {
            key: 'on_track',
            label: 'Kịp tiến độ',
            rate: onTrack,
            count: toInt(paceCounts.on_track),
            barClass: 'bg-blue-500',
        },
        {
            key: 'ahead',
            label: 'Vượt tiến độ',
            rate: ahead,
            count: toInt(paceCounts.ahead),
            barClass: 'bg-emerald-500',
        },
    ];

    if ((behind + onTrack + ahead) <= 0) {
        return <div className="h-2 w-full rounded-full bg-slate-100" />;
    }

    return (
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
            {segments.map((segment) => (
                segment.rate > 0 ? (
                    <div
                        key={segment.key}
                        className={`${segment.barClass} cursor-help`}
                        style={{ width: `${segment.rate}%` }}
                        title={`${segment.label}: ${segment.count.toLocaleString('vi-VN')} (${toPercent(segment.rate)})`}
                    />
                ) : null
            ))}
        </div>
    );
}

function SummaryCard({ title, summary, icon, note, href = '' }) {
    const total = toInt(summary?.total);
    const completed = toInt(summary?.completed);
    const completionRate = toPercent(summary?.completion_rate);
    const avgActual = toPercent(summary?.avg_actual_progress);
    const avgExpected = toPercent(summary?.avg_expected_progress);
    const avgLag = toPercent(summary?.avg_lag_percent);

    const paceCounts = summary?.pace_counts || {};

    const content = (
        <>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">{title}</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{total.toLocaleString('vi-VN')}</p>
                    <p className="mt-1 text-xs text-text-muted">{note}</p>
                </div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-600">
                    <AppIcon name={icon} className="h-5 w-5" />
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>Hoàn thành</span>
                    <span className="font-semibold text-slate-700">
                        {completed.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')} ({completionRate})
                    </span>
                </div>
                <div className="mt-2.5">
                    <SegmentedPaceBar summary={summary} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-text-muted">
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        Chậm: {toInt(paceCounts.behind).toLocaleString('vi-VN')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        Kịp: {toInt(paceCounts.on_track).toLocaleString('vi-VN')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Vượt: {toInt(paceCounts.ahead).toLocaleString('vi-VN')}
                    </span>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2">
                    <div className="text-text-subtle">Thực tế TB</div>
                    <div className="mt-1 font-semibold text-slate-800">{avgActual}</div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2">
                    <div className="text-text-subtle">Kỳ vọng TB</div>
                    <div className="mt-1 font-semibold text-slate-800">{avgExpected}</div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2">
                    <div className="text-text-subtle">Lệch TB</div>
                    <div className="mt-1 font-semibold text-slate-800">{avgLag}</div>
                </div>
            </div>
        </>
    );

    if (href) {
        return (
            <Link href={href} className={`${cardClass} block transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.03]`}>
                {content}
            </Link>
        );
    }

    return (
        <div className={cardClass}>
            {content}
        </div>
    );
}

function StaffEntityCell({ summary, title, href = '' }) {
    const entityCardClass = `rounded-2xl border border-slate-200/80 bg-white p-3 ${
        href ? 'transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.03]' : ''
    }`;

    const cardContent = (
        <div className={entityCardClass}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">{title}</div>
            <div className="mt-1.5 flex items-end justify-between gap-2">
                <div className="text-lg font-semibold text-slate-900">{toInt(summary?.total).toLocaleString('vi-VN')}</div>
                <div className="text-xs text-text-muted">
                    Hoàn thành {toInt(summary?.completed).toLocaleString('vi-VN')} ({toPercent(summary?.completion_rate)})
                </div>
            </div>
            <div className="mt-2">
                <SegmentedPaceBar summary={summary} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
                <span>Thực tế {toPercent(summary?.avg_actual_progress)}</span>
                <span>Kỳ vọng {toPercent(summary?.avg_expected_progress)}</span>
            </div>
        </div>
    );

    if (href) {
        return (
            <Link href={href} className="block">
                {cardContent}
            </Link>
        );
    }

    return cardContent;
}

function MultiToggleChips({ options = [], selected = [], onToggle }) {
    const selectedSet = new Set(selected || []);
    return (
        <div className="flex flex-wrap gap-2">
            {options.map((option) => {
                const active = selectedSet.has(option.value);
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onToggle(option.value)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            active
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

export default function ProjectDashboard(props) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [filtersMeta, setFiltersMeta] = useState({
        project_status_options: [],
        pace_status_options: [],
        staff_options: [],
    });
    const [overview, setOverview] = useState({
        projects: null,
        tasks: null,
        task_items: null,
    });
    const [staffRows, setStaffRows] = useState([]);
    const [projectSpotlight, setProjectSpotlight] = useState([]);

    const [draftFilters, setDraftFilters] = useState({
        search: '',
        staff_ids: [],
        project_statuses: [],
        pace_statuses: [],
    });
    const [appliedFilters, setAppliedFilters] = useState({
        search: '',
        staff_ids: [],
        project_statuses: [],
        pace_statuses: [],
    });

    const loadDashboard = async (nextFilters) => {
        const normalized = normalizeFilters(nextFilters);
        setLoading(true);
        try {
            const { data } = await axios.get('/api/v1/project-dashboard/overview', {
                params: normalized,
            });
            setFiltersMeta({
                project_status_options: data?.filters?.project_status_options || [],
                pace_status_options: data?.filters?.pace_status_options || [],
                staff_options: data?.filters?.staff_options || [],
            });
            setOverview({
                projects: data?.overview?.projects || null,
                tasks: data?.overview?.tasks || null,
                task_items: data?.overview?.task_items || null,
            });
            setStaffRows(Array.isArray(data?.staff_rows) ? data.staff_rows : []);
            setProjectSpotlight(Array.isArray(data?.project_spotlight) ? data.project_spotlight : []);
            setAppliedFilters(normalized);
            setDraftFilters(normalized);
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.message || 'Không tải được dashboard quản lý dự án.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboard(appliedFilters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const staffTagOptions = useMemo(() => (
        (filtersMeta.staff_options || []).map((item) => ({
            id: Number(item?.id || 0),
            label: item?.label || `Nhân sự #${item?.id}`,
            meta: item?.meta || '',
        })).filter((item) => item.id > 0)
    ), [filtersMeta.staff_options]);

    const summaryStats = useMemo(() => {
        const projects = overview?.projects || {};
        const tasks = overview?.tasks || {};
        const items = overview?.task_items || {};

        return [
            {
                label: 'Dự án đang theo dõi',
                value: `${toInt(projects.total).toLocaleString('vi-VN')}`,
                note: `Hoàn thành ${toPercent(projects.completion_rate)}`,
            },
            {
                label: 'Công việc đang theo dõi',
                value: `${toInt(tasks.total).toLocaleString('vi-VN')}`,
                note: `Hoàn thành ${toPercent(tasks.completion_rate)}`,
            },
            {
                label: 'Đầu việc đang theo dõi',
                value: `${toInt(items.total).toLocaleString('vi-VN')}`,
                note: `Hoàn thành ${toPercent(items.completion_rate)}`,
            },
            {
                label: 'Nhân sự trong báo cáo',
                value: `${staffRows.length.toLocaleString('vi-VN')}`,
                note: 'Gộp theo phụ trách dự án / công việc / đầu việc',
            },
        ];
    }, [overview, staffRows.length]);

    const toggleFilterValue = (key, value) => {
        setDraftFilters((prev) => {
            const prevSet = new Set(prev[key] || []);
            if (prevSet.has(value)) {
                prevSet.delete(value);
            } else {
                prevSet.add(value);
            }
            return {
                ...prev,
                [key]: Array.from(prevSet),
            };
        });
    };

    const quickFilterText = useMemo(() => {
        const parts = [];
        if ((appliedFilters.staff_ids || []).length > 0) {
            parts.push(`${appliedFilters.staff_ids.length} nhân sự`);
        }
        if ((appliedFilters.project_statuses || []).length > 0) {
            parts.push(`${appliedFilters.project_statuses.length} trạng thái dự án`);
        }
        if ((appliedFilters.pace_statuses || []).length > 0) {
            parts.push(`${appliedFilters.pace_statuses.length} trạng thái tiến độ`);
        }
        if (appliedFilters.search) {
            parts.push(`Từ khóa "${appliedFilters.search}"`);
        }
        if (!parts.length) return 'Đang hiển thị toàn bộ dữ liệu theo quyền admin.';
        return `Bộ lọc hiện tại: ${parts.join(' • ')}.`;
    }, [appliedFilters]);

    const projectBoardUrl = useMemo(
        () => buildRouteUrl('projects.kanban'),
        []
    );
    const tasksBoardUrl = useMemo(
        () => buildRouteUrl('tasks.board'),
        []
    );
    const taskItemsBoardUrl = useMemo(
        () => buildRouteUrl('task-items.board'),
        []
    );

    return (
        <PageContainer
            auth={props.auth}
            title="Dashboard quản lý dự án"
            description="Theo dõi ngay tình trạng dự án, công việc và đầu việc theo từng nhân sự phụ trách. Hệ thống tự so sánh tiến độ thực tế với tiến độ kỳ vọng theo ngày để phân loại chậm, kịp hoặc vượt tiến độ."
            stats={summaryStats}
        >
            <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
                {quickFilterText}
            </div>

            <FilterToolbar
                enableSearch={false}
                title="Bộ lọc dashboard dự án"
                description="Lọc theo nhân sự phụ trách, trạng thái dự án và tình trạng so với tiến độ kỳ vọng. Nhấn Lọc để áp dụng."
                onSubmitFilters={() => loadDashboard(draftFilters)}
            >
                <div className={FILTER_GRID_RESPONSIVE}>
                    <FilterField label="Nhân sự phụ trách" hint="Có thể chọn nhiều nhân sự cùng lúc.">
                        <TagMultiSelect
                            options={staffTagOptions}
                            selectedIds={draftFilters.staff_ids}
                            onChange={(ids) => setDraftFilters((prev) => ({ ...prev, staff_ids: ids }))}
                            addPlaceholder="Tìm và thêm nhân sự"
                            emptyLabel="Để trống = tất cả nhân sự"
                            summaryEmpty="Tất cả nhân sự"
                        />
                    </FilterField>

                    <FilterField label="Tìm kiếm">
                        <input
                            type="text"
                            className={filterControlClass}
                            value={draftFilters.search}
                            placeholder="Tên dự án, mã dự án, tên/email phụ trách..."
                            onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
                        />
                    </FilterField>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <FilterField label="Trạng thái dự án">
                        <MultiToggleChips
                            options={filtersMeta.project_status_options}
                            selected={draftFilters.project_statuses}
                            onToggle={(value) => toggleFilterValue('project_statuses', value)}
                        />
                    </FilterField>

                    <FilterField label="Tình trạng tiến độ (so với kỳ vọng)">
                        <MultiToggleChips
                            options={filtersMeta.pace_status_options}
                            selected={draftFilters.pace_statuses}
                            onToggle={(value) => toggleFilterValue('pace_statuses', value)}
                        />
                    </FilterField>
                </div>

                <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                    <button type="submit" className={FILTER_SUBMIT_PRIMARY_BUTTON_CLASS}>
                        {loading ? 'Đang lọc...' : 'Lọc dashboard'}
                    </button>
                    <button
                        type="button"
                        className={FILTER_SUBMIT_BUTTON_CLASS}
                        onClick={() => {
                            const cleared = {
                                search: '',
                                staff_ids: [],
                                project_statuses: [],
                                pace_statuses: [],
                            };
                            setDraftFilters(cleared);
                            loadDashboard(cleared);
                        }}
                    >
                        Đặt lại
                    </button>
                </FilterActionGroup>
            </FilterToolbar>

            <div className="grid gap-4 lg:grid-cols-3">
                <SummaryCard
                    title="Dự án phụ trách"
                    summary={overview.projects || {}}
                    icon="project"
                    note="Tình trạng dự án theo tiến độ thực tế vs kỳ vọng."
                    href={projectBoardUrl}
                />
                <SummaryCard
                    title="Công việc phụ trách"
                    summary={overview.tasks || {}}
                    icon="tasks"
                    note="Mức độ hoàn thành công việc theo nhân sự được giao."
                    href={tasksBoardUrl}
                />
                <SummaryCard
                    title="Đầu việc phụ trách"
                    summary={overview.task_items || {}}
                    icon="check"
                    note="Đầu việc chi tiết dùng để đo sát độ trễ theo ngày."
                    href={taskItemsBoardUrl}
                />
            </div>

            <div className={`${cardClass} mt-5`}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Thống kê theo nhân sự phụ trách</h3>
                        <p className="mt-1 text-sm text-text-muted">
                            Vào màn là thấy ngay nhân sự nào đang chậm, kịp hay vượt tiến độ ở cả dự án, công việc và đầu việc.
                        </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                        {staffRows.length.toLocaleString('vi-VN')} nhân sự
                    </span>
                </div>

                {staffRows.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-text-muted">
                        Chưa có dữ liệu nhân sự phù hợp với bộ lọc hiện tại.
                    </div>
                ) : (
                    <div className="mt-4 space-y-3">
                        {staffRows.map((row) => (
                            <div key={row.staff?.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">{row.staff?.name || 'Nhân sự'}</p>
                                        <p className="truncate text-xs text-text-muted">
                                            {row.staff?.email || '—'}
                                            {row.staff?.department_name ? ` • ${row.staff.department_name}` : ''}
                                            {row.staff?.role ? ` • ${row.staff.role}` : ''}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
                                        Tổng thực thể: <span className="font-semibold text-slate-800">{toInt(row.total_entities).toLocaleString('vi-VN')}</span>
                                    </div>
                                </div>
                                <div className="grid gap-2.5 lg:grid-cols-3">
                                    <StaffEntityCell
                                        title="Dự án"
                                        summary={row.projects}
                                        href={Number(row.staff?.id || 0) > 0
                                            ? buildRouteUrl('projects.kanban', { owner_ids: [Number(row.staff.id)] })
                                            : ''}
                                    />
                                    <StaffEntityCell
                                        title="Công việc"
                                        summary={row.tasks}
                                        href={Number(row.staff?.id || 0) > 0
                                            ? buildRouteUrl('tasks.board', { assignee_ids: [Number(row.staff.id)] })
                                            : ''}
                                    />
                                    <StaffEntityCell
                                        title="Đầu việc"
                                        summary={row.task_items}
                                        href={Number(row.staff?.id || 0) > 0
                                            ? buildRouteUrl('task-items.board', { assignee_ids: [Number(row.staff.id)] })
                                            : ''}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={`${cardClass} mt-5`}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Dự án cần chú ý theo tiến độ kỳ vọng</h3>
                        <p className="mt-1 text-sm text-text-muted">
                            Danh sách ưu tiên hiển thị các dự án chậm trước, dựa trên độ lệch giữa tiến độ thực tế và tiến độ kỳ vọng.
                        </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                        {projectSpotlight.length.toLocaleString('vi-VN')} dự án
                    </span>
                </div>

                {projectSpotlight.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-text-muted">
                        Chưa có dự án phù hợp với bộ lọc hiện tại.
                    </div>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-text-subtle">
                                <tr>
                                    <th className="px-3 py-2">Dự án</th>
                                    <th className="px-3 py-2">Phụ trách</th>
                                    <th className="px-3 py-2">Trạng thái dự án</th>
                                    <th className="px-3 py-2">Tiến độ</th>
                                    <th className="px-3 py-2">Kỳ vọng</th>
                                    <th className="px-3 py-2">Lệch</th>
                                    <th className="px-3 py-2">Tình trạng</th>
                                    <th className="px-3 py-2">Hạn</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projectSpotlight.map((project) => (
                                    <tr key={project.id} className="border-t border-slate-100 text-slate-700">
                                        <td className="px-3 py-2.5">
                                            <div className="font-semibold text-slate-900">{project.name || 'Dự án'}</div>
                                            <div className="text-xs text-text-muted">{project.code || `#${project.id}`}</div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="font-medium">{project.owner_name || 'Chưa phân công'}</div>
                                            <div className="text-xs text-text-muted">{project.owner_email || '—'}</div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${projectStatusTone[project.status] || 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                                                {project.status_label || project.status || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 font-semibold">{toPercent(project.progress_percent, 0)}</td>
                                        <td className="px-3 py-2.5">{toPercent(project?.pace?.expected_progress, 0)}</td>
                                        <td className="px-3 py-2.5">
                                            <span className={`${toNumber(project?.pace?.lag_percent) > 0 ? 'text-rose-600' : 'text-emerald-600'} font-semibold`}>
                                                {toPercent(project?.pace?.lag_percent, 0)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <PaceBadge pace={project.pace} />
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-text-muted">
                                            {project.deadline ? formatVietnamDate(project.deadline) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </PageContainer>
    );
}
