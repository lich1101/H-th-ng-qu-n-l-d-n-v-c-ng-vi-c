import './bootstrap';
import '../css/app.css';
import 'tom-select/dist/css/tom-select.css';

import React, { useEffect } from 'react';
import { render } from 'react-dom';
import { createInertiaApp } from '@inertiajs/inertia-react';
import { InertiaProgress } from '@inertiajs/progress';
import { ToastProvider } from '@/Contexts/ToastContext';
import { setupGlobalUxEnhancer } from '@/lib/globalUxEnhancer';

const appName = window.document.getElementsByTagName('title')[0]?.innerText || 'Jobs ClickOn';
const pages = require.context('./Pages', true, /\.jsx$/);

function AppShell({ App, props }) {
    useEffect(() => {
        return setupGlobalUxEnhancer();
    }, []);

    return (
        <ToastProvider>
            <App {...props} />
        </ToastProvider>
    );
}

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) => pages(`./${name}.jsx`).default,
    setup({ el, App, props }) {
        return render(<AppShell App={App} props={props} />, el);
    },
});

InertiaProgress.init({ color: '#4B5563' });
