const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', ...defaultTheme.fontFamily.sans],
                display: ['Inter', ...defaultTheme.fontFamily.sans],
            },
            colors: {
                primary: 'rgb(var(--color-primary) / <alpha-value>)',
                'app-bg': '#F8FAFC',
                surface: '#FFFFFF',
                'surface-alt': '#F1F5F9',
                'border-soft': '#E2E8F0',
                'text-muted': '#64748B',
                'text-subtle': '#94A3B8',
                success: '#16A34A',
                warning: '#F59E0B',
                danger: '#EF4444',
            },
            boxShadow: {
                soft: '0 12px 32px rgba(15, 23, 42, 0.08)',
                card: '0 6px 18px rgba(15, 23, 42, 0.06)',
            },
            borderRadius: {
                xl: '16px',
                '2xl': '20px',
            },
        },
    },

    plugins: [require('@tailwindcss/forms')],
};
