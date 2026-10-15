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

export function BossFlag({ size = 16 }: { size?: number }) {
  return (
    <svg className="flag" width={size} height={size * 1.25} viewBox="0 0 16 20" aria-hidden="true">
      <path d="M3 2v17" stroke="#2B2421" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M4 3h10l-2.6 3.4L14 10H4z" fill="#A84940" stroke="#2B2421" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="3" cy="2" r="1.6" fill="#D4AA52" />
    </svg>
  );
}
