export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="claimit-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6aabf3" />
          <stop offset="100%" stopColor="#1d5fa8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#claimit-mark)" />
      {/* An open link that a value drops out of — the claim, in one glyph. */}
      <path
        d="M12.5 19.5 19.5 12.5"
        stroke="#04121f"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M19.5 12.5h-4.2M19.5 12.5v4.2"
        stroke="#04121f"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-[0.95rem] font-semibold tracking-tight ${className}`}>
      claim<span className="text-accent">IT</span>
    </span>
  );
}
