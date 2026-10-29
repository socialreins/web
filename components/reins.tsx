import { platforms } from "@/components/platform-icons";

// Every platform's rein runs back into the one SocialReins mark: the product in one picture.
export function Reins() {
  const ys = platforms.map((_, i) => 34 + i * 58);
  const hub = { x: 92, y: 237 };
  return (
    <svg
      viewBox="0 0 600 474"
      className="h-auto w-full"
      role="img"
      aria-label={`One SocialReins account holding the reins to ${platforms.map((p) => p.name).join(", ")}`}
    >
      {ys.map((y, i) => (
        <path
          key={platforms[i].id}
          className="rein"
          pathLength={1}
          d={`M ${hub.x + 34} ${hub.y} C 260 ${hub.y}, 250 ${y}, 404 ${y}`}
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}
      {ys.map((y, i) => {
        const p = platforms[i];
        return (
          <g key={`tile-${p.id}`} transform={`translate(404 ${y - 22})`}>
            <rect width={44} height={44} rx={12} fill="var(--color-paper)" stroke="var(--color-ink)" strokeOpacity={0.12} />
            <svg x={11} y={11} width={22} height={22} viewBox="0 0 24 24" fill={p.color}>
              <path d={p.path} />
            </svg>
            <text x={58} y={29} fill="var(--color-ink)" fontFamily="var(--font-display)" fontWeight={700} fontSize={20}>
              {p.name}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${hub.x - 40} ${hub.y - 40})`}>
        <rect width={80} height={80} rx={19} fill="var(--color-ink)" />
        <g transform="scale(1.25)">
          <path d="M14 14 H50 V40 H30 L20 50 V40 H14 Z" fill="none" stroke="var(--color-paper)" strokeWidth={5} strokeLinejoin="round" />
          <path
            d="M24 27 C32 22 40 32 48 27 C53 24 56 22 58 22"
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth={4.5}
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}
