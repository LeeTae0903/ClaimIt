"use client";

import { ReactNode } from "react";

export function SocialSignInButton({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3.5 text-base font-medium text-black transition active:scale-[0.98] disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white"
    >
      {icon}
      {label}
    </button>
  );
}
