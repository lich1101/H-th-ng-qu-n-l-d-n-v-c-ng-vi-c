import React from 'react';
import { Head, Link } from '@inertiajs/inertia-react';

export default function PrivacyPolicy() {
    return (
        <>
            <Head title="Chính sách & Quyền riêng tư" />
            <div className="min-h-screen bg-app-bg">
                <header className="bg-white border-b border-slate-200">
                    <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-emerald-500 font-semibold">Winmap</p>
                            <h1 className="text-xl font-semibold text-slate-900">Chính sách & Quyền riêng tư</h1>
                            <p className="text-xs text-text-muted mt-1">Cập nhật ngày 13/03/2026</p>
                        </div>
                        <Link href={route('login')} className="text-sm font-semibold text-primary">
                            Đăng nhập
                        </Link>
                    </div>
                </header>

                <main className="max-w-5xl mx-auto px-6 py-10 space-y-8 text-sm text-slate-700">
                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">1. Phạm vi áp dụng</h2>
                        <p className="mt-2">
                            Chính sách này áp dụng cho hệ thống CRM nội bộ Winmap, bao gồm website quản trị,
                            ứng dụng di động và các tích hợp như Facebook Page/Messenger.
                        </p>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">2. Dữ liệu chúng tôi thu thập</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Thông tin khách hàng: họ tên, số điện thoại, email, công ty (nếu có).</li>
                            <li>Nội dung trao đổi: tin nhắn, yêu cầu, tệp đính kèm liên quan công việc.</li>
                            <li>Dữ liệu từ nền tảng Meta: PSID, Page ID, ảnh đại diện (nếu được cung cấp).</li>
                            <li>Dữ liệu vận hành: lịch sử hoạt động, trạng thái công việc, hợp đồng, thanh toán.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">3. Mục đích sử dụng</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Quản lý khách hàng, hợp đồng, dự án và tiến độ công việc.</li>
                            <li>Tự động ghi nhận khách hàng tiềm năng từ form/iframe hoặc Page Messenger.</li>
                            <li>Báo cáo hiệu suất và doanh thu theo phòng ban, nhân sự.</li>
                            <li>Cải thiện chất lượng dịch vụ và hỗ trợ khách hàng.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">4. Chia sẻ dữ liệu</h2>
                        <p className="mt-2">
                            Dữ liệu chỉ được chia sẻ trong nội bộ doanh nghiệp và các đối tác vận hành cần thiết
                            (nhà cung cấp hạ tầng, dịch vụ email). Chúng tôi không bán dữ liệu cho bên thứ ba.
                        </p>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">5. Lưu trữ & bảo mật</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Dữ liệu được lưu trữ trên hệ thống máy chủ bảo mật, có phân quyền truy cập.</li>
                            <li>Mọi truy cập quan trọng được ghi nhật ký hoạt động.</li>
                            <li>Sao lưu định kỳ để đảm bảo an toàn dữ liệu.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">6. Quyền của người dùng</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Yêu cầu chỉnh sửa hoặc cập nhật thông tin cá nhân.</li>
                            <li>Yêu cầu xoá dữ liệu khi không còn sử dụng dịch vụ.</li>
                            <li>Yêu cầu cung cấp thông tin về dữ liệu đang được lưu trữ.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">7. Liên hệ</h2>
                        <p className="mt-2">
                            Nếu bạn có câu hỏi về chính sách hoặc quyền riêng tư, vui lòng liên hệ đội ngũ quản trị
                            hệ thống Winmap để được hỗ trợ.
                        </p>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">8. Thay đổi chính sách</h2>
                        <p className="mt-2">
                            Chúng tôi có thể cập nhật chính sách này theo thời gian. Mọi thay đổi sẽ được thông báo
                            và ghi rõ ngày cập nhật.
                        </p>
                    </section>
                </main>
            </div>
        </>
    );
}
