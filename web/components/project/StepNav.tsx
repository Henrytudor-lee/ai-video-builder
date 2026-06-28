"use client";

interface StepNavProps {
  currentStep: number;
  steps: string[];
  onChange: (s: number) => void;
}

export default function StepNav({ currentStep, steps, onChange }: StepNavProps) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {steps.map((s, i) => {
        const idx = i + 1;
        const isOn = currentStep === idx;
        const isPast = currentStep > idx;
        return (
          <button
            key={s}
            onClick={() => onChange(idx)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
              isOn
                ? "bg-[var(--color-brand)] text-white"
                : isPast
                ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-ink)]"
                : "bg-white border border-[var(--color-line)] text-[var(--color-ink-3)] hover:border-[var(--color-line-strong)]"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                isOn ? "bg-white/20" : isPast ? "bg-[var(--color-brand)] text-white" : "bg-[var(--color-bg-soft)]"
              }`}
            >
              {idx}
            </span>
            {s}
          </button>
        );
      })}
    </div>
  );
}
