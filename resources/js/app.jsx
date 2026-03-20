import './bootstrap';
import '../css/app.css';

import React from 'react';
import { render } from 'react-dom';
import { createInertiaApp } from '@inertiajs/inertia-react';
import { InertiaProgress } from '@inertiajs/progress';
import { ToastProvider } from '@/Contexts/ToastContext';

const appName = window.document.getElementsByTagName('title')[0]?.innerText || 'Jobs ClickOn';
const pages = require.context('./Pages', true, /\.jsx$/);

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) => pages(`./${name}.jsx`).default,
    setup({ el, App, props }) {
        return render(
            <ToastProvider>
                <App {...props} />
            </ToastProvider>,
            el
        );
    },
});

InertiaProgress.init({ color: '#4B5563' });
