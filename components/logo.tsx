// The SocialReins mark: three reins gathered into one brass ring. Source of truth for app/icon.svg.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--color-pine)" />
      <g
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth="4.5"
        strokeLinecap="round"
      >
        <path d="M25 32 C37 32 37 16 51 16" />
        <path d="M25 32 H51" />
        <path d="M25 32 C37 32 37 48 51 48" />
      </g>
      <circle
        cx="18"
        cy="32"
        r="7"
        fill="none"
        stroke="var(--color-brass)"
        strokeWidth="4.5"
      />
    </svg>
  );
}
