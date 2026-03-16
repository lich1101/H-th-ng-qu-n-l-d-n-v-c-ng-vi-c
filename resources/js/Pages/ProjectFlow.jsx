import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from '@inertiajs/inertia-react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import Modal from '@/Components/Modal';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const TYPE_LABELS = {
    contract: 'Hợp đồng',
    project: 'Dự án',
    task: 'Công việc',
    item: 'Đầu việc',
    user: 'Nhân sự',
};

const TYPE_TONES = {
    contract: '#2563eb',
    project: '#0f766e',
    task: '#7c3aed',
    item: '#ea580c',
    user: '#0891b2',
};

const STATUS_LABELS = {
    moi_tao: 'Mới tạo',
    dang_trien_khai: 'Đang triển khai',
    cho_duyet: 'Chờ duyệt',
    hoan_thanh: 'Hoàn thành',
    tam_dung: 'Tạm dừng',
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    todo: 'Cần làm',
    doing: 'Đang làm',
    done: 'Hoàn tất',
    blocked: 'Bị chặn',
    active: 'Đang phụ trách',
    unassigned: 'Chưa phân công',
};

const PRIORITY_LABELS = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn',
    critical: 'Khẩn',
};

const ROLE_LABELS = {
    admin: 'Admin',
    quan_ly: 'Quản lý',
    nhan_vien: 'Nhân sự',
    ke_toan: 'Kế toán',
};

const SERVICE_LABELS = {
    backlinks: 'Backlinks',
    viet_content: 'Content',
    audit_content: 'Audit Content',
    cham_soc_website_tong_the: 'Website Care',
    khac: 'Khác',
};

const statusLabel = (value) => STATUS_LABELS[String(value || '').toLowerCase()] || value || '—';
const priorityLabel = (value) => PRIORITY_LABELS[String(value || '').toLowerCase()] || value || '—';
const roleLabel = (value) => ROLE_LABELS[String(value || '').toLowerCase()] || value || '—';

const colorByStatus = (value, fallback = '#2563eb') => {
    const key = String(value || '').toLowerCase();
    if (['dang_trien_khai', 'doing', 'active', 'approved'].includes(key)) return '#16a34a';
    if (['cho_duyet', 'pending'].includes(key)) return '#d97706';
    if (['blocked', 'tam_dung', 'rejected'].includes(key)) return '#dc2626';
    if (['hoan_thanh', 'done'].includes(key)) return '#0f766e';
    if (['unassigned'].includes(key)) return '#64748b';
    return fallback;
};

const clampPercent = (value) => {
    const parsed = Number(value || 0);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
};

const formatDate = (raw, withTime = false) => {
    if (!raw) return '—';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return String(raw);
    const base = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    if (!withTime) return base;
    return `${base} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const formatCurrency = (value) => `${Number(value || 0).toLocaleString('vi-VN')} VNĐ`;

const serviceLabel = (project) => {
    if (!project) return '—';
    if (project.service_type === 'khac') return project.service_type_other || 'Khác';
    return SERVICE_LABELS[project.service_type] || project.service_type || '—';
};

const safeText = (value, fallback = '—') => {
    if (value === null || value === undefined || value === '') return fallback;
    return value;
};

const shortText = (value, limit = 72) => {
    const text = String(value || '').trim();
    if (!text) return '—';
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1).trim()}...`;
};

const hexToRgba = (hex, alpha) => {
    const value = String(hex || '').replace('#', '');
    if (value.length !== 6) return `rgba(37, 99, 235, ${alpha})`;
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const nodeStyle = (accent, isActive) => ({
    width: 296,
    padding: 0,
    overflow: 'hidden',
    cursor: 'pointer',
    borderRadius: 28,
    border: `1px solid ${hexToRgba(accent, isActive ? 0.58 : 0.22)}`,
    background: '#ffffff',
    boxShadow: isActive
        ? `0 24px 56px ${hexToRgba(accent, 0.24)}`
        : '0 16px 40px rgba(15, 23, 42, 0.08)',
});

function FlowNodeCard({ detail }) {
    const accent = detail.accentColor || TYPE_TONES[detail.type] || '#2563eb';
    const cardRows = (detail.rows || []).slice(0, 2);
    const cardStats = (detail.stats || []).slice(0, 4);

    return (
        <div className="relative overflow-hidden text-left">
            <div
                className="absolute inset-x-0 top-0 h-20"
                style={{ background: `linear-gradient(135deg, ${hexToRgba(accent, 0.18)}, ${hexToRgba(accent, 0.03)})` }}
            />
            <div className="relative px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div
                            className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                            style={{ backgroundColor: hexToRgba(accent, 0.12), color: accent }}
                        >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                            {TYPE_LABELS[detail.type] || detail.type}
                        </div>
                        <div className="mt-3 text-[15px] font-semibold leading-5 text-slate-900 break-words">
                            {detail.title}
                        </div>
                        {detail.subtitle && (
                            <div className="mt-1 text-[11px] leading-4 text-slate-500 break-words">
                                {detail.subtitle}
                            </div>
                        )}
                    </div>
                    <div
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ backgroundColor: hexToRgba(accent, 0.12), color: accent }}
                    >
                        {detail.statusText}
                    </div>
                </div>

                {detail.showProgress !== false && typeof detail.progress === 'number' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Tiến độ</span>
                            <span className="font-semibold text-slate-700">{clampPercent(detail.progress)}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                                className="h-full rounded-full"
                                style={{ width: `${clampPercent(detail.progress)}%`, backgroundColor: accent }}
                            />
                        </div>
                    </div>
                )}

                {cardStats.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                        {cardStats.map((stat) => (
                            <div
                                key={`${detail.id}-${stat.label}`}
                                className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2"
                            >
                                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{stat.label}</div>
                                <div className="mt-1 text-[13px] font-semibold text-slate-800 break-words">{stat.value}</div>
                            </div>
                        ))}
                    </div>
                )}

                {cardRows.length > 0 && (
                    <div className="space-y-2 border-t border-slate-200/80 pt-3">
                        {cardRows.map((row) => (
                            <div key={`${detail.id}-${row.label}`} className="flex items-start justify-between gap-3 text-[11px]">
                                <span className="text-slate-400">{row.label}</span>
                                <span className="text-right font-semibold text-slate-700 break-words">{row.value}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="text-slate-400">{detail.footer || 'Nhấn để xem chi tiết'}</span>
                    <span className="font-semibold" style={{ color: accent }}>
                        Xem popup
                    </span>
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, hint, tone }) {
    return (
        <div className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</div>
            <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
            <div className="mt-2 text-sm" style={{ color: tone || '#64748b' }}>
                {hint}
            </div>
        </div>
    );
}

function DetailList({ rows }) {
    return (
        <div className="space-y-3">
            {(rows || []).map((row) => (
                <div
                    key={`${row.label}-${row.value}`}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3"
                >
                    <div className="text-sm text-slate-500">{row.label}</div>
                    <div className="max-w-[60%] text-right text-sm font-semibold text-slate-900 break-words">{row.value}</div>
                </div>
            ))}
        </div>
    );
}

export default function ProjectFlow({ auth, projectId }) {
    const toast = useToast();
    const [flow, setFlow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedDetail, setSelectedDetail] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/projects/${projectId}/flow`);
            setFlow(res.data || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được luồng dự án.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    const overview = useMemo(() => {
        if (!flow?.project) return [];
        const tasks = flow.tasks || [];
        const items = flow.items || [];
        const assigneeCount = new Set(items.filter((item) => item.assignee?.id).map((item) => item.assignee.id)).size;
        const activeTasks = tasks.filter((task) => !['done', 'hoan_thanh'].includes(String(task.status || '').toLowerCase())).length;
        const contractValue = flow.contract ? formatCurrency(flow.contract.value) : 'Chưa có';

        return [
            {
                label: 'Hợp đồng',
                value: contractValue,
                hint: flow.contract ? statusLabel(flow.contract.status || flow.contract.approval_status) : 'Dự án chưa gắn hợp đồng',
                tone: colorByStatus(flow.contract?.status || flow.contract?.approval_status, TYPE_TONES.contract),
            },
            {
                label: 'Tiến độ dự án',
                value: `${clampPercent(flow.project.progress_percent)}%`,
                hint: `${tasks.length} công việc đang theo dõi`,
                tone: colorByStatus(flow.project.status, TYPE_TONES.project),
            },
            {
                label: 'Công việc mở',
                value: String(activeTasks),
                hint: `${items.length} đầu việc trong cây`,
                tone: TYPE_TONES.task,
            },
            {
                label: 'Nhân sự tham gia',
                value: String(assigneeCount),
                hint: 'Gom theo người để cây gọn hơn',
                tone: TYPE_TONES.user,
            },
        ];
    }, [flow]);

    const { nodes, edges } = useMemo(() => {
        if (!flow?.project) {
            return { nodes: [], edges: [] };
        }

        const nodes = [];
        const edges = [];
        const project = flow.project;
        const contract = flow.contract;
        const tasks = flow.tasks || [];
        const items = flow.items || [];
        const selectedId = selectedDetail?.id || null;

        const itemsByTask = items.reduce((acc, item) => {
            acc[item.task_id] = acc[item.task_id] || [];
            acc[item.task_id].push(item);
            return acc;
        }, {});

        const groupedAssignees = items.reduce((acc, item) => {
            const key = item.assignee?.id ? `user-${item.assignee.id}` : 'user-unassigned';
            if (!acc[key]) {
                acc[key] = {
                    id: key,
                    user: item.assignee || null,
                    items: [],
                };
            }
            acc[key].items.push(item);
            return acc;
        }, {});

        const createNode = (id, detail, x, y) => {
            const accent = detail.accentColor || TYPE_TONES[detail.type] || '#2563eb';
            nodes.push({
                id,
                position: { x, y },
                data: {
                    label: <FlowNodeCard detail={detail} />,
                    detail,
                },
                style: nodeStyle(accent, selectedId === id),
                sourcePosition: 'bottom',
                targetPosition: 'top',
                draggable: false,
            });
        };

        const contractIdNode = contract ? `contract-${contract.id}` : 'contract-empty';
        const contractStatus = contract ? statusLabel(contract.status || contract.approval_status) : 'Chưa có hợp đồng';
        createNode(contractIdNode, {
            id: contractIdNode,
            type: 'contract',
            title: contract ? (contract.title || contract.code || `Hợp đồng #${contract.id}`) : 'Chưa có hợp đồng',
            subtitle: contract?.code ? `Mã ${contract.code}` : 'Chưa liên kết hợp đồng cho dự án này',
            statusText: contract ? contractStatus : 'Trống',
            accentColor: contract ? colorByStatus(contract.status || contract.approval_status, TYPE_TONES.contract) : '#94a3b8',
            showProgress: false,
            stats: contract
                ? [
                      { label: 'Giá trị', value: formatCurrency(contract.value) },
                      { label: 'Thanh toán', value: `${contract.payment_times || 0} đợt` },
                  ]
                : [{ label: 'Trạng thái', value: 'Chưa có dữ liệu' }],
            rows: contract
                ? [
                      { label: 'Ngày ký', value: formatDate(contract.signed_at) },
                      { label: 'Hiệu lực đến', value: formatDate(contract.end_date) },
                      { label: 'Bắt đầu', value: formatDate(contract.start_date) },
                      { label: 'Duyệt', value: statusLabel(contract.approval_status) },
                  ]
                : [{ label: 'Gợi ý', value: 'Gắn hợp đồng để cây dữ liệu đầy đủ hơn.' }],
            description: contract?.notes || 'Chưa có ghi chú hợp đồng.',
            footer: contract ? 'Nút gốc của luồng dự án' : 'Dự án này chưa gắn hợp đồng',
            modalStats: contract
                ? [
                      { label: 'Giá trị', value: formatCurrency(contract.value) },
                      { label: 'Trạng thái', value: contractStatus },
                      { label: 'Ngày ký', value: formatDate(contract.signed_at) },
                      { label: 'Kết thúc', value: formatDate(contract.end_date) },
                  ]
                : [{ label: 'Tình trạng', value: 'Chưa có hợp đồng' }],
        }, 0, 0);

        const projectIdNode = `project-${project.id}`;
        createNode(projectIdNode, {
            id: projectIdNode,
            type: 'project',
            title: project.name || `Dự án #${project.id}`,
            subtitle: [project.code || 'Chưa có mã', serviceLabel(project)].filter(Boolean).join(' • '),
            statusText: statusLabel(project.status),
            accentColor: colorByStatus(project.status, TYPE_TONES.project),
            progress: clampPercent(project.progress_percent),
            stats: [
                { label: 'Công việc', value: String(tasks.length) },
                { label: 'Đầu việc', value: String(items.length) },
                {
                    label: 'Nhân sự',
                    value: String(new Set(items.filter((item) => item.assignee?.id).map((item) => item.assignee.id)).size),
                },
                { label: 'Bàn giao', value: statusLabel(project.handover_status) },
            ],
            rows: [
                { label: 'Chủ trì', value: safeText(project.owner?.name) },
                { label: 'Khách hàng', value: safeText(project.client?.name) },
                { label: 'Bắt đầu', value: formatDate(project.start_date) },
                { label: 'Deadline', value: formatDate(project.deadline) },
                { label: 'Ngân sách', value: project.budget ? formatCurrency(project.budget) : '—' },
                { label: 'Repo', value: safeText(project.repo_url) },
            ],
            description: project.customer_requirement || 'Chưa có yêu cầu khách hàng cho dự án này.',
            footer: 'Nút trung tâm của toàn bộ luồng',
            modalStats: [
                { label: 'Tiến độ', value: `${clampPercent(project.progress_percent)}%` },
                { label: 'Trạng thái', value: statusLabel(project.status) },
                { label: 'Công việc', value: String(tasks.length) },
                { label: 'Đầu việc', value: String(items.length) },
            ],
            href: route('projects.detail', project.id),
            hrefLabel: 'Mở trang dự án',
        }, 0, 220);

        edges.push({
            id: `${contractIdNode}-${projectIdNode}`,
            source: contractIdNode,
            target: projectIdNode,
            type: 'smoothstep',
            animated: Boolean(contract),
            style: { stroke: '#94a3b8', strokeWidth: 2.1 },
        });

        const ITEM_GAP = 320;
        const TASK_GAP = 120;
        const taskLayouts = [];
        let cursorX = 0;

        tasks.forEach((task) => {
            const list = itemsByTask[task.id] || [];
            const count = Math.max(list.length, 1);
            const firstX = cursorX;
            const lastX = cursorX + (count - 1) * ITEM_GAP;
            const centerX = (firstX + lastX) / 2;
            taskLayouts.push({ task, list, firstX, centerX, lastX });
            cursorX = lastX + ITEM_GAP + TASK_GAP;
        });

        const rawXs = [];
        taskLayouts.forEach((layout) => {
            rawXs.push(layout.centerX);
            layout.list.forEach((_, index) => {
                rawXs.push(layout.firstX + index * ITEM_GAP);
            });
        });
        const minX = rawXs.length ? Math.min(...rawXs) : 0;
        const maxX = rawXs.length ? Math.max(...rawXs) : 0;
        const offsetX = -((minX + maxX) / 2);

        taskLayouts.forEach((layout) => {
            const task = layout.task;
            const taskNodeId = `task-${task.id}`;
            const taskX = layout.centerX + offsetX;
            const taskItems = layout.list || [];
            createNode(taskNodeId, {
                id: taskNodeId,
                type: 'task',
                title: task.title || `Công việc #${task.id}`,
                subtitle: [safeText(task.department?.name, ''), safeText(task.assignee?.name, '')].filter(Boolean).join(' • '),
                statusText: statusLabel(task.status),
                accentColor: colorByStatus(task.status, TYPE_TONES.task),
                progress: clampPercent(task.progress_percent),
                stats: [
                    { label: 'Đầu việc', value: String(taskItems.length) },
                    { label: 'Ưu tiên', value: priorityLabel(task.priority) },
                ],
                rows: [
                    { label: 'Phụ trách', value: safeText(task.assignee?.name) },
                    { label: 'Reviewer', value: safeText(task.reviewer?.name) },
                    { label: 'Phòng ban', value: safeText(task.department?.name) },
                    { label: 'Bắt đầu', value: formatDate(task.start_at, true) },
                    { label: 'Deadline', value: formatDate(task.deadline, true) },
                    {
                        label: 'Xác nhận',
                        value: task.require_acknowledgement
                            ? `Bắt buộc${task.acknowledged_at ? ` • ${formatDate(task.acknowledged_at, true)}` : ''}`
                            : 'Không yêu cầu',
                    },
                ],
                description: task.description || 'Chưa có mô tả công việc.',
                footer: taskItems.length ? `${taskItems.length} đầu việc đang nằm dưới nhánh này` : 'Chưa có đầu việc',
                modalStats: [
                    { label: 'Tiến độ', value: `${clampPercent(task.progress_percent)}%` },
                    { label: 'Trạng thái', value: statusLabel(task.status) },
                    { label: 'Đầu việc', value: String(taskItems.length) },
                    { label: 'Deadline', value: formatDate(task.deadline, true) },
                ],
                href: route('tasks.detail', task.id),
                hrefLabel: 'Mở trang công việc',
            }, taskX, 470);

            edges.push({
                id: `${projectIdNode}-${taskNodeId}`,
                source: projectIdNode,
                target: taskNodeId,
                type: 'smoothstep',
                animated: ['doing', 'dang_trien_khai'].includes(String(task.status || '').toLowerCase()),
                style: {
                    stroke: hexToRgba(colorByStatus(task.status, TYPE_TONES.task), 0.38),
                    strokeWidth: 2.1,
                },
            });

            taskItems.forEach((item, index) => {
                const itemNodeId = `item-${item.id}`;
                const itemX = layout.firstX + index * ITEM_GAP + offsetX;
                createNode(itemNodeId, {
                    id: itemNodeId,
                    type: 'item',
                    title: item.title || `Đầu việc #${item.id}`,
                    subtitle: safeText(item.assignee?.name, 'Chưa gán nhân sự'),
                    statusText: statusLabel(item.status),
                    accentColor: colorByStatus(item.status, TYPE_TONES.item),
                    progress: clampPercent(item.progress_percent),
                    stats: [
                        { label: 'Ưu tiên', value: priorityLabel(item.priority) },
                        { label: 'Deadline', value: formatDate(item.deadline, true) },
                    ],
                    rows: [
                        { label: 'Thuộc task', value: safeText(task.title) },
                        { label: 'Nhân sự', value: safeText(item.assignee?.name, 'Chưa phân công') },
                        { label: 'Reviewer', value: safeText(item.reviewer?.name) },
                        { label: 'Bắt đầu', value: formatDate(item.start_date) },
                        { label: 'Deadline', value: formatDate(item.deadline, true) },
                        { label: 'Tạo lúc', value: formatDate(item.created_at, true) },
                    ],
                    description: item.description || 'Chưa có mô tả đầu việc.',
                    footer: item.assignee ? 'Liên kết xuống nhân sự phụ trách' : 'Đầu việc này chưa gán người phụ trách',
                    modalStats: [
                        { label: 'Tiến độ', value: `${clampPercent(item.progress_percent)}%` },
                        { label: 'Trạng thái', value: statusLabel(item.status) },
                        { label: 'Ưu tiên', value: priorityLabel(item.priority) },
                        { label: 'Phụ trách', value: safeText(item.assignee?.name, 'Chưa phân công') },
                    ],
                }, itemX, 730);

                edges.push({
                    id: `${taskNodeId}-${itemNodeId}`,
                    source: taskNodeId,
                    target: itemNodeId,
                    type: 'smoothstep',
                    animated: ['doing', 'dang_trien_khai'].includes(String(item.status || '').toLowerCase()),
                    style: {
                        stroke: hexToRgba(colorByStatus(item.status, TYPE_TONES.item), 0.28),
                        strokeWidth: 1.8,
                    },
                });
            });
        });

        const assigneeGroups = Object.values(groupedAssignees);
        if (assigneeGroups.length > 0) {
            const userSpan = (assigneeGroups.length - 1) * ITEM_GAP;
            const userStartX = -(userSpan / 2);
            assigneeGroups.forEach((group, index) => {
                const userX = userStartX + index * ITEM_GAP;
                const userNodeId = group.id;
                const taskCount = new Set(group.items.map((item) => item.task_id)).size;
                createNode(userNodeId, {
                    id: userNodeId,
                    type: 'user',
                    title: group.user?.name || 'Chưa phân công',
                    subtitle: group.user?.email || 'Nhóm các đầu việc chưa gán người phụ trách',
                    statusText: group.user ? roleLabel(group.user.role) : 'Chờ gán',
                    accentColor: colorByStatus(group.user ? 'active' : 'unassigned', TYPE_TONES.user),
                    showProgress: false,
                    stats: [
                        { label: 'Đầu việc', value: String(group.items.length) },
                        { label: 'Công việc', value: String(taskCount) },
                    ],
                    rows: [
                        { label: 'Email', value: safeText(group.user?.email) },
                        { label: 'Vai trò', value: group.user ? roleLabel(group.user.role) : 'Chưa phân công' },
                        { label: 'Danh sách đầu việc', value: shortText(group.items.map((item) => item.title).join(', '), 90) },
                    ],
                    description: group.items.length
                        ? `Đang phụ trách ${group.items.length} đầu việc trong cây hiện tại.`
                        : 'Chưa có đầu việc gắn với nhân sự này.',
                    footer: group.user ? 'Node nhân sự được gom theo người để cây gọn hơn' : 'Nhóm đầu việc chưa có người phụ trách',
                    modalStats: [
                        { label: 'Đầu việc', value: String(group.items.length) },
                        { label: 'Công việc', value: String(taskCount) },
                        { label: 'Vai trò', value: group.user ? roleLabel(group.user.role) : 'Chưa phân công' },
                    ],
                }, userX, 1000);

                group.items.forEach((item) => {
                    edges.push({
                        id: `item-${item.id}-${userNodeId}`,
                        source: `item-${item.id}`,
                        target: userNodeId,
                        type: 'smoothstep',
                        animated: !['done', 'hoan_thanh'].includes(String(item.status || '').toLowerCase()),
                        style: {
                            stroke: hexToRgba(colorByStatus(item.status, TYPE_TONES.user), 0.24),
                            strokeWidth: 1.5,
                            strokeDasharray: '6 6',
                        },
                    });
                });
            });
        }

        return { nodes, edges };
    }, [flow, selectedDetail]);

    return (
        <PageContainer
            auth={auth}
            title="Luồng dự án"
            description={flow?.project?.name
                ? `Theo dõi chuỗi hợp đồng → dự án → công việc → đầu việc → nhân sự của ${flow.project.name}.`
                : 'Theo dõi chuỗi hợp đồng → dự án → công việc → đầu việc → nhân sự.'}
        >
            <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {overview.map((card) => (
                        <SummaryCard
                            key={card.label}
                            label={card.label}
                            value={card.value}
                            hint={card.hint}
                            tone={card.tone}
                        />
                    ))}
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Cách đọc cây</div>
                            <div className="mt-2 text-sm text-slate-600">
                                Mỗi node giờ hiển thị theo dạng thẻ: loại dữ liệu, tiêu đề, trạng thái, tiến độ và 2-4 dòng metadata quan trọng.
                                Nhấn vào node để mở popup chi tiết thay vì hiện toast ngắn như trước.
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {[
                                { label: 'Đang chạy', tone: colorByStatus('doing') },
                                { label: 'Chờ duyệt', tone: colorByStatus('pending') },
                                { label: 'Bị chặn / tạm dừng', tone: colorByStatus('blocked') },
                            ].map((item) => (
                                <span
                                    key={item.label}
                                    className="rounded-full px-3 py-1.5 text-xs font-semibold"
                                    style={{ backgroundColor: hexToRgba(item.tone, 0.12), color: item.tone }}
                                >
                                    {item.label}
                                </span>
                            ))}
                            <button
                                type="button"
                                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={fetchData}
                            >
                                Tải lại
                            </button>
                            <Link
                                href={route('projects.detail', projectId)}
                                className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                            >
                                Quay lại dự án
                            </Link>
                        </div>
                    </div>
                </div>

                {loading && (
                    <div className="rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-10 text-sm text-slate-500">
                        Đang tải cây luồng dự án...
                    </div>
                )}

                {!loading && !flow?.project && (
                    <div className="rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-10 text-sm text-slate-500">
                        Không có dữ liệu luồng cho dự án này.
                    </div>
                )}

                {!loading && flow?.project && (
                    <div className="h-[78vh] min-h-[620px] overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            fitView
                            fitViewOptions={{ padding: 0.14 }}
                            nodesDraggable={false}
                            nodesConnectable={false}
                            onNodeClick={(_, node) => {
                                setSelectedDetail(node?.data?.detail || null);
                            }}
                            defaultEdgeOptions={{ animated: false, type: 'smoothstep' }}
                            zoomOnDoubleClick={false}
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background color="#dbe3ef" gap={22} size={1.2} />
                            <Controls showInteractive={false} />
                        </ReactFlow>
                    </div>
                )}
            </div>

            <Modal
                open={Boolean(selectedDetail)}
                onClose={() => setSelectedDetail(null)}
                size="xl"
                title={selectedDetail?.title}
                description={selectedDetail ? `${TYPE_LABELS[selectedDetail.type]} • ${selectedDetail.statusText}` : ''}
            >
                {selectedDetail && (
                    <div className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {(selectedDetail.modalStats || selectedDetail.stats || []).map((stat) => (
                                <div
                                    key={`${selectedDetail.id}-${stat.label}`}
                                    className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 px-4 py-4"
                                >
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{stat.label}</div>
                                    <div className="mt-2 text-base font-semibold text-slate-900 break-words">{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                            <div className="space-y-4">
                                <div className="rounded-[28px] border border-slate-200/80 bg-white p-5">
                                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Thông tin chuẩn hoá</div>
                                    <div className="mt-4">
                                        <DetailList rows={selectedDetail.rows || []} />
                                    </div>
                                </div>

                                <div className="rounded-[28px] border border-slate-200/80 bg-white p-5">
                                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Mô tả chi tiết</div>
                                    <div className="mt-3 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                                        {selectedDetail.description || 'Chưa có mô tả chi tiết cho nút này.'}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/70 p-5">
                                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Tóm tắt nhanh</div>
                                    <div className="mt-4 space-y-3 text-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-slate-500">Loại dữ liệu</span>
                                            <span className="font-semibold text-slate-900">{TYPE_LABELS[selectedDetail.type] || selectedDetail.type}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-slate-500">Trạng thái</span>
                                            <span className="font-semibold text-slate-900">{selectedDetail.statusText}</span>
                                        </div>
                                        {typeof selectedDetail.progress === 'number' && (
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-slate-500">Tiến độ</span>
                                                <span className="font-semibold text-slate-900">{clampPercent(selectedDetail.progress)}%</span>
                                            </div>
                                        )}
                                        {selectedDetail.subtitle && (
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-slate-500">Ngữ cảnh</span>
                                                <span className="max-w-[65%] text-right font-semibold text-slate-900 break-words">{selectedDetail.subtitle}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-[28px] border border-slate-200/80 bg-white p-5">
                                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Gợi ý thao tác</div>
                                    <p className="mt-3 text-sm leading-7 text-slate-600">
                                        Popup này thay cho thông báo nhanh trước đây, nên mình giữ nội dung theo kiểu hồ sơ ngắn: dễ scan,
                                        đủ metadata, và hợp để đối chiếu khi xem luồng.
                                    </p>
                                    {selectedDetail.href && (
                                        <div className="mt-4">
                                            <Link
                                                href={selectedDetail.href}
                                                className="inline-flex rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                            >
                                                {selectedDetail.hrefLabel || 'Mở trang chi tiết'}
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </PageContainer>
    );
}
