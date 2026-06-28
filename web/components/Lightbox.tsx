"use client";
import { useEffect, useState, useCallback } from "react";

export type LightboxState =
  | { kind: "sb"; pid: string; sbId: string; idx: number; allSb: Array<{ id: string; name: string; candidates: string[]; selected: string }> }
  | { kind: "single"; src: string; title: string }
  | null;

interface LightboxProps {
  state: LightboxState;
  onClose: () => void;
  onSelect?: (path: string) => void;  // 选定为当前分镜
}

export default function Lightbox({ state, onClose, onSelect }: LightboxProps) {
  // sb 模式下用父组件传入的 allSb 实时切换；如缺则补全
  const [sbData, setSbData] = useState<Array<{ id: string; name: string; candidates: string[]; selected: string }>>([]);
  const [candIdx, setCandIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // 初始化 / 切换时同步 idx
  useEffect(() => {
    if (state && state.kind === "sb") {
      setCandIdx(state.idx || 0);
      if (state.allSb && state.allSb.length > 0) {
        setSbData(state.allSb);
      }
    }
  }, [state?.kind === "sb" ? state.sbId : null, state?.kind === "sb" ? state.idx : null]);

  // sb 模式下拉取所有分镜的 candidates（如果父组件没传）
  useEffect(() => {
    if (state?.kind !== "sb" || sbData.length > 0) return;
    const pid = state.pid;
    const sbIds = state.allSb?.map((s) => s.id) || [state.sbId];
    setLoading(true);
    Promise.all(
      sbIds.map((id) =>
        fetch(`/api/projects/${pid}/storyboards/${id}`).then((r) => r.json()).catch(() => null)
      )
    ).then((arr) => {
      setSbData(
        arr.filter(Boolean).map((s: any) => ({
          id: s.id, name: s.name, candidates: s.candidates || [], selected: s.selected || "",
        }))
      );
      setLoading(false);
    });
  }, [state?.kind === "sb" ? state.sbId : null]);

  // 键盘事件
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (state.kind === "sb") {
        if (e.key === "ArrowLeft") prevCand();
        else if (e.key === "ArrowRight") nextCand();
        else if (e.key === "ArrowUp") prevSb();
        else if (e.key === "ArrowDown") nextSb();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, sbData, candIdx]);

  if (!state) return null;

  // === 导航函数 ===
  const prevCand = useCallback(() => {
    if (state?.kind !== "sb") return;
    const cur = sbData.find((s) => s.id === state.sbId);
    if (!cur || cur.candidates.length === 0) return;
    setCandIdx((i) => (i - 1 + cur.candidates.length) % cur.candidates.length);
  }, [state, sbData]);

  const nextCand = useCallback(() => {
    if (state?.kind !== "sb") return;
    const cur = sbData.find((s) => s.id === state.sbId);
    if (!cur || cur.candidates.length === 0) return;
    setCandIdx((i) => (i + 1) % cur.candidates.length);
  }, [state, sbData]);

  const prevSb = useCallback(() => {
    if (state?.kind !== "sb" || sbData.length === 0) return;
    const cur = sbData.findIndex((s) => s.id === state.sbId);
    if (cur < 0) return;
    // 不修改父 state，但用户应该能切换。我们通过自定义事件通知父组件。
    const newSb = sbData[(cur - 1 + sbData.length) % sbData.length];
    state.allSb && (state as any).allSb[0]; // type trick - won't work
    // 简化：直接更新内部 state（视觉切换），但需要让父组件知道新的 sbId
    // 通过 window 自定义事件，父组件监听
    window.dispatchEvent(new CustomEvent("lightbox-sb-change", { detail: { sbId: newSb.id, idx: 0 } }));
  }, [state, sbData]);

  const nextSb = useCallback(() => {
    if (state?.kind !== "sb" || sbData.length === 0) return;
    const cur = sbData.findIndex((s) => s.id === state.sbId);
    if (cur < 0) return;
    const newSb = sbData[(cur + 1) % sbData.length];
    window.dispatchEvent(new CustomEvent("lightbox-sb-change", { detail: { sbId: newSb.id, idx: 0 } }));
  }, [state, sbData]);

  // === 渲染当前画面 ===
  let currentSrc = "";
  let currentTitle = "";
  let currentList: string[] = [];
  let totalCand = 0;

  if (state.kind === "single") {
    currentSrc = state.src;
    currentTitle = state.title;
  } else {
    const cur = sbData.find((s) => s.id === state.sbId);
    if (cur) {
      currentList = cur.candidates;
      totalCand = currentList.length;
      const idx = Math.max(0, Math.min(candIdx, totalCand - 1));
      if (currentList[idx]) {
        currentSrc = `/api/projects/${state.pid}/storyboards/${cur.id}/image-raw?path=${encodeURIComponent(currentList[idx])}`;
      }
      currentTitle = `${cur.name} (${idx + 1}/${totalCand})`;
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center text-white text-2xl bg-white/10 hover:bg-white/20 rounded-full">×</button>

      {/* 候选图左右切换（仅 sb 模式且有多张） */}
      {state.kind === "sb" && totalCand > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prevCand(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center text-white text-3xl bg-white/10 hover:bg-white/20 rounded-full"
            title="上一张候选"
          >‹</button>
          <button
            onClick={(e) => { e.stopPropagation(); nextCand(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center text-white text-3xl bg-white/10 hover:bg-white/20 rounded-full"
            title="下一张候选"
          >›</button>
        </>
      )}

      {/* 分镜上下切换（仅 sb 模式且有多个分镜） */}
      {state.kind === "sb" && sbData.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prevSb(); }}
            className="absolute left-1/2 -translate-x-1/2 top-4 z-10 px-3 h-10 flex items-center gap-1 text-white text-sm bg-white/10 hover:bg-white/20 rounded-full"
            title="上一分镜 (↑)"
          >↑ 上一分镜</button>
          <button
            onClick={(e) => { e.stopPropagation(); nextSb(); }}
            className="absolute left-1/2 -translate-x-1/2 bottom-20 z-10 px-3 h-10 flex items-center gap-1 text-white text-sm bg-white/10 hover:bg-white/20 rounded-full"
            title="下一分镜 (↓)"
          >↓ 下一分镜</button>
        </>
      )}

      <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="w-96 h-64 flex items-center justify-center text-white/60">加载中…</div>
        ) : currentSrc ? (
          <img src={currentSrc} alt={currentTitle} className="max-w-full max-h-[78vh] object-contain" />
        ) : (
          <div className="w-96 h-64 flex items-center justify-center text-white/60">暂无图</div>
        )}

        <div className="text-center text-white text-sm mt-3 px-4">{currentTitle}</div>
        <div className="text-center text-white/50 text-xs mt-1">
          {state.kind === "sb" ? "← → 切换候选图 · ↑ ↓ 切换分镜 · Esc 关闭" : "Esc 关闭"}
        </div>

        {onSelect && state.kind === "sb" && currentList[candIdx] && (
          <div className="text-center mt-3">
            <button
              onClick={() => { onSelect(currentList[candIdx]); onClose(); }}
              className="px-5 py-2 text-sm rounded-md bg-[var(--color-brand)] text-white font-medium hover:opacity-90"
            >
              ✓ 选定为当前分镜
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
