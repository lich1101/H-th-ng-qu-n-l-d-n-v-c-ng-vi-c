import './bootstrap';
import '../css/app.css';

import React from 'react';
import { render } from 'react-dom';
import { createInertiaApp } from '@inertiajs/inertia-react';
import { InertiaProgress } from '@inertiajs/progress';

const appName = window.document.getElementsByTagName('title')[0]?.innerText || 'Laravel';
const pages = require.context('./Pages', true, /\.jsx$/);

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) => pages(`./${name}.jsx`).default,
    setup({ el, App, props }) {
        return render(<App {...props} />, el);
    },
});

InertiaProgress.init({ color: '#4B5563' });
