// The SocialReins mark: a speech bubble with an orange rein running through it. Source of truth for app/icon.svg.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--color-ink)" />
      <path
        d="M14 14 H50 V40 H30 L20 50 V40 H14 Z"
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M24 27 C32 22 40 32 48 27 C53 24 56 22 58 22"
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
