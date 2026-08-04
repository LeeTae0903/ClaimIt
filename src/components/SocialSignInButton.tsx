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
      className="btn btn-ghost"
    >
      {icon}
      {label}
    </button>
  );
}
