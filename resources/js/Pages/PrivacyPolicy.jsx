import React from 'react';
import { Head, Link, usePage } from '@inertiajs/inertia-react';

export default function PrivacyPolicy() {
    const { settings } = usePage().props;
    const brandName = settings?.brand_name || 'ClickOn';
    const supportEmail = settings?.support_email || '';
    const supportPhone = settings?.support_phone || '';
    const supportAddress = settings?.support_address || '';
    const updatedAt = '15/03/2026';

    return (
        <>
            <Head title="Chính sách & Quyền riêng tư" />
            <div className="min-h-screen bg-app-bg">
                <header className="bg-white border-b border-slate-200">
                    <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-emerald-500 font-semibold">{brandName}</p>
                            <h1 className="text-xl font-semibold text-slate-900">Chính sách & Quyền riêng tư</h1>
                            <p className="text-xs text-text-muted mt-1">Cập nhật ngày {updatedAt}</p>
                        </div>
                        <Link href={route('login')} className="text-sm font-semibold text-primary">
                            Đăng nhập
                        </Link>
                    </div>
                </header>

                <main className="max-w-5xl mx-auto px-6 py-10 space-y-8 text-sm text-slate-700">
                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">1. Thông tin tổ chức</h2>
                        <p className="mt-2">
                            Chính sách này áp dụng cho hệ thống CRM nội bộ <strong>{brandName}</strong>, bao gồm website
                            quản trị, ứng dụng di động và các tích hợp như Facebook Page/Messenger.
                        </p>
                        <div className="mt-3 space-y-1 text-sm text-text-muted">
                            <div>Email hỗ trợ: {supportEmail || 'Đang cập nhật'}</div>
                            <div>Số điện thoại: {supportPhone || 'Đang cập nhật'}</div>
                            <div>Địa chỉ liên hệ: {supportAddress || 'Đang cập nhật'}</div>
                        </div>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">2. Dữ liệu chúng tôi thu thập</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Thông tin tài khoản: tên, email, vai trò hệ thống.</li>
                            <li>Thông tin khách hàng: họ tên, số điện thoại, email, công ty (nếu có).</li>
                            <li>Nội dung trao đổi: tin nhắn, yêu cầu, tệp đính kèm liên quan công việc.</li>
                            <li>Dữ liệu từ nền tảng Meta: PSID, Page ID, ảnh đại diện (nếu được cung cấp).</li>
                            <li>Dữ liệu thiết bị: token thông báo (FCM/APNS) để gửi push.</li>
                            <li>Dữ liệu vận hành: lịch sử hoạt động, trạng thái công việc, hợp đồng, thanh toán.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">3. Mục đích sử dụng</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Quản lý khách hàng, hợp đồng, dự án và tiến độ công việc.</li>
                            <li>Tự động ghi nhận khách hàng tiềm năng từ form/iframe hoặc Page Messenger.</li>
                            <li>Gửi thông báo nhắc việc, nhắc hạn, duyệt nội dung và phối hợp nội bộ.</li>
                            <li>Báo cáo hiệu suất và doanh thu theo phòng ban, nhân sự.</li>
                            <li>Đảm bảo an toàn, bảo mật và tuân thủ quy định nội bộ.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">4. Căn cứ xử lý dữ liệu</h2>
                        <p className="mt-2">
                            Dữ liệu được xử lý dựa trên hợp đồng dịch vụ, sự đồng ý hợp lệ của người dùng và
                            các nghĩa vụ pháp lý liên quan đến vận hành doanh nghiệp.
                        </p>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">5. Chia sẻ dữ liệu</h2>
                        <p className="mt-2">
                            Dữ liệu chỉ được chia sẻ trong nội bộ doanh nghiệp và các đối tác vận hành cần thiết
                            (nhà cung cấp hạ tầng, dịch vụ email, Firebase, Meta). Chúng tôi không bán dữ liệu cho bên thứ ba.
                        </p>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">6. Lưu trữ & bảo mật</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Dữ liệu được lưu trữ trên hệ thống máy chủ bảo mật, có phân quyền truy cập.</li>
                            <li>Mọi truy cập quan trọng được ghi nhật ký hoạt động.</li>
                            <li>Sao lưu định kỳ để đảm bảo an toàn dữ liệu.</li>
                        </ul>
                        <p className="mt-2">
                            Dữ liệu được lưu trong suốt thời gian cung cấp dịch vụ và/hoặc theo yêu cầu pháp lý.
                        </p>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">7. Quyền của người dùng</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Yêu cầu chỉnh sửa hoặc cập nhật thông tin cá nhân.</li>
                            <li>Yêu cầu xoá dữ liệu khi không còn sử dụng dịch vụ.</li>
                            <li>Yêu cầu cung cấp thông tin về dữ liệu đang được lưu trữ.</li>
                            <li>Yêu cầu xuất dữ liệu theo định dạng phổ biến.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">8. Thông báo & công nghệ bên thứ ba</h2>
                        <ul className="mt-2 list-disc pl-5 space-y-2">
                            <li>Ứng dụng sử dụng Firebase Cloud Messaging để gửi thông báo.</li>
                            <li>Chat nội bộ sử dụng Firebase Realtime Database để đồng bộ tin nhắn.</li>
                            <li>Dữ liệu khách hàng có thể đến từ Facebook Page/Messenger nếu được kết nối.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">9. Dữ liệu trẻ em</h2>
                        <p className="mt-2">
                            Dịch vụ không hướng đến trẻ em dưới 13 tuổi. Chúng tôi không chủ đích thu thập dữ liệu
                            của trẻ em. Nếu phát hiện, dữ liệu sẽ được xoá theo yêu cầu.
                        </p>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">10. Liên hệ & yêu cầu xoá dữ liệu</h2>
                        <p className="mt-2">
                            Để yêu cầu truy xuất hoặc xoá dữ liệu, vui lòng liên hệ qua các kênh sau:
                        </p>
                        <div className="mt-3 space-y-1 text-sm text-text-muted">
                            <div>Email: {supportEmail || 'Đang cập nhật'}</div>
                            <div>Điện thoại: {supportPhone || 'Đang cập nhật'}</div>
                            <div>Địa chỉ: {supportAddress || 'Đang cập nhật'}</div>
                        </div>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-card">
                        <h2 className="text-lg font-semibold text-slate-900">11. Thay đổi chính sách</h2>
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
