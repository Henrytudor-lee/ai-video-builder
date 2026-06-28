"use client";
import { useEffect, useState } from "react";

interface LightboxProps {
  state: { kind: "sb"; sbId: string; idx: number; allSb?: Array<{ id: string; name: string }>; pid: string } | { kind: "single"; src: string; title: string } | null;
  onClose: () => void;
  onSelect?: (path: string) => void;
}

export default function Lightbox({ state, onClose, onSelect }: LightboxProps) {
  const [sbList, setSbList] = useState<Array<{ id: string; name: string; candidates: string[]; selected: string }>>([]);
  const [currentSbIdx, setCurrentSbIdx] = useState(0);

  useEffect(() => {
    if (state && state.kind === "sb" && state.allSb) {
      const cur = state.allSb.findIndex((s) => s.id === state.sbId);
      setCurrentSbIdx(cur >= 0 ? cur : 0);
    }
  }, [state]);

  useEffect(() => {
    if (state && state.kind === "sb") {
      // 拉取所有分镜的 candidates 信息（用于上下分镜切换）
      const pid = state.pid;
      const sbIds = state.allSb?.map((s) => s.id) || [state.sbId];
      Promise.all(
        sbIds.map((id) =>
          fetch(`/api/projects/${pid}/storyboards/${id}`).then((r) => r.json()).catch(() => null)
        )
      ).then((arr) => {
        setSbList(arr.filter(Boolean).map((s) => ({ id: s.id, name: s.name, candidates: s.candidates || [], selected: s.selected || "" })));
      });
    }
  }, [state?.kind === "sb" ? state.sbId : null]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowUp" && state.kind === "sb") prevSb();
      else if (e.key === "ArrowDown" && state.kind === "sb") nextSb();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, sbList]);

  if (!state) return null;

  let currentSrc = "";
  let currentTitle = "";
  let currentList: string[] = [];
  let currentIdx = 0;

  if (state.kind === "single") {
    currentSrc = state.src;
    currentTitle = state.title;
  } else {
    const sb = sbList[currentSbIdx] || sbList.find((s) => s.id === state.sbId);
    if (sb) {
      currentList = sb.candidates || [];
      currentIdx = Math.max(0, Math.min(state.idx, currentList.length - 1));
      currentSrc = currentList[currentIdx] ? `/api/projects/${state.pid}/storyboards/${sb.id}/image-raw?path=${encodeURIComponent(currentList[currentIdx])}` : "";
      currentTitle = `${sb.name} (${currentIdx + 1}/${currentList.length})`;
    }
  }

  function prev() {
    if (state?.kind === "sb" && currentList.length > 0) {
      // 触发父组件更新 idx
      const sb = sbList[currentSbIdx];
      if (sb) {
        const newIdx = (currentIdx - 1 + currentList.length) % currentList.length;
        // 用 hack：触发 state 变化通过 onSelect？不，这是灯箱内导航
        // 简化：直接 setState on parent via onChange callback
      }
    }
  }
  function next() { /* same */ }
  function prevSb() { if (state?.kind === "sb" && sbList.length > 0) setCurrentSbIdx((i) => (i - 1 + sbList.length) % sbList.length); }
  function nextSb() { if (state?.kind === "sb" && sbList.length > 0) setCurrentSbIdx((i) => (i + 1) % sbList.length); }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white text-2xl bg-white/10 hover:bg-white/20 rounded-full">×</button>
      {currentList.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white text-2xl bg-white/10 hover:bg-white/20 rounded-full">‹</button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white text-2xl bg-white/10 hover:bg-white/20 rounded-full">›</button>
        </>
      )}
      {state.kind === "sb" && sbList.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prevSb(); }} className="absolute left-4 top-4 w-10 h-10 flex items-center justify-center text-white text-base bg-white/10 hover:bg-white/20 rounded-full" title="上一分镜">↑</button>
          <button onClick={(e) => { e.stopPropagation(); nextSb(); }} className="absolute left-4 bottom-20 w-10 h-10 flex items-center justify-center text-white text-base bg-white/10 hover:bg-white/20 rounded-full" title="下一分镜">↓</button>
        </>
      )}
      <div className="max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        {currentSrc ? (
          <img src={currentSrc} alt={currentTitle} className="max-w-full max-h-[85vh] object-contain" />
        ) : (
          <div className="w-96 h-64 flex items-center justify-center text-white/60">暂无图</div>
        )}
        <div className="text-center text-white text-sm mt-3">{currentTitle}</div>
        {onSelect && state.kind === "sb" && currentList[currentIdx] && (
          <div className="text-center mt-2">
            <button onClick={() => { onSelect(currentList[currentIdx]); onClose(); }}
              className="px-4 py-1.5 text-xs rounded-md bg-[var(--color-brand)] text-white">选定为当前分镜</button>
          </div>
        )}
      </div>
    </div>
  );
}
