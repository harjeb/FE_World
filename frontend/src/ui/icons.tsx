// Line icons from the design artboards (24px grid, 1.9px stroke). Decorative: always paired with text.
import type { ReactNode } from 'react';

function Icon({ children, size = 18, stroke = 1.9 }: { children: ReactNode; size?: number; stroke?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const AttackIcon = () => (
  <Icon><path d="M4 4l11 11" /><path d="M20 4L9 15" /><path d="M13 17l4-4" /><path d="M7 13l4 4" /><path d="M16 16l3 3" /><path d="M8 16l-3 3" /></Icon>
);
export const BagIcon = () => <Icon><path d="M6 8h12l-1 12H7z" /><path d="M9 8a3 3 0 0 1 6 0" /></Icon>;
export const WaitIcon = () => <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></Icon>;
export const HealIcon = () => <Icon><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></Icon>;
export const RetreatIcon = () => <Icon><path d="M10 4H5v16h5" /><path d="M14 8l4 4-4 4M18 12H9" /></Icon>;
export const PlusIcon = () => <Icon stroke={2.2}><path d="M12 5v14M5 12h14" /></Icon>;
export const MinusIcon = () => <Icon stroke={2.2}><path d="M5 12h14" /></Icon>;
export const ChevronIcon = ({ up }: { up: boolean }) => <Icon stroke={2}><path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></Icon>;
export const SkipIcon = () => <Icon><path d="M5 5l8 7-8 7z" /><path d="M14 5l6 7-6 7" /></Icon>;
// Navigation and page icons (军营 / 名册 / 观战 / 回放 artboards).
export const CampIcon = () => <Icon stroke={1.8}><path d="M2.5 20h19" /><path d="M12 5 4 20M12 5l8 15" /><path d="M12 12.5 9 20M12 12.5 15 20" /><path d="M12 5V3" /></Icon>;
export const RosterIcon = () => (
  <Icon stroke={1.8}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6" /><path d="M17.5 14.6c1.6.6 2.7 2.1 3 4.4" /></Icon>
);
export const FlagIcon = () => <Icon stroke={1.8}><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></Icon>;
export const ChestIcon = () => (
  <Icon stroke={1.8}><rect x="3.5" y="9" width="17" height="11" rx="1.5" /><path d="M3.5 13h17" /><path d="M6 9V6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5V9" /><path d="M11 12h2v3h-2z" /></Icon>
);
export const ReportIcon = () => <Icon stroke={1.8}><path d="M7 4h11a2 2 0 0 1 2 2v1H9" /><path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" /><path d="M9 11h7M9 15h5" /></Icon>;
export const BookIcon = () => <Icon stroke={1.8}><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" /></Icon>;
export const SlidersIcon = () => <Icon stroke={1.8}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>;
// 生产 / 主线 / 传承 (permanent-legion pages).
export const AnvilIcon = () => <Icon stroke={1.8}><path d="M3.5 8h11.5a4 4 0 0 0 4 4H18l-2 3H8l-1-3C4.8 12 3.5 10.5 3.5 8z" /><path d="M9 15l-2 5h10l-2-5" /><path d="M19 5.5l1.5-1.5M17 4V2" /></Icon>;
export const ScrollIcon = () => (
  <Icon stroke={1.8}><path d="M7 4h11a2 2 0 0 1 2 2v1h-3" /><path d="M7 4a2 2 0 0 0-2 2v11a3 3 0 0 0 3 3h9a2 2 0 0 0 2-2V7" /><path d="M5 17a3 3 0 0 0 3 3" /><path d="M9 9h6M9 12.5h6M9 16h3" /></Icon>
);
export const CandleIcon = () => <Icon stroke={1.8}><path d="M12 3c1.6 1.8 1.6 3.4 0 4.6-1.6-1.2-1.6-2.8 0-4.6z" /><rect x="9" y="9.5" width="6" height="9" rx="1" /><path d="M6 21h12" /></Icon>;
export const CycleIcon = () => <Icon stroke={1.8}><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1" /><path d="M17.5 3.5v3.5H14" /><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1" /><path d="M6.5 20.5V17H10" /></Icon>;
export const LockIcon = () => <Icon><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>;
export const EyeIcon = () => <Icon><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></Icon>;
export const BackIcon = () => <Icon><path d="M15 6l-6 6 6 6" /></Icon>;
export const AgentIcon = () => (
  <Icon stroke={1.8}><rect x="5" y="7" width="14" height="12" rx="2.5" /><path d="M12 7V4" /><circle cx="12" cy="3.5" r="1" /><path d="M9.5 12v1.5M14.5 12v1.5" /><path d="M9.5 16.5h5" /></Icon>
);
export const HistoryIcon = () => <Icon stroke={2}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></Icon>;
export const PrevIcon = () => <Icon stroke={2}><path d="M6 5v14" /><path d="M18 6l-9 6 9 6z" /></Icon>;
export const NextIcon = () => <Icon stroke={2}><path d="M18 5v14" /><path d="M6 6l9 6-9 6z" /></Icon>;
export const CheckIcon = () => <Icon stroke={2.4}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const PlayIcon = ({ paused }: { paused: boolean }) => (
  <svg className="ico" width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
  </svg>
);
export const SeizeIcon = ({ size }: { size?: number }) => (
  <Icon size={size}><path d="M4 18h16" /><path d="M5 15L4 7l5 4 3-6 3 6 5-4-1 8z" /></Icon>
);

export function BossFlag({ size = 16 }: { size?: number }) {
  return (
    <svg className="flag" width={size} height={size * 1.25} viewBox="0 0 16 20" aria-hidden="true">
      <path d="M3 2v17" stroke="#2B2421" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M4 3h10l-2.6 3.4L14 10H4z" fill="#A84940" stroke="#2B2421" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="3" cy="2" r="1.6" fill="#D4AA52" />
    </svg>
  );
}
