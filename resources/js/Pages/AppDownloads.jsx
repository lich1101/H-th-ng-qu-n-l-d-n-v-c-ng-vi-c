import React from 'react';
import PageContainer from '@/Components/PageContainer';

function DownloadCard({ title, subtitle, actionLabel, href, tone = 'primary' }) {
    const toneClasses = tone === 'dark'
        ? 'bg-slate-900 text-white hover:bg-slate-800'
        : 'bg-primary text-white hover:opacity-95';

    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-text-muted">{subtitle}</p>
            <div className="mt-5">
                {href ? (
                    <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold transition ${toneClasses}`}
                    >
                        {actionLabel}
                    </a>
                ) : (
                    <span className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500">
                        Chưa có bản cài đặt
                    </span>
                )}
            </div>
        </div>
    );
}

export default function AppDownloads(props) {
    const settings = props.settings || {};
    const releaseVersion = settings.app_release_version || 'Chưa cập nhật';
    const releaseNotes = String(settings.app_release_notes || '').trim();

    return (
        <PageContainer
            auth={props.auth}
            title="Tải ứng dụng nội bộ"
            description="Nhân sự có thể tải bản Android hoặc mở link TestFlight iOS từ một màn hình chung."
            stats={[
                { label: 'Phiên bản hiện tại', value: releaseVersion },
                { label: 'Android', value: settings.app_android_apk_url ? 'Sẵn sàng' : 'Chưa có' },
                { label: 'iOS', value: settings.app_ios_testflight_url ? 'Sẵn sàng' : 'Chưa có' },
                { label: 'Nguồn', value: 'Cài đặt hệ thống' },
            ]}
        >
            <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
                <div className="space-y-5">
                    <DownloadCard
                        title="Android APK"
                        subtitle="Tải trực tiếp file `.apk` do administrator cập nhật trong phần Cài đặt hệ thống."
                        actionLabel="Tải APK Android"
                        href={settings.app_android_apk_url || ''}
                    />
                    <DownloadCard
                        title="iPhone / iPad"
                        subtitle="Mở link TestFlight để cài bản thử nghiệm hoặc bản phát hành iOS."
                        actionLabel="Mở TestFlight"
                        href={settings.app_ios_testflight_url || ''}
                        tone="dark"
                    />
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        Bản phát hành {releaseVersion}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">Ghi chú cập nhật</h3>
                    {releaseNotes ? (
                        <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700">
                            {releaseNotes}
                        </div>
                    ) : (
                        <div className="mt-3 rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-sm text-text-muted">
                            Administrator chưa nhập ghi chú phát hành cho bản này.
                        </div>
                    )}
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                        Nếu chưa thấy bản mới, bạn tải lại trang hoặc liên hệ administrator để kiểm tra link APK/TestFlight.
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
