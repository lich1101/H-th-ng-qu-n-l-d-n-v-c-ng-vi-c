import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const statusLabel = (value) => {
  switch (value) {
    case 'moi_tao':
      return 'Mới tạo';
    case 'dang_trien_khai':
      return 'Đang triển khai';
    case 'cho_duyet':
      return 'Chờ duyệt';
    case 'hoan_thanh':
      return 'Hoàn thành';
    case 'tam_dung':
      return 'Tạm dừng';
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

export default function ProjectDetail(props) {
  const toast = useToast();
  const projectId = props.projectId;
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projRes, taskRes] = await Promise.all([
        axios.get(`/api/v1/projects/${projectId}`),
        axios.get('/api/v1/tasks', { params: { project_id: projectId, per_page: 200 } }),
      ]);
      setProject(projRes.data || null);
      setTasks(taskRes.data?.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không tải được dự án.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const stats = project
    ? [
        { label: 'Tiến độ', value: `${project.progress_percent ?? 0}%` },
        { label: 'Công việc', value: String(tasks.length) },
        { label: 'Trạng thái', value: statusLabel(project.status) },
        { label: 'Hạn chót', value: project.deadline ? formatDate(project.deadline) : '—' },
      ]
    : [];

  return (
    <PageContainer
      auth={props.auth}
      title="Chi tiết dự án"
      description="Theo dõi thông tin dự án, hợp đồng và danh sách công việc."
      stats={stats}
    >
      {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
      {!loading && project && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
                <p className="text-xs text-text-muted">{project.code || '—'}</p>
              </div>
              <div className="flex items-center gap-3">
                <a className="text-sm text-primary font-semibold" href={`/du-an/${project.id}/luong`}>Luồng dự án</a>
                <a className="text-sm text-slate-600 font-semibold" href={`/du-an/${project.id}/kho`}>Kho dự án</a>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="text-sm text-text-muted space-y-2">
                <div>Hợp đồng: <span className="text-slate-900 font-semibold">{project.contract?.code || 'Chưa có'}</span></div>
                <div>Khách hàng: <span className="text-slate-900 font-semibold">{project.client?.name || '—'}</span></div>
                <div>Phụ trách triển khai: <span className="text-slate-900 font-semibold">{project.owner?.name || '—'}</span></div>
              </div>
              <div className="text-sm text-text-muted space-y-2">
                <div>Deadline: <span className="text-slate-900 font-semibold">{formatDate(project.deadline)}</span></div>
                <div>Tiến độ: <span className="text-slate-900 font-semibold">{project.progress_percent ?? 0}%</span></div>
                <div>Link kho: {project.repo_url ? <a className="text-primary font-semibold" href={project.repo_url} target="_blank" rel="noreferrer">Mở kho</a> : '—'}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900">Danh sách công việc</h4>
              <button className="text-sm text-primary font-semibold" onClick={fetchData} type="button">Tải lại</button>
            </div>
            {tasks.length === 0 && (
              <p className="text-sm text-text-muted">Chưa có công việc nào.</p>
            )}
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-200/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{task.title}</p>
                      <p className="text-xs text-text-muted">Phụ trách: {task.assignee?.name || '—'}</p>
                    </div>
                    <div className="text-xs text-text-muted">Tiến độ: {task.progress_percent ?? 0}%</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
                    <span>Trạng thái: {statusLabel(task.status)}</span>
                    <span>Deadline: {task.deadline ? formatDate(task.deadline) : '—'}</span>
                    <a className="text-primary font-semibold" href={`/cong-viec/${task.id}`}>Chi tiết</a>
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
