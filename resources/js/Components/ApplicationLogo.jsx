import React from 'react';

export default function ApplicationLogo({ className, logoUrl, brandName }) {
    return (
        <img
            src={logoUrl || '/brand/icon.png'}
            alt={brandName || 'job clickon'}
            className={className}
        />
    );
}
