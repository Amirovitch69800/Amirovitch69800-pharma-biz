import React from 'react';

const paths = {
  home: <><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z" /></>,
  building: <><path d="M4 21V5.7c0-.4.3-.7.7-.7h10.6c.4 0 .7.3.7.7V21" /><path d="M2 21h20M8 9h4M8 13h4M8 17h4M17 9h.1M17 13h.1M17 17h.1" /></>,
  board: <><path d="M4 5.5c0-.8.7-1.5 1.5-1.5h13c.8 0 1.5.7 1.5 1.5v13c0 .8-.7 1.5-1.5 1.5h-13C4.7 20 4 19.3 4 18.5z" /><path d="M9 4v16M15 4v16M4 9h16" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12 2.3 2.4 5.1-5.1" /></>,
  bag: <><path d="M5 8.5h14l-1 12H6z" /><path d="M9 9V6.5a3 3 0 0 1 6 0V9" /></>,
  chart: <><path d="M4 20V4M4 20h16M8 16v-4M12 16V7M16 16v-7" /></>,
  sparkles: <><path d="m12 3 1.2 4.3L17 8.5l-3.8 1.2L12 14l-1.2-4.3L7 8.5l3.8-1.2zM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7zM5.5 15l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.1 2.1-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7v.1h-3v-.1a1.8 1.8 0 0 0-1.1-1.7 1.8 1.8 0 0 0-2 .4l-.1.1-2.1-2.1.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.7-1.1H5v-3h.1a1.8 1.8 0 0 0 1.7-1.1 1.8 1.8 0 0 0-.4-2l-.1-.1 2.1-2.1.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1.1-1.7V3.5h3v.1a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.4l.1-.1 2.1 2.1-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.7 1.1h.1v3h-.1a1.8 1.8 0 0 0-1.7 1.1Z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.8" cy="10.8" r="5.8" /><path d="m16 16 3.5 3.5" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.7-3.9L3.5 9M4 13a8 8 0 0 0 14.7 3.9l1.8-1.9" /><path d="M3.5 5.7V9h3.3M20.5 18.3V15h-3.3" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  more: <path d="M5 12h.1M12 12h.1M19 12h.1" />,
  phone: <path d="M8 4.5 5.5 6a1.6 1.6 0 0 0-.7 1.8c1.5 5.5 5.8 9.8 11.3 11.3a1.6 1.6 0 0 0 1.8-.7l1.6-2.5-3.2-2.1-1.5 1.5a12.4 12.4 0 0 1-6.1-6.1l1.5-1.5z" />,
  calendar: <><rect x="4" y="5.5" width="16" height="14" rx="1.5" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>,
  link: <><path d="M9.4 14.6 14.6 9.4" /><path d="M10.5 6.2 12 4.7a4 4 0 0 1 5.7 5.7l-1.5 1.5" /><path d="M13.5 17.8 12 19.3a4 4 0 0 1-5.7-5.7l1.5-1.5" /></>,
  mail: <><rect x="4" y="6" width="16" height="12" rx="1.6" /><path d="m5 7 7 6 7-6" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7" ry="2.8" /><path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13" /><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" /></>,
  user: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.5-3.3 2.6-5.1 6.5-5.1s6 1.8 6.5 5.1" /></>,
  arrow: <path d="M5 12h13M13 7l5 5-5 5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
};

export default function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={'pb-icon ' + className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name] || paths.more}
    </svg>
  );
}
