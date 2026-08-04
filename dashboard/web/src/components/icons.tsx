/** Hand-authored stroke icons. No emoji, no icon font, no external asset. */
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconBrief = () => (
  <svg {...base}>
    <path d="M4 5h16M4 12h10M4 19h7" />
    <circle cx="19" cy="19" r="2" />
  </svg>
);

export const IconTimeline = () => (
  <svg {...base}>
    <path d="M3 12h18" />
    <circle cx="7" cy="12" r="2" />
    <path d="M12 9v6M17 10v4" />
  </svg>
);

export const IconLibrary = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M3 9h18M9 9v11" />
  </svg>
);

export const IconCapture = () => (
  <svg {...base}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 18.5h16" />
  </svg>
);

export const IconConnections = () => (
  <svg {...base}>
    <circle cx="6" cy="7" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <circle cx="12" cy="18" r="2.2" />
    <path d="M8 8.5 10.6 16M16.4 8 13.4 16.2M8.2 7 15.8 6.3" />
  </svg>
);

export const IconStudio = () => (
  <svg {...base}>
    <path d="M4 20h16" />
    <path d="M14.5 4.5l5 5L9 20H4v-5z" />
  </svg>
);

export const IconRecall = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.5 9.5a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.4" />
    <path d="M12 17h.01" />
  </svg>
);

export const IconArchive = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
  </svg>
);

export const IconSettings = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </svg>
);

export const IconSearch = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

export const IconArrow = () => (
  <svg {...base} width={16} height={16}>
    <path d="M5 12h13M13 7l5 5-5 5" />
  </svg>
);

export const IconBack = () => (
  <svg {...base} width={16} height={16}>
    <path d="M19 12H6M11 7l-5 5 5 5" />
  </svg>
);

export const IconClose = () => (
  <svg {...base} width={16} height={16}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconDepth = () => (
  <svg {...base} width={16} height={16}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export const IconNote = () => (
  <svg {...base} width={16} height={16}>
    <path d="M5 4h14v11l-5 5H5z" />
    <path d="M19 15h-5v5" />
  </svg>
);

export const IconMedia = () => (
  <svg {...base} width={16} height={16}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m10 9 5 3-5 3z" />
  </svg>
);
