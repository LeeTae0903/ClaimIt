"use client";

import { useState } from "react";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { ExternalLinkForm } from "@/components/ExternalLinkForm";
import { GiveawayForm } from "@/components/GiveawayForm";

const MODES = [
  { key: "single", label: "One link" },
  { key: "giveaway", label: "Giveaway" },
] as const;

const SOURCES = [
  { key: "builtin", label: "Built-in wallet" },
  { key: "external", label: "My wallet" },
] as const;

type Mode = (typeof MODES)[number]["key"];
type Source = (typeof SOURCES)[number]["key"];

function Segmented<T extends string>({
  options,
  value,
  onChange,
  small,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`flex-1 rounded-lg font-medium transition ${
            small ? "py-1.5 text-xs" : "py-2 text-sm"
          } ${
            value === o.key
              ? "bg-raised text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CreateModeSwitch({
  defaultSource = "builtin",
}: {
  defaultSource?: Source;
}) {
  const [mode, setMode] = useState<Mode>("single");
  const [source, setSource] = useState<Source>(defaultSource);

  return (
    <div className="space-y-6">
      <Segmented options={MODES} value={mode} onChange={setMode} />

      {mode === "single" ? (
        <div className="space-y-5">
          <div>
            <span className="eyebrow">Fund it from</span>
            <div className="mt-2">
              <Segmented
                options={SOURCES}
                value={source}
                onChange={setSource}
                small
              />
            </div>
          </div>
          {source === "builtin" ? <CreateLinkForm /> : <ExternalLinkForm />}
        </div>
      ) : (
        // Giveaways go through the built-in wallet for now: a batch signed
        // from an external wallet needs the same on-chain verification path,
        // just applied to the batch, and that hasn't been exercised yet.
        <GiveawayForm />
      )}
    </div>
  );
}
