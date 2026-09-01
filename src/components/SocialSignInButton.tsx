import { ReactNode } from "react";

export function SocialSignInButton({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:border-zinc-700 hover:text-white active:scale-[0.99] disabled:opacity-50"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
