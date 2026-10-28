const platforms = ["Facebook Pages", "Instagram", "Threads", "LinkedIn", "Bluesky", "X"];

// Six reins gathered into one ring: the product in one picture.
export function Reins() {
  const ys = platforms.map((_, i) => 46 + i * 66);
  return (
    <svg viewBox="0 0 600 420" className="h-auto w-full" role="img" aria-label="Six platforms held by one set of reins">
      {ys.map((y, i) => (
        <path
          key={platforms[i]}
          className="rein"
          pathLength={1}
          d={`M 70 210 C 220 210, 200 ${y}, 360 ${y}`}
          fill="none"
          stroke="var(--color-signal-deep)"
          strokeWidth={7}
          strokeLinecap="round"
        />
      ))}
      {ys.map((y, i) => (
        <g key={`label-${platforms[i]}`}>
          <rect x={358} y={y - 9} width={14} height={18} rx={3} fill="none" stroke="var(--color-signal)" strokeWidth={4} />
          <text x={388} y={y + 8} fill="var(--color-ink)" fontFamily="var(--font-display)" fontWeight={700} fontSize={24}>
            {platforms[i]}
          </text>
        </g>
      ))}
      <circle cx={56} cy={210} r={26} fill="none" stroke="var(--color-signal)" strokeWidth={9} />
    </svg>
  );
}
