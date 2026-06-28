"use client";
import { useEffect, useState } from "react";

type ModalType = "alert" | "confirm" | "prompt";
type Resolver<T> = (v: T) => void;

interface ModalState {
  type: ModalType;
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
  resolve?: Resolver<any>;
}

let _setState: ((s: ModalState | null) => void) | null = null;
let _current: ModalState | null = null;

function openModal<T>(s: Omit<ModalState, "resolve">): Promise<T> {
  return new Promise((resolve) => {
    _current = { ...s, resolve: resolve as Resolver<any> };
    _setState?.(_current);
  });
}

export const modal = {
  alert: (message: string, opts: { title?: string; danger?: boolean } = {}) =>
    openModal<void>({ type: "alert", title: opts.title || "提示", message, danger: opts.danger }),
  confirm: (message: string, opts: { title?: string; danger?: boolean; confirmText?: string; cancelText?: string } = {}) =>
    openModal<boolean>({
      type: "confirm",
      title: opts.title || "请确认",
      message,
      danger: opts.danger,
      confirmText: opts.confirmText,
      cancelText: opts.cancelText,
    }),
  prompt: (message: string, opts: { title?: string; defaultValue?: string; placeholder?: string; multiline?: boolean } = {}) =>
    openModal<string | null>({
      type: "prompt",
      title: opts.title || "请输入",
      message,
      defaultValue: opts.defaultValue,
      placeholder: opts.placeholder,
      multiline: opts.multiline,
    }),
};

export default function ModalRoot() {
  const [state, setState] = useState<ModalState | null>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    _setState = setState;
    return () => { _setState = null; };
  }, []);

  useEffect(() => {
    if (state) setInput(state.defaultValue || "");
  }, [state?.type, state?.defaultValue]);

  if (!state) return null;

  const close = (v: any) => {
    state.resolve?.(v);
    setState(null);
    _current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => close(state.type === "alert" ? undefined : state.type === "confirm" ? false : null)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-[var(--color-line)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
          <h3 className="text-base font-semibold text-[var(--color-ink-1)]">{state.title}</h3>
          <button
            onClick={() => close(state.type === "alert" ? undefined : state.type === "confirm" ? false : null)}
            className="w-7 h-7 flex items-center justify-center text-[var(--color-ink-3)] hover:bg-[var(--color-bg-soft)] rounded"
          >×</button>
        </div>
        <div className="px-5 py-4">
          {state.type === "prompt" ? (
            state.multiline ? (
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={state.placeholder}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-soft)] text-sm font-mono outline-none focus:border-[var(--color-brand)] focus:bg-white"
                autoFocus
              />
            ) : (
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && close(input)}
                placeholder={state.placeholder}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-soft)] text-sm outline-none focus:border-[var(--color-brand)] focus:bg-white"
                autoFocus
              />
            )
          ) : (
            <p className="text-sm text-[var(--color-ink-2)] whitespace-pre-wrap leading-relaxed">{state.message}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-bg-soft)]">
          {state.type !== "alert" && (
            <button
              onClick={() => close(state.type === "confirm" ? false : null)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-line)] bg-white hover:bg-[var(--color-bg-elev-2)] text-[var(--color-ink-2)]"
            >
              {state.cancelText || "取消"}
            </button>
          )}
          <button
            onClick={() => close(state.type === "alert" ? undefined : state.type === "confirm" ? true : input)}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
              state.danger ? "bg-[var(--color-danger)] hover:opacity-90" : "bg-[var(--color-brand)] hover:opacity-90"
            }`}
          >
            {state.confirmText || (state.type === "alert" ? "确定" : state.type === "confirm" ? "确认" : "保存")}
          </button>
        </div>
      </div>
    </div>
  );
}
