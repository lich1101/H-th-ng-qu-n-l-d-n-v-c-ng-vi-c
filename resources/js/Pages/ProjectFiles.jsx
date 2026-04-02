import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDateTime } from '@/lib/vietnamTime';

const formatSize = (size) => {
  if (!size) return '0 KB';
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
};

const formatDateTime = (raw) => {
  return formatVietnamDateTime(raw, raw || '—');
};

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'log',
  'xml',
  'html',
  'css',
  'js',
  'ts',
  'jsx',
  'tsx',
  'php',
  'sql',
  'yml',
  'yaml',
  'env',
  'ini',
]);

const OFFICE_EXTENSIONS = new Set([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
]);

const getPreviewKind = (item) => {
  if (!item || item.is_folder) return 'none';

  const mimeType = String(item.mime_type || '').toLowerCase();
  const extension = String(item.extension || '').toLowerCase();

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || extension === 'pdf') return 'pdf';
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text';
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';

  return 'unknown';
};

const canPreviewItem = (item) => {
  return Boolean(item && !item.is_folder && item.public_url && getPreviewKind(item) !== 'unknown');
};

const buildOfficePreviewUrl = (url) => {
  if (!url) return '';
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
};

const kindLabel = (item) => {
  if (item.is_folder) return 'Thư mục';
  if (item.mime_type?.includes('image')) return 'Hình ảnh';
  if (item.mime_type?.includes('pdf')) return 'Tài liệu PDF';
  if (item.extension) return `Tệp ${item.extension.toUpperCase()}`;
  return 'Tài liệu';
};

function FolderIcon({ muted = false }) {
  return (
    <AppIcon
      name="folder"
      className={`h-5 w-5 ${muted ? 'text-slate-500' : 'text-sky-600'}`}
      strokeWidth={1.7}
    />
  );
}

function FileIcon() {
  return (
    <AppIcon name="document" className="h-5 w-5 text-slate-500" strokeWidth={1.7} />
  );
}

function ToolbarButton({ active = false, onClick, children, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

export default function ProjectFiles(props) {
  const toast = useToast();
  const projectId = props.projectId;
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const workspaceRef = useRef(null);

  const [items, setItems] = useState([]);
  const [parentId, setParentId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [trashMode, setTrashMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [filePermissions, setFilePermissions] = useState({ can_manage: false });

  const currentFolder = breadcrumbs[breadcrumbs.length - 1] || null;

  const normalizeMenuPosition = (clientX, clientY) => ({
    x: Math.min(clientX, window.innerWidth - 300),
    y: Math.min(clientY, window.innerHeight - 320),
  });

  const buildNextFolderName = () => {
    const base = 'Thư mục mới';
    const used = new Set(
      (items || [])
        .filter((item) => item?.is_folder)
        .map((item) => String(item?.name || '').toLowerCase()),
    );
    if (!used.has(base.toLowerCase())) return base;
    let index = 2;
    while (used.has(`${base} (${index})`.toLowerCase())) {
      index += 1;
    }
    return `${base} (${index})`;
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/v1/projects/${projectId}/files`, {
        params: {
          parent_id: parentId,
          trash: trashMode ? 1 : 0,
        },
      });
      setItems(res.data?.data || []);
      setFilePermissions({
        can_manage: res.data?.permissions?.can_manage === true,
      });
    } catch (e) {
      setFilePermissions({ can_manage: false });
      toast.error(e?.response?.data?.message || 'Không tải được link dự án.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, trashMode]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  useEffect(() => {
    if (!previewTarget) {
      setPreviewContent('');
      setPreviewError('');
      setPreviewLoading(false);
      return undefined;
    }

    const previewKind = getPreviewKind(previewTarget);
    if (previewKind !== 'text' || !previewTarget.public_url) {
      setPreviewContent('');
      setPreviewError('');
      setPreviewLoading(false);
      return undefined;
    }

    let ignore = false;
    setPreviewLoading(true);
    setPreviewError('');

    axios
      .get(previewTarget.public_url, {
        responseType: 'text',
        transformResponse: [(data) => data],
      })
      .then((response) => {
        if (ignore) return;
        setPreviewContent(String(response.data || ''));
      })
      .catch(() => {
        if (ignore) return;
        setPreviewError('Không thể đọc nội dung trực tiếp của tệp này. Bạn vẫn có thể mở link gốc.');
      })
      .finally(() => {
        if (ignore) return;
        setPreviewLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [previewTarget]);

  useEffect(() => {
    if (!copiedLink) return undefined;
    const timer = window.setTimeout(() => setCopiedLink(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedLink]);

  const breadcrumbLabel = useMemo(() => {
    if (!breadcrumbs.length) return 'Link dự án';
    return breadcrumbs.map((item) => item.name).join(' / ');
  }, [breadcrumbs]);

  const enterFolder = (item) => {
    if (!item?.is_folder) return;
    setBreadcrumbs((prev) => [...prev, item]);
    setParentId(item.id);
  };

  const goRoot = () => {
    setBreadcrumbs([]);
    setParentId(null);
  };

  const goUp = () => {
    if (!breadcrumbs.length) return;
    const next = breadcrumbs.slice(0, -1);
    setBreadcrumbs(next);
    setParentId(next[next.length - 1]?.id || null);
  };

  const goBreadcrumb = (index) => {
    if (index < 0) {
      goRoot();
      return;
    }
    const next = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(next);
    setParentId(next[next.length - 1]?.id || null);
  };

  const createFolder = async (overrideName = null) => {
    const nextName = String(overrideName ?? folderName ?? '').trim();
    if (!nextName) {
      const suggested = buildNextFolderName();
      setFolderName(suggested);
      requestAnimationFrame(() => {
        folderInputRef.current?.focus();
        folderInputRef.current?.select();
      });
      toast.info('Đã điền tên thư mục mẫu. Bạn có thể chỉnh lại rồi bấm Enter.');
      return;
    }
    setCreatingFolder(true);
    try {
      await axios.post(`/api/v1/projects/${projectId}/files/folder`, {
        name: nextName,
        parent_id: parentId,
      });
      toast.success('Đã tạo thư mục.');
      setFolderName('');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không tạo được thư mục.');
    } finally {
      setCreatingFolder(false);
    }
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setUploading(true);
    try {
      for (const file of files) {
        const data = new FormData();
        data.append('file', file);
        if (parentId) data.append('parent_id', parentId);
        await axios.post(`/api/v1/projects/${projectId}/files/upload`, data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success(files.length > 1 ? 'Đã tải lên các tệp.' : 'Đã tải lên tệp.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Tải lên thất bại.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openItem = (item) => {
    if (!item) return;
    if (item.is_folder) {
      enterFolder(item);
      return;
    }
    if (item.public_url) {
      window.open(item.public_url, '_blank', 'noopener,noreferrer');
    }
  };

  const openPreview = (item) => {
    if (!canPreviewItem(item)) {
      if (item?.public_url) {
        window.open(item.public_url, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    setContextMenu(null);
    setPreviewTarget(item);
  };

  const closePreview = () => {
    setPreviewTarget(null);
    setPreviewContent('');
    setPreviewError('');
    setPreviewLoading(false);
    setCopiedLink(false);
  };

  const copyPreviewLink = async () => {
    if (!previewTarget?.public_url) return;
    try {
      await navigator.clipboard.writeText(previewTarget.public_url);
      setCopiedLink(true);
      toast.success('Đã sao chép đường link tệp.');
    } catch (error) {
      toast.error('Không sao chép được đường link tệp.');
    }
  };

  const moveToTrash = async (item) => {
    try {
      await axios.post(`/api/v1/projects/${projectId}/files/${item.id}/trash`);
      toast.success('Đã chuyển vào thùng rác.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể chuyển vào thùng rác.');
    }
  };

  const restore = async (item) => {
    try {
      await axios.post(`/api/v1/projects/${projectId}/files/${item.id}/restore`);
      toast.success('Đã khôi phục mục.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể khôi phục.');
    }
  };

  const removeForever = async (item) => {
    if (!window.confirm(`Xóa vĩnh viễn "${item.name}"?`)) return;
    try {
      await axios.delete(`/api/v1/projects/${projectId}/files/${item.id}`);
      toast.success('Đã xóa vĩnh viễn.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể xóa vĩnh viễn.');
    }
  };

  const duplicateItem = async (item) => {
    try {
      setContextMenu(null);
      await axios.post(`/api/v1/projects/${projectId}/files/${item.id}/duplicate`);
      toast.success('Đã nhân bản mục.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể nhân bản.');
    }
  };

  const submitRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await axios.put(`/api/v1/projects/${projectId}/files/${renameTarget.id}`, {
        name: renameValue.trim(),
      });
      toast.success('Đã đổi tên.');
      setRenameTarget(null);
      setRenameValue('');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể đổi tên.');
    }
  };

  const openRename = (item) => {
    setRenameTarget(item);
    setRenameValue(item.name || '');
    setContextMenu(null);
  };

  const currentStats = [
    { label: 'Vị trí', value: trashMode ? 'Thùng rác' : breadcrumbLabel },
    { label: 'Mục hiện tại', value: String(items.length) },
    { label: 'Chế độ', value: viewMode === 'grid' ? 'Lưới' : 'Danh sách' },
    { label: 'Tải tệp', value: uploading ? 'Đang tải' : 'Sẵn sàng' },
  ];

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const item = contextMenu.item || null;
    const isWorkspaceMenu = !item || contextMenu.scope === 'workspace';
    const canManageFiles = filePermissions?.can_manage === true;

    return (
      <div
        className="fixed z-50 w-64 rounded-2xl border border-slate-200 bg-white/98 p-2 shadow-2xl backdrop-blur"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {isWorkspaceMenu && !trashMode && canManageFiles && (
          <>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                createFolder(buildNextFolderName());
              }}
            >
              Thư mục mới
            </button>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                fileInputRef.current?.click();
              }}
            >
              Tải tệp lên đây
            </button>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                fetchItems();
              }}
            >
              Làm mới danh sách
            </button>
          </>
        )}

        {isWorkspaceMenu && !trashMode && !canManageFiles && (
          <button
            type="button"
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => {
              setContextMenu(null);
              fetchItems();
            }}
          >
            Làm mới danh sách
          </button>
        )}

        {isWorkspaceMenu && trashMode && (
          <>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                fetchItems();
              }}
            >
              Làm mới danh sách
            </button>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                setTrashMode(false);
                goRoot();
              }}
            >
              Quay lại Link dự án
            </button>
          </>
        )}

        {!isWorkspaceMenu && !trashMode && (
          <>
            {!item.is_folder && canPreviewItem(item) && (
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-sky-700 hover:bg-sky-50"
                onClick={() => openPreview(item)}
              >
                Xem
              </button>
            )}
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                openItem(item);
              }}
            >
              {item.is_folder ? 'Mở' : 'Mở ở tab mới'}
            </button>
            {!item.is_folder && item.public_url && (
              <a
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                href={item.public_url}
                target="_blank"
                rel="noreferrer"
                download={item.name}
                onClick={() => setContextMenu(null)}
              >
                Tải xuống
              </a>
            )}
            {canManageFiles && (
              <>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => duplicateItem(item)}
                >
                  Nhân bản
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => openRename(item)}
                >
                  Đổi tên
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  onClick={() => {
                    setContextMenu(null);
                    moveToTrash(item);
                  }}
                >
                  Chuyển vào thùng rác
                </button>
              </>
            )}
          </>
        )}

        {!isWorkspaceMenu && trashMode && filePermissions?.can_manage === true && (
          <>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                restore(item);
              }}
            >
              Khôi phục
            </button>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              onClick={() => {
                setContextMenu(null);
                removeForever(item);
              }}
            >
              Xóa vĩnh viễn
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <PageContainer
      auth={props.auth}
      title="Link dự án"
      description="Link file dùng chung cho dự án, chat công việc và tài liệu triển khai."
      stats={currentStats}
    >
      <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-card">
        <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-slate-200/80 bg-slate-50/80 p-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Truy cập nhanh
              </div>
              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${
                    !trashMode && !currentFolder ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    setTrashMode(false);
                    goRoot();
                  }}
                >
                  <span>Link dự án</span>
                  <span className="text-xs opacity-70">{items.length}</span>
                </button>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${
                    trashMode ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    setTrashMode(true);
                    goRoot();
                  }}
                >
                  <span>Thùng rác</span>
                  <span className="text-xs opacity-70">{trashMode ? items.length : '—'}</span>
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Điều hướng
              </div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <div>
                  <div className="text-xs text-slate-400">Hiện tại</div>
                  <div className="font-semibold text-slate-900">{trashMode ? 'Thùng rác' : (currentFolder?.name || 'Link dự án')}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Đường dẫn</div>
                  <div className="leading-6">{breadcrumbLabel}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Mẹo dùng nhanh</div>
                  <div className="leading-6">
                    Nhấp đúp để mở, nhấp phải để hiện menu thao tác giống Finder.
                  </div>
                </div>
                {filePermissions?.can_manage !== true && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    Tài khoản hiện tại chỉ có quyền xem dữ liệu link dự án, không thể thêm/sửa/xóa.
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="min-w-0 bg-[#fcfcfd]">
            <div className="border-b border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Link dự án
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">
                    {trashMode ? 'Thùng rác' : (currentFolder?.name || 'Link dự án')}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ToolbarButton onClick={goRoot}>Về gốc</ToolbarButton>
                  <ToolbarButton onClick={goUp}>Lùi cấp</ToolbarButton>
                  <ToolbarButton active={viewMode === 'list'} onClick={() => setViewMode('list')}>Danh sách</ToolbarButton>
                  <ToolbarButton active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>Lưới</ToolbarButton>
                  {!trashMode && filePermissions?.can_manage === true && (
                    <>
                      <ToolbarButton onClick={() => fileInputRef.current?.click()}>
                        {uploading ? 'Đang tải...' : 'Tải tệp'}
                      </ToolbarButton>
                      <ToolbarButton onClick={() => createFolder(folderName.trim() || buildNextFolderName())}>
                        {creatingFolder ? 'Đang tạo...' : 'Thư mục mới'}
                      </ToolbarButton>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => uploadFiles(e.target.files)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <button type="button" className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700" onClick={goRoot}>
                  Gốc
                </button>
                {breadcrumbs.map((crumb, index) => (
                  <button
                    key={crumb.id}
                    type="button"
                    className="rounded-full bg-white px-3 py-1.5 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                    onClick={() => goBreadcrumb(index)}
                  >
                    {crumb.name}
                  </button>
                ))}
              </div>

              {!trashMode && filePermissions?.can_manage === true && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input
                    ref={folderInputRef}
                    className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
                    placeholder="Tên thư mục mới"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createFolder();
                    }}
                  />
                  <div className="text-xs text-slate-500">
                    File tải lên từ chat công việc sẽ được gom trong cùng link dự án.
                  </div>
                </div>
              )}
            </div>

            <div
              ref={workspaceRef}
              className="p-4"
              onContextMenu={(e) => {
                e.preventDefault();
                setSelectedId(null);
                setContextMenu({
                  scope: 'workspace',
                  ...normalizeMenuPosition(e.clientX, e.clientY),
                });
              }}
            >
              {loading && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  Đang tải dữ liệu...
                </div>
              )}

              {!loading && items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
                  {trashMode ? 'Thùng rác đang trống.' : 'Thư mục này chưa có dữ liệu.'}
                </div>
              )}

              {!loading && items.length > 0 && viewMode === 'list' && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[minmax(0,1.6fr)_160px_120px_200px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <div>Tên</div>
                    <div>Loại</div>
                    <div>Dung lượng</div>
                    <div>Ngày thêm</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const active = selectedId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-file-item="1"
                          className={`grid w-full grid-cols-[minmax(0,1.6fr)_160px_120px_200px] gap-4 px-4 py-3 text-left transition ${
                            active ? 'bg-sky-50' : 'hover:bg-slate-50'
                          }`}
                          onClick={() => setSelectedId(item.id)}
                          onDoubleClick={() => openItem(item)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedId(item.id);
                            setContextMenu({
                              item,
                              ...normalizeMenuPosition(e.clientX, e.clientY),
                            });
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.is_folder ? 'bg-sky-100' : 'bg-slate-100'}`}>
                              {item.is_folder ? <FolderIcon /> : <FileIcon />}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900">{item.name}</div>
                              <div className="truncate text-xs text-slate-500">
                                {item.public_url || item.path || '—'}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-slate-600">{kindLabel(item)}</div>
                          <div className="text-sm text-slate-600">{item.is_folder ? '—' : formatSize(item.size)}</div>
                          <div className="text-sm text-slate-600">{formatDateTime(item.created_at)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!loading && items.length > 0 && viewMode === 'grid' && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => {
                    const active = selectedId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-file-item="1"
                        className={`rounded-2xl border p-4 text-left transition ${
                          active
                            ? 'border-sky-300 bg-sky-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => openItem(item)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedId(item.id);
                          setContextMenu({
                            item,
                            ...normalizeMenuPosition(e.clientX, e.clientY),
                          });
                        }}
                      >
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${item.is_folder ? 'bg-sky-100' : 'bg-slate-100'}`}>
                          {item.is_folder ? <FolderIcon /> : <FileIcon />}
                        </div>
                        <div className="mt-4 truncate font-semibold text-slate-900">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{kindLabel(item)}</div>
                        <div className="mt-3 text-xs text-slate-500">{item.is_folder ? '—' : formatSize(item.size)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.created_at)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {renderContextMenu()}

      {renameTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Đổi tên
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              Đổi tên {renameTarget.is_folder ? 'thư mục' : 'tệp'}
            </div>
            <input
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
              }}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <ToolbarButton onClick={() => {
                setRenameTarget(null);
                setRenameValue('');
              }}
              >
                Hủy
              </ToolbarButton>
              <ToolbarButton active onClick={submitRename}>
                Lưu
              </ToolbarButton>
            </div>
          </div>
        </div>
      )}

      {previewTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 bg-gradient-to-r from-white to-slate-50 px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Xem tệp trong kho
                  </div>
                  <div className="mt-1 truncate text-xl font-semibold text-slate-900">
                    {previewTarget.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                      {kindLabel(previewTarget)}
                    </span>
                    <span>{formatSize(previewTarget.size)}</span>
                    <span>{formatDateTime(previewTarget.created_at)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ToolbarButton onClick={copyPreviewLink}>
                    {copiedLink ? 'Đã sao chép link' : 'Sao chép link'}
                  </ToolbarButton>
                  <a
                    href={previewTarget.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Mở file
                  </a>
                  <ToolbarButton onClick={closePreview}>Đóng</ToolbarButton>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-[420px] bg-slate-50/70 p-5">
                <div className="flex h-full items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                  {(() => {
                    const previewKind = getPreviewKind(previewTarget);

                    if (previewLoading) {
                      return <div className="text-sm text-slate-500">Đang tải nội dung xem trước...</div>;
                    }

                    if (previewKind === 'image') {
                      return (
                        <img
                          src={previewTarget.public_url}
                          alt={previewTarget.name}
                          className="max-h-[68vh] w-full rounded-2xl object-contain"
                        />
                      );
                    }

                    if (previewKind === 'video') {
                      return (
                        <video
                          src={previewTarget.public_url}
                          controls
                          className="max-h-[68vh] w-full rounded-2xl bg-black object-contain"
                        />
                      );
                    }

                    if (previewKind === 'audio') {
                      return <audio src={previewTarget.public_url} controls className="w-full max-w-xl" />;
                    }

                    if (previewKind === 'pdf') {
                      return (
                        <iframe
                          title={previewTarget.name}
                          src={previewTarget.public_url}
                          className="h-[68vh] w-full rounded-2xl border border-slate-200"
                        />
                      );
                    }

                    if (previewKind === 'office') {
                      return (
                        <iframe
                          title={previewTarget.name}
                          src={buildOfficePreviewUrl(previewTarget.public_url)}
                          className="h-[68vh] w-full rounded-2xl border border-slate-200"
                        />
                      );
                    }

                    if (previewKind === 'text') {
                      if (previewError) {
                        return <div className="max-w-xl text-center text-sm text-slate-500">{previewError}</div>;
                      }

                      return (
                        <pre className="h-[68vh] w-full overflow-auto rounded-2xl bg-slate-950 px-5 py-4 text-sm leading-6 text-slate-100">
                          {previewContent || 'Tệp hiện chưa có nội dung hiển thị.'}
                        </pre>
                      );
                    }

                    return (
                      <div className="max-w-xl text-center">
                        <div className="text-base font-semibold text-slate-900">Chưa hỗ trợ xem trực tiếp định dạng này</div>
                        <div className="mt-2 text-sm text-slate-500">
                          Bạn vẫn có thể mở file ở tab mới hoặc sao chép đường link để chia sẻ.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <aside className="border-l border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Thông tin tệp
                </div>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Tên file</div>
                    <div className="mt-1 break-words font-semibold text-slate-900">{previewTarget.name}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Link file</div>
                    <a
                      href={previewTarget.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all font-medium text-primary underline underline-offset-2"
                    >
                      {previewTarget.public_url}
                    </a>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Loại</div>
                      <div className="mt-1 font-medium text-slate-800">{kindLabel(previewTarget)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Dung lượng</div>
                      <div className="mt-1 font-medium text-slate-800">{formatSize(previewTarget.size)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Định dạng</div>
                      <div className="mt-1 font-medium text-slate-800">{String(previewTarget.extension || previewTarget.mime_type || '—').toUpperCase()}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Ngày thêm</div>
                      <div className="mt-1 font-medium text-slate-800">{formatDateTime(previewTarget.created_at)}</div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
