import React, { useEffect } from 'react';
import Button from '@/Components/Button';
import Checkbox from '@/Components/Checkbox';
import Guest from '@/Layouts/Guest';
import Input from '@/Components/Input';
import Label from '@/Components/Label';
import ValidationErrors from '@/Components/ValidationErrors';
import { Head, Link, useForm } from '@inertiajs/inertia-react';

export default function Login({ status, canResetPassword }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: '',
    });

    useEffect(() => {
        return () => {
            reset('password');
        };
    }, []);

    const onHandleChange = (event) => {
        setData(event.target.name, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
    };

    const submit = (e) => {
        e.preventDefault();

        post(route('login'));
    };

    return (
        <Guest>
            <Head title="Đăng nhập" />

            {status && <div className="mb-4 font-medium text-sm text-green-600">{status}</div>}

            <ValidationErrors errors={errors} />

            <div className="mb-6 text-center">
                <h1 className="text-2xl font-bold text-slate-900">Đăng nhập</h1>
                <p className="text-sm text-text-muted mt-1">Truy cập hệ thống quản lý nội bộ</p>
            </div>

            <form onSubmit={submit}>
                <div>
                    <Label forInput="email" value="Email" className="text-slate-700" />

                    <Input
                        type="text"
                        name="email"
                        value={data.email}
                        className="mt-2 block w-full rounded-xl border-slate-200 focus:border-primary focus:ring-primary/30"
                        autoComplete="username"
                        isFocused={true}
                        handleChange={onHandleChange}
                    />
                </div>

                <div className="mt-4">
                    <Label forInput="password" value="Mật khẩu" className="text-slate-700" />

                    <Input
                        type="password"
                        name="password"
                        value={data.password}
                        className="mt-2 block w-full rounded-xl border-slate-200 focus:border-primary focus:ring-primary/30"
                        autoComplete="current-password"
                        handleChange={onHandleChange}
                    />
                </div>

                <div className="block mt-4">
                    <label className="flex items-center">
                        <Checkbox name="remember" value={data.remember} handleChange={onHandleChange} />

                        <span className="ml-2 text-sm text-slate-600">Ghi nhớ đăng nhập</span>
                    </label>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6">
                    {canResetPassword && (
                        <Link
                            href={route('password.request')}
                            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                        >
                            Quên mật khẩu?
                        </Link>
                    )}

                    <Button
                        className="w-full sm:w-auto justify-center rounded-xl bg-primary hover:bg-emerald-600 px-6 py-3 text-sm font-semibold normal-case tracking-normal"
                        processing={processing}
                    >
                        Đăng nhập
                    </Button>
                </div>
            </form>
        </Guest>
    );
}
