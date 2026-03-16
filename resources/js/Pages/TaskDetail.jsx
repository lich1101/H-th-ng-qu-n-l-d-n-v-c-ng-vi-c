import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const statusLabel = (value) => {
  switch (value) {
    case 'todo':
      return 'Cần làm';
    case 'doing':
      return 'Đang làm';
    case 'done':
      return 'Hoàn tất';
    case 'blocked':
      return 'Bị chặn';
    default:
      return value || '—';
  }
};

const formatDate = (raw) => {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return String(raw).slice(0, 10);
  }
};

export default function TaskDetail(props) {
  const toast = useToast();
  const taskId = props.taskId;
  const [task, setTask] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [taskRes, itemRes] = await Promise.all([
        axios.get(`/api/v1/tasks/${taskId}`),
        axios.get(`/api/v1/tasks/${taskId}/items`, { params: { per_page: 200 } }),
      ]);
      setTask(taskRes.data || null);
      setItems(itemRes.data?.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không tải được công việc.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const stats = task
    ? [
        { label: 'Tiến độ', value: `${task.progress_percent ?? 0}%` },
        { label: 'Đầu việc', value: String(items.length) },
        { label: 'Trạng thái', value: statusLabel(task.status) },
        { label: 'Deadline', value: task.deadline ? formatDate(task.deadline) : '—' },
      ]
    : [];

  return (
    <PageContainer
      auth={props.auth}
      title="Chi tiết công việc"
      description="Theo dõi tiến độ và danh sách đầu việc."
      stats={stats}
    >
      {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
      {!loading && task && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                <p className="text-xs text-text-muted">Dự án: {task.project?.name || '—'}</p>
              </div>
              <span className="text-xs text-text-muted">{statusLabel(task.status)}</span>
            </div>
            <div className="mt-3 text-sm text-text-muted space-y-2">
              <div>Phụ trách: <span className="text-slate-900 font-semibold">{task.assignee?.name || '—'}</span></div>
              <div>Tiến độ: <span className="text-slate-900 font-semibold">{task.progress_percent ?? 0}%</span></div>
              <div>Deadline: <span className="text-slate-900 font-semibold">{task.deadline ? formatDate(task.deadline) : '—'}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900">Danh sách đầu việc</h4>
              <button className="text-sm text-primary font-semibold" onClick={fetchData} type="button">Tải lại</button>
            </div>
            {items.length === 0 && (
              <p className="text-sm text-text-muted">Chưa có đầu việc nào.</p>
            )}
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200/80 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-xs text-text-muted">Phụ trách: {item.assignee?.name || '—'}</p>
                    </div>
                    <span className="text-xs text-text-muted">{item.progress_percent ?? 0}%</span>
                  </div>
                  <div className="mt-2 text-xs text-text-muted flex flex-wrap gap-3">
                    <span>Trạng thái: {statusLabel(item.status)}</span>
                    <span>Bắt đầu: {item.start_date ? formatDate(item.start_date) : '—'}</span>
                    <span>Deadline: {item.deadline ? formatDate(item.deadline) : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
