import React from 'react';

// sosyalmedya wordmark (desktop build). Replaces the Postiz wordmark at build time.
export const LogoTextComponent = () => {
  return (
    <svg
      width="170"
      height="33"
      viewBox="0 0 170 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="sm-text-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF4F9A" />
          <stop offset="1" stopColor="#FF9F1C" />
        </linearGradient>
      </defs>
      <g transform="translate(0 1) scale(0.121)">
        <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#sm-text-g)" />
        <path
          d="M64 58h128a28 28 0 0 1 28 28v62a28 28 0 0 1-28 28h-70l-38 34v-34H64a28 28 0 0 1-28-28V86a28 28 0 0 1 28-28z"
          fill="#ffffff"
        />
        <circle cx="98" cy="106" r="13" fill="#2B1B3D" />
        <circle cx="158" cy="106" r="13" fill="#2B1B3D" />
        <path
          d="M90 134q38 34 76 0"
          stroke="#2B1B3D"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <text
        x="38"
        y="23"
        fill="currentColor"
        fontFamily="'Plus Jakarta Sans', 'Segoe UI', sans-serif"
        fontSize="19"
        fontWeight="700"
        letterSpacing="-0.4"
      >
        sosyalmedya
      </text>
    </svg>
  );
};
