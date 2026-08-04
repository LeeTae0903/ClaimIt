"use client";

import { useState } from "react";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { GiveawayForm } from "@/components/GiveawayForm";

const MODES = [
  { key: "single", label: "One link" },
  { key: "giveaway", label: "Giveaway" },
] as const;

export function CreateModeSwitch() {
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("single");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === m.key
                ? "bg-raised text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "single" ? <CreateLinkForm /> : <GiveawayForm />}
    </div>
  );
}
