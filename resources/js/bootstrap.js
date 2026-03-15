window._ = require('lodash');

/**
 * We'll load the axios HTTP library which allows us to easily issue requests
 * to our Laravel back-end. This library automatically handles sending the
 * CSRF token as a header based on the value of the "XSRF" token cookie.
 */

window.axios = require('axios');

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

/**
 * Prevent duplicate in-flight mutations (double click submit).
 * Only dedupe while the first request is still pending.
 */
const pendingRequests = new Map();

const normalizePayload = (payload) => {
    if (!payload) return '';
    if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        const entries = [];
        payload.forEach((value, key) => {
            entries.push(`${key}=${value instanceof File ? value.name : String(value)}`);
        });
        return entries.sort().join('&');
    }
    if (typeof payload === 'string') return payload;
    try {
        return JSON.stringify(payload);
    } catch (e) {
        return String(payload);
    }
};

const buildRequestKey = (config) => {
    const method = (config.method || 'get').toLowerCase();
    const url = config.url || '';
    const params = config.params ? normalizePayload(config.params) : '';
    const data = config.data ? normalizePayload(config.data) : '';
    return `${method}|${url}|${params}|${data}`;
};

const originalRequest = window.axios.request.bind(window.axios);
window.axios.request = (config) => {
    const method = (config?.method || 'get').toLowerCase();
    if (!['post', 'put', 'patch', 'delete'].includes(method)) {
        return originalRequest(config);
    }
    const key = buildRequestKey(config || {});
    if (pendingRequests.has(key)) {
        return pendingRequests.get(key);
    }
    const request = originalRequest(config).finally(() => {
        pendingRequests.delete(key);
    });
    pendingRequests.set(key, request);
    return request;
};

/**
 * Echo exposes an expressive API for subscribing to channels and listening
 * for events that are broadcast by Laravel. Echo and event broadcasting
 * allows your team to easily build robust real-time web applications.
 */

// import Echo from 'laravel-echo';

// window.Pusher = require('pusher-js');

// window.Echo = new Echo({
//     broadcaster: 'pusher',
//     key: process.env.MIX_PUSHER_APP_KEY,
//     cluster: process.env.MIX_PUSHER_APP_CLUSTER,
//     forceTLS: true
// });
