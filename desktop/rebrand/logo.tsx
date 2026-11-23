'use client';

// sosyalmedya logo (desktop build). Replaces the Postiz mark at build time.
export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 256 256"
      fill="none"
      className="mt-[8px] min-w-[60px] min-h-[60px]"
    >
      <defs>
        <linearGradient id="sm-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF4F9A" />
          <stop offset="1" stopColor="#FF9F1C" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#sm-logo-g)" />
      <path
        d="M64 58h128a28 28 0 0 1 28 28v62a28 28 0 0 1-28 28h-70l-38 34v-34H64a28 28 0 0 1-28-28V86a28 28 0 0 1 28-28z"
        fill="#ffffff"
      />
      <circle cx="98" cy="106" r="13" fill="#2B1B3D" />
      <circle cx="158" cy="106" r="13" fill="#2B1B3D" />
      <circle cx="102" cy="101" r="4" fill="#ffffff" />
      <circle cx="162" cy="101" r="4" fill="#ffffff" />
      <path
        d="M90 134q38 34 76 0"
        stroke="#2B1B3D"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M120 152q8 14 16 0" fill="#FF4F9A" />
    </svg>
  );
};
