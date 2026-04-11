"use client";

import { useMemo, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { DayTimeline } from "@/components/DayTimeline";
import { GemCounter } from "@/components/GemCounter";
import { FocusBlock, NowPanel } from "@/components/NowPanel";

const starterBlocks: FocusBlock[] = [
  {
    id: "morning-reset",
    timeRange: "9:00 - 9:20",
    title: "Open planner and choose the first task",
    status: "completed",
    durationMinutes: 20,
  },
  {
    id: "essay-outline",
    timeRange: "9:25 - 10:05",
    title: "Outline history essay",
    status: "active",
    durationMinutes: 40,
  },
  {
    id: "email-sweep",
    timeRange: "10:15 - 10:35",
    title: "Reply to two important emails",
    status: "planned",
    durationMinutes: 20,
  },
  {
    id: "stretch-break",
    timeRange: "10:35 - 10:45",
    title: "Water, stretch, and reset desk",
    status: "planned",
    durationMinutes: 10,
  },
  {
    id: "project-draft",
    timeRange: "11:00 - 11:45",
    title: "Draft project notes for team check-in",
    status: "planned",
    durationMinutes: 45,
  },
];

export default function DashboardPage() {
  const [blocks, setBlocks] = useState(starterBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState("essay-outline");
  const [isRunning, setIsRunning] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [isTasksExpanded, setIsTasksExpanded] = useState(false);
  const [gemCount, setGemCount] = useState(1);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [doneMessage, setDoneMessage] = useState("");

  const selectedBlock = useMemo(
    () => blocks.find((block) => block.id === selectedBlockId) ?? blocks[0],
    [blocks, selectedBlockId],
  );

  const selectBlock = (blockId: string) => {
    setSelectedBlockId(blockId);
    setIsRunning(false);
    setIsFocusMode(false);
    setIsChatExpanded(false);
    setIsTasksExpanded(false);
    setDoneMessage("");
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) => ({
        ...block,
        status:
          block.status === "completed"
            ? "completed"
            : block.id === blockId
              ? "active"
              : "planned",
      })),
    );
  };

  const completeBlock = () => {
    setIsRunning(false);
    setIsFocusMode(false);
    setIsChatExpanded(false);
    setIsTasksExpanded(false);
    setDoneMessage("Block done. Nice.");
    setGemCount((count) => count + 1);
    setCelebrationKey((key) => key + 1);
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === selectedBlockId
          ? { ...block, status: "completed" }
          : block,
      ),
    );
  };

  const startFocusMode = () => {
    setDoneMessage("");
    setIsFocusMode(true);
    setIsRunning(true);
    setIsChatExpanded(false);
    setIsTasksExpanded(false);
  };

  const focusGridClass = isFocusMode
    ? isChatExpanded && isTasksExpanded
      ? "lg:grid-cols-[420px_minmax(520px,1fr)_340px]"
      : isChatExpanded
        ? "lg:grid-cols-[420px_minmax(520px,1fr)_64px]"
        : isTasksExpanded
          ? "lg:grid-cols-[64px_minmax(520px,1fr)_340px]"
          : "lg:grid-cols-[64px_minmax(520px,1fr)_64px]"
    : "lg:grid-cols-2";

  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#edf6f3_0%,#f7fbfa_48%,#e9f4f1_100%)] text-[#203b37]">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[8px] border border-[#d2e3df] bg-white/90 p-5 shadow-[0_18px_45px_rgba(35,74,67,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-[#2f8f83]">
              Chronos dashboard
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#182f2b] md:text-4xl">
              One clear block at a time
            </h1>
          </div>
          <GemCounter count={gemCount} />
        </header>

        <div
          className={`grid flex-1 gap-5 transition-all duration-500 ${focusGridClass}`}
        >
          {isFocusMode ? (
            isChatExpanded ? (
              <div className="order-2 transition-all duration-500 lg:order-none lg:col-start-1">
                <ChatPanel
                  isFocusMode
                  onCollapse={() => setIsChatExpanded(false)}
                />
              </div>
            ) : (
              <CollapsedRail
                label="Coach"
                hint="Expand chat"
                side="left"
                onClick={() => setIsChatExpanded(true)}
              />
            )
          ) : (
            <div className="order-2 transition-all duration-500 lg:order-none lg:col-start-1">
              <ChatPanel />
            </div>
          )}

          <div className="order-1 min-w-0 transition-all duration-500 lg:order-none lg:col-start-2">
            <NowPanel
              key={selectedBlock.id}
              block={selectedBlock}
              isRunning={isRunning}
              isFocusMode={isFocusMode}
              celebrationKey={celebrationKey}
              doneMessage={doneMessage}
              onStart={startFocusMode}
              onPause={() => setIsRunning(false)}
              onDone={completeBlock}
            />
          </div>

          {isFocusMode ? (
            isTasksExpanded ? (
              <div className="order-3 transition-all duration-500 lg:order-none lg:col-start-3">
                <DayTimeline
                  blocks={blocks}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={selectBlock}
                  onCollapse={() => setIsTasksExpanded(false)}
                />
              </div>
            ) : (
              <CollapsedRail
                label="Tasks"
                hint="Expand tasks"
                side="right"
                onClick={() => setIsTasksExpanded(true)}
              />
            )
          ) : null}
        </div>
      </div>
    </main>
  );
}

type CollapsedRailProps = {
  label: string;
  hint: string;
  side: "left" | "right";
  onClick: () => void;
};

function CollapsedRail({ label, hint, side, onClick }: CollapsedRailProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative order-3 flex min-h-[72px] items-center justify-center rounded-[8px] border border-[#cfe0dc] bg-white/75 px-4 py-3 text-[#276f67] shadow-[0_14px_34px_rgba(35,74,67,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#2f8f83] hover:bg-white hover:shadow-[0_18px_42px_rgba(35,74,67,0.12)] active:scale-[0.98] lg:order-none lg:min-h-[calc(100vh-170px)] lg:px-2 ${
        side === "left" ? "lg:col-start-1" : "lg:col-start-3"
      }`}
      aria-label={hint}
    >
      <span className="hidden text-sm font-bold uppercase tracking-[0.12em] [writing-mode:vertical-rl] lg:block">
        {label}
      </span>
      <span className="text-sm font-bold uppercase tracking-[0.12em] lg:hidden">
        {label}
      </span>
      <span
        className={`pointer-events-none absolute top-4 hidden rounded-[8px] bg-[#203b37] px-3 py-2 text-sm font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 lg:block ${
          side === "left" ? "left-14" : "right-14"
        }`}
      >
        {hint}
      </span>
    </button>
  );
}
