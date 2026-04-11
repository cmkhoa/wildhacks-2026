"use client";

import { useEffect, useMemo, useState } from "react";

export type FocusBlock = {
  id: string;
  timeRange: string;
  title: string;
  status: "planned" | "active" | "completed";
  durationMinutes: number;
};

type NowPanelProps = {
  block: FocusBlock;
  isRunning: boolean;
  isFocusMode: boolean;
  celebrationKey: number;
  doneMessage: string;
  onStart: () => void;
  onPause: () => void;
  onDone: () => void;
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getProgressLabel(progress: number) {
  if (progress >= 82) {
    return "Almost there";
  }

  if (progress >= 45) {
    return "You're on a roll";
  }

  if (progress > 0) {
    return "Strong start";
  }

  return "Ready when you are";
}

export function NowPanel({
  block,
  isRunning,
  isFocusMode,
  celebrationKey,
  doneMessage,
  onStart,
  onPause,
  onDone,
}: NowPanelProps) {
  const startingSeconds = useMemo(
    () => block.durationMinutes * 60,
    [block.durationMinutes],
  );
  const [remainingSeconds, setRemainingSeconds] = useState(startingSeconds);

  useEffect(() => {
    if (!isRunning || remainingSeconds <= 0 || block.status === "completed") {
      return;
    }

    const timerId = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [block.status, isRunning, remainingSeconds]);

  const progress =
    startingSeconds === 0
      ? 0
      : ((startingSeconds - remainingSeconds) / startingSeconds) * 100;
  const minutesLeft = Math.ceil(remainingSeconds / 60);
  const progressPercent = Math.round(progress);
  const progressLabel = getProgressLabel(progress);
  const showFocusControls =
    isFocusMode || isRunning || block.status === "completed";

  return (
    <section
      className={`relative flex flex-col justify-between overflow-hidden rounded-[8px] border bg-[#fbfdfc] p-5 shadow-[0_18px_45px_rgba(35,74,67,0.09)] transition duration-500 md:p-6 ${
        isFocusMode
          ? "active-focus-card min-h-[620px] scale-[1.006] border-[#2f8f83] lg:min-h-[calc(100vh-170px)]"
          : "min-h-[560px] border-[#cfe0dc] lg:min-h-[640px]"
      }`}
    >
      {celebrationKey > 0 ? (
        <div
          key={celebrationKey}
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <span className="confetti confetti-one" />
          <span className="confetti confetti-two" />
          <span className="confetti confetti-three" />
          <span className="confetti confetti-four" />
          <span className="confetti confetti-five" />
        </div>
      ) : null}

      <div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#6d827d]">
              Focus now
            </p>
            <p className="mt-2 text-lg text-[#607973]">{block.timeRange}</p>
          </div>
          <span
            className={`rounded-[8px] px-3 py-2 text-base font-semibold shadow-sm ${
              isRunning
                ? "bg-[#dff5ef] text-[#276f67] ring-4 ring-[#2f8f83]/10"
                : "bg-[#eef6f3] text-[#5f7772]"
            }`}
          >
            {block.status === "completed"
              ? "Completed"
              : isFocusMode
                ? isRunning
                  ? "In motion"
                  : "Paused"
                : "Focus block"}
          </span>
        </div>

        <h1
          className={`max-w-xl font-semibold leading-tight text-[#182f2b] ${
            isFocusMode ? "text-4xl md:text-6xl" : "text-3xl md:text-4xl"
          }`}
        >
          {block.title}
        </h1>

        <div className="mt-7 rounded-[8px] border border-[#d8e7e3] bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-[#607973]">
                Time remaining
              </p>
              <p className="mt-1 text-sm font-medium text-[#7c908b]">
                {minutesLeft} min left in this block
              </p>
            </div>
            <p
              className={`rounded-[8px] bg-[#edf6f3] px-4 py-3 text-4xl font-semibold tabular-nums text-[#203b37] shadow-inner transition ${
                isRunning ? "timer-breathe" : ""
              } md:text-5xl`}
            >
              {formatTime(remainingSeconds)}
            </p>
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-[#24413d]">
              {progressLabel}
            </p>
            <p className="rounded-[8px] bg-[#fff7d9] px-3 py-1.5 text-sm font-bold text-[#6b5c2e]">
              {progressPercent}% complete
            </p>
          </div>
          <div
            className="h-5 overflow-hidden rounded-[8px] bg-[#e5efec]"
            role="progressbar"
            aria-label="Current block progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div
              className={`h-full rounded-[8px] bg-[linear-gradient(90deg,#2f8f83,#54c7a8,#f1c75b)] shadow-[0_0_18px_rgba(47,143,131,0.22)] transition-all duration-700 ${
                isRunning ? "progress-shimmer" : ""
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between text-sm font-semibold text-[#6d827d]">
            <span>Started</span>
            <span>Done</span>
          </div>
        </div>
      </div>

      <div>
        {doneMessage ? (
          <p
            key={celebrationKey}
            className="celebration-pop mb-4 rounded-[8px] border border-[#cfe0dc] bg-[#e8f8f3] px-4 py-3 text-lg font-semibold text-[#24413d]"
          >
            {doneMessage}
          </p>
        ) : null}

        <div
          className={`grid gap-3 ${showFocusControls ? "sm:grid-cols-3" : ""}`}
        >
          <button
            type="button"
            onClick={onStart}
            disabled={isRunning || block.status === "completed"}
            className="button-pop rounded-[8px] bg-[linear-gradient(135deg,#2f8f83,#47b49f)] px-5 py-4 text-lg font-semibold text-white shadow-[0_14px_28px_rgba(47,143,131,0.28)] transition hover:scale-[1.025] hover:shadow-[0_18px_34px_rgba(47,143,131,0.34)] active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-[#a7c8c2] disabled:bg-none disabled:shadow-none disabled:hover:scale-100"
          >
            Start
          </button>
          {showFocusControls ? (
            <>
              <button
                type="button"
                onClick={onPause}
                disabled={!isRunning || block.status === "completed"}
                className="button-pop rounded-[8px] border border-[#cfe0dc] bg-white px-5 py-4 text-lg font-semibold text-[#24413d] transition hover:scale-[1.02] hover:bg-[#f7fbfa] hover:shadow-sm active:scale-[0.96] disabled:cursor-not-allowed disabled:text-[#9bb0ab] disabled:hover:scale-100"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={onDone}
                disabled={block.status === "completed"}
                className="button-pop rounded-[8px] border border-[#d8c98f] bg-[linear-gradient(135deg,#fff7d9,#f8eaa8)] px-5 py-4 text-lg font-semibold text-[#6b5c2e] transition hover:scale-[1.02] hover:bg-[#f6e9ad] hover:shadow-sm active:scale-[0.96] disabled:cursor-not-allowed disabled:border-[#e4ddc0] disabled:bg-[#fbf8ef] disabled:bg-none disabled:text-[#b8ad8a] disabled:hover:scale-100"
              >
                Done
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
