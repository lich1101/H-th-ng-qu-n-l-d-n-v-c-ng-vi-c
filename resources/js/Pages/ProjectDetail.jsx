import React, { useEffect, useMemo, useState } from 'react';
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

const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');

const formatSigned = (value) => {
  const num = Number(value || 0);
  if (num > 0) return `+${formatNumber(num)}`;
  return formatNumber(num);
};

const formatPercent = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}%`;
};

export default function ProjectDetail(props) {
  const toast = useToast();
  const projectId = props.projectId;
  const currentRole = props?.auth?.user?.role || '';
  const canForceSync = ['admin', 'quan_ly'].includes(currentRole);
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [gsc, setGsc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gscLoading, setGscLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchGsc = async ({ force = false } = {}) => {
    setGscLoading(true);
    try {
      const response = await axios.get(`/api/v1/projects/${projectId}/search-console`, {
        params: {
          refresh: 1,
          force: force ? 1 : 0,
          days: 21,
        },
      });
      setGsc(response.data || null);
    } catch (e) {
      const message = e?.response?.data?.message || 'Không tải được dữ liệu Google Search Console.';
      setGsc((prev) => ({
        ...(prev || {}),
        status: {
          ...(prev?.status || {}),
          sync_error: message,
        },
      }));
      toast.error(message);
    } finally {
      setGscLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projRes, taskRes] = await Promise.all([
        axios.get(`/api/v1/projects/${projectId}`),
        axios.get('/api/v1/tasks', { params: { project_id: projectId, per_page: 200 } }),
      ]);
      const projectData = projRes.data || null;
      setProject(projectData);
      setTasks(taskRes.data?.data || []);
      if (projectData?.website_url) {
        await fetchGsc({ force: false });
      } else {
        setGsc(null);
      }
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

  const triggerSync = async () => {
    if (!project?.website_url) {
      toast.error('Dự án chưa có website để đồng bộ Search Console.');
      return;
    }

    setSyncing(true);
    try {
      await axios.post(`/api/v1/projects/${projectId}/search-console/sync`);
      await fetchGsc({ force: true });
      toast.success('Đã đồng bộ dữ liệu Search Console.');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không đồng bộ được dữ liệu Search Console.');
    } finally {
      setSyncing(false);
    }
  };

  const stats = project
    ? [
        { label: 'Tiến độ', value: `${project.progress_percent ?? 0}%` },
        { label: 'Công việc', value: String(tasks.length) },
        { label: 'Trạng thái', value: statusLabel(project.status) },
        { label: 'Hạn chót', value: project.deadline ? formatDate(project.deadline) : '—' },
      ]
    : [];

  const gscTrend = gsc?.trend || [];
  const gscLatest = gsc?.latest || null;
  const gscSummary = gsc?.summary || null;
  const gscStatus = gsc?.status || {};
  const gscMaxClicks = useMemo(() => {
    const max = Math.max(...gscTrend.map((item) => Number(item?.clicks || 0)), 0);
    return max > 0 ? max : 1;
  }, [gscTrend]);

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
                <div>Website: {project.website_url ? <a className="text-primary font-semibold" href={project.website_url} target="_blank" rel="noreferrer">Mở website</a> : '—'}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-900">Google Search Console</h4>
                <p className="text-xs text-text-muted mt-1">
                  Tự cập nhật theo ngày và hiển thị so sánh biến động clicks/impressions trong chi tiết dự án.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {project.website_url && canForceSync && (
                  <button
                    className="text-sm text-primary font-semibold disabled:opacity-60"
                    onClick={triggerSync}
                    type="button"
                    disabled={syncing || gscLoading}
                  >
                    {syncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
                  </button>
                )}
                {project.website_url && (
                  <button className="text-sm text-slate-600 font-semibold" onClick={() => fetchGsc({ force: false })} type="button">
                    Tải lại
                  </button>
                )}
              </div>
            </div>

            {!project.website_url && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Dự án chưa có <span className="font-semibold">Website dự án</span>. Hãy cập nhật URL website trong form dự án để bật thống kê Search Console.
              </div>
            )}

            {project.website_url && gscStatus?.can_sync === false && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Chưa thể đồng bộ Search Console. Cần bật và cấu hình credential GSC trong <span className="font-semibold">Cài đặt hệ thống</span> (administrator).
              </div>
            )}

            {project.website_url && gscStatus?.sync_error && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                Lỗi đồng bộ gần nhất: {gscStatus.sync_error}
              </div>
            )}

            {project.website_url && (
              <>
                {gscLoading && (
                  <p className="mt-4 text-sm text-text-muted">Đang tải dữ liệu Search Console...</p>
                )}

                {!gscLoading && gscLatest && (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200/80 p-4">
                        <div className="text-xs text-text-muted">Ngày thống kê</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{formatDate(gscLatest.metric_date)}</div>
                        <div className="mt-1 text-xs text-text-muted">So sánh với {formatDate(gscLatest.prior_date)}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 p-4">
                        <div className="text-xs text-text-muted">Clicks</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{formatNumber(gscLatest.last_clicks)}</div>
                        <div className={`mt-1 text-xs ${Number(gscLatest.delta_clicks || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {formatSigned(gscLatest.delta_clicks)} ({formatPercent(gscLatest.delta_clicks_percent, 2)})
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 p-4">
                        <div className="text-xs text-text-muted">Impressions</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{formatNumber(gscLatest.last_impressions)}</div>
                        <div className={`mt-1 text-xs ${Number(gscLatest.delta_impressions || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {formatSigned(gscLatest.delta_impressions)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 p-4">
                        <div className="text-xs text-text-muted">Alert lớn (|%Clicks|)</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{formatNumber(gscLatest.alerts_total || 0)}</div>
                        <div className="mt-1 text-xs text-text-muted">
                          Brand: {gscLatest.alerts_brand || 0} • Brand+Recipes: {gscLatest.alerts_brand_recipes || 0}
                        </div>
                      </div>
                    </div>

                    {gscTrend.length > 0 && (
                      <div className="mt-5 rounded-2xl border border-slate-200/80 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-sm font-semibold text-slate-900">Biểu đồ cột Clicks theo ngày ({gscSummary?.days || gscTrend.length} ngày gần nhất)</h5>
                          <span className="text-xs text-text-muted">
                            TB/ngày: {gscSummary ? formatNumber(gscSummary.avg_clicks_per_day) : '—'} clicks
                          </span>
                        </div>
                        <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-2">
                          {gscTrend.map((item) => {
                            const clicks = Number(item.clicks || 0);
                            const heightPercent = Math.max(4, Math.round((clicks / gscMaxClicks) * 100));
                            const positiveDelta = Number(item.delta_clicks || 0) >= 0;
                            return (
                              <div key={item.date} className="min-w-[40px]">
                                <div className="h-40 flex items-end">
                                  <div
                                    className={`w-full rounded-t-md ${positiveDelta ? 'bg-emerald-500/80' : 'bg-rose-500/80'}`}
                                    style={{ height: `${heightPercent}%` }}
                                    title={`${item.date}: ${formatNumber(clicks)} clicks`}
                                  />
                                </div>
                                <div className="mt-2 text-[10px] text-center text-text-muted">{formatDate(item.date).slice(0, 5)}</div>
                                <div className="text-[10px] text-center font-semibold text-slate-700">{formatNumber(clicks)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {gscTrend.length > 0 && (
                      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200/80">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-text-subtle">
                            <tr>
                              <th className="px-3 py-2.5">Ngày</th>
                              <th className="px-3 py-2.5">Clicks</th>
                              <th className="px-3 py-2.5">Impressions</th>
                              <th className="px-3 py-2.5">Delta Clicks</th>
                              <th className="px-3 py-2.5">% Delta Clicks</th>
                              <th className="px-3 py-2.5">Alerts</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {[...gscTrend].reverse().slice(0, 12).map((item) => (
                              <tr key={item.date}>
                                <td className="px-3 py-2.5 text-slate-700">{formatDate(item.date)}</td>
                                <td className="px-3 py-2.5 text-slate-900 font-semibold">{formatNumber(item.clicks)}</td>
                                <td className="px-3 py-2.5 text-slate-700">{formatNumber(item.impressions)}</td>
                                <td className={`px-3 py-2.5 font-semibold ${Number(item.delta_clicks || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {formatSigned(item.delta_clicks)}
                                </td>
                                <td className="px-3 py-2.5 text-slate-700">{formatPercent(item.delta_clicks_percent, 2)}</td>
                                <td className="px-3 py-2.5 text-slate-700">{formatNumber(item.alerts_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {!gscLoading && !gscLatest && (
                  <p className="mt-4 text-sm text-text-muted">Chưa có dữ liệu Search Console cho dự án này.</p>
                )}
              </>
            )}
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
