// 能力雷达图（名册「战斗能力」「基本能力」）：固定刻度，每条轴是 value / max，0 在中心、上限在外圈。
// 纯 SVG，三层网格；数值本身在旁边的表格里。
export interface RadarAxis { label: string; value: number; max: number }

export function Radar({ axes, label, size = 120 }: { axes: RadarAxis[]; label: string; size?: number }) {
  const c = size / 2, r = c - 15;
  const point = (i: number, k: number): [number, number] => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
    return [c + Math.cos(angle) * r * k, c + Math.sin(angle) * r * k];
  };
  const ring = (k: number) => axes.map((_, i) => point(i, k).join(',')).join(' ');
  const share = (a: RadarAxis) => (a.max > 0 ? Math.max(0, Math.min(1, a.value / a.max)) : 0);
  const shape = axes.map((a, i) => point(i, Math.max(0.04, share(a))).join(',')).join(' ');
  return (
    <svg className="radar" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`${label}：${axes.map(a => `${a.label} ${a.value}`).join('，')}`}>
      {[1, 2 / 3, 1 / 3].map(k => <polygon key={k} points={ring(k)} className={k === 1 ? 'rd-edge' : 'rd-ring'} />)}
      {axes.map((_, i) => { const [x, y] = point(i, 1); return <line key={i} x1={c} y1={c} x2={x} y2={y} className="rd-ring" />; })}
      <polygon points={shape} className="rd-shape" />
      {axes.map((a, i) => { const [x, y] = point(i, share(a)); return <circle key={i} cx={x} cy={y} r={1.8} className="rd-dot" />; })}
      {axes.map((a, i) => {
        const [x, y] = point(i, 1.2);
        return <text key={a.label} x={x} y={y} className="rd-label" textAnchor="middle" dominantBaseline="central">{a.label}</text>;
      })}
    </svg>
  );
}
