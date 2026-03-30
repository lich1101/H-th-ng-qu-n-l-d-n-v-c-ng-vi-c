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
                'app-bg': '#F3F7F9',
                surface: '#FFFFFF',
                'surface-alt': '#EAF1F5',
                'border-soft': '#D9E4EA',
                'text-muted': '#5F7285',
                'text-subtle': '#90A0B0',
                success: '#16A34A',
                warning: '#F59E0B',
                danger: '#EF4444',
            },
            boxShadow: {
                soft: '0 24px 60px rgba(15, 23, 42, 0.08)',
                card: '0 14px 34px rgba(15, 23, 42, 0.08)',
            },
            borderRadius: {
                xl: '16px',
                '2xl': '20px',
            },
        },
    },

    plugins: [require('@tailwindcss/forms')],
};
