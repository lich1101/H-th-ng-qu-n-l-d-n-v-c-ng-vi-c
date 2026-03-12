import React from 'react';
import Button from '@/Components/Button';
import Guest from '@/Layouts/Guest';
import { Head, Link, useForm } from '@inertiajs/inertia-react';

export default function VerifyEmail({ status }) {
    const { post, processing } = useForm();

    const submit = (e) => {
        e.preventDefault();

        post(route('verification.send'));
    };

    return (
        <Guest>
            <Head title="Xác minh email" />

            <div className="mb-4 text-sm text-gray-600">
                Cảm ơn bạn đã đăng ký! Trước khi bắt đầu, vui lòng xác minh địa chỉ email bằng cách nhấp vào liên kết
                chúng tôi vừa gửi cho bạn. Nếu bạn chưa nhận được email, chúng tôi sẽ gửi lại ngay.
            </div>

            {status === 'verification-link-sent' && (
                <div className="mb-4 font-medium text-sm text-green-600">
                    Liên kết xác minh mới đã được gửi đến địa chỉ email bạn cung cấp khi đăng ký.
                </div>
            )}

            <form onSubmit={submit}>
                <div className="mt-4 flex items-center justify-between">
                    <Button processing={processing}>Gửi lại email xác minh</Button>

                    <Link
                        href={route('logout')}
                        method="post"
                        as="button"
                        className="underline text-sm text-gray-600 hover:text-gray-900"
                    >
                        Đăng xuất
                    </Link>
                </div>
            </form>
        </Guest>
    );
}
