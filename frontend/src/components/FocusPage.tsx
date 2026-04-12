'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

type TaskBlock = {
  id?: string;
  title: string;
  reward_value: number;
  block_minutes: number;
  steps?: string[];
};

type ChatMessage = {
  role: 'assistant' | 'user';
  text: string;
};

type SubtaskData = {
  id?: string;
  title: string;
  steps?: string[];
  estimated_minutes?: number;
  completed?: boolean;
};

type SubtaskItem = {
  id: string;
  dbId?: string;       // MongoDB subtask ID for API calls
  text: string;
  checked: boolean;
  steps?: string[];
};

type FocusPageProps = {
  initialTask: TaskBlock;
  subtaskData?: SubtaskData[];
  docLinks?: string[];
  draftLinks?: string[];
};

export function FocusPage({ initialTask, subtaskData = [], docLinks = [], draftLinks = [] }: FocusPageProps) {
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(true);
  const [isRightCollapsed, setIsRightCollapsed] = useState(true);
  const subtaskCount = Math.max(1, subtaskData.length || (initialTask.steps?.length ?? 1));
  const perSubtaskMinutes = Math.ceil(initialTask.block_minutes / subtaskCount);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(
    perSubtaskMinutes * 60,
  );
  const [chatDraft, setChatDraft] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeSubtaskIndex, setActiveSubtaskIndex] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [isCompletingSubtask, setIsCompletingSubtask] = useState(false);

  const router = useRouter();

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'You are in focus mode. Keep only this block visible.' },
  ]);

  // Build subtask list from structured data or fallback to steps
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(() => {
    if (subtaskData.length > 0) {
      return subtaskData.map((st, i) => ({
        id: `subtask-${i}`,
        dbId: st.id,
        text: st.title,
        checked: st.completed ?? false,
        steps: st.steps,
      }));
    }
    if (initialTask.steps && initialTask.steps.length > 0) {
      return initialTask.steps.map((st, i) => ({
        id: `step-${i}`,
        text: st,
        checked: false,
      }));
    }
    return [
      { id: 'default-1', text: 'Start working on the task', checked: false },
    ];
  });

  // Find the first unchecked subtask index and mark task started
  useEffect(() => {
    const firstUnchecked = subtasks.findIndex(s => !s.checked);
    if (firstUnchecked >= 0) {
      setActiveSubtaskIndex(firstUnchecked);
    }
    
    // Mark task as started so streaks charge 5 instead of 10 if missed
    if (initialTask.id) {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      fetch(`${backendUrl}/api/tasks/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: initialTask.id }),
      }).catch(e => console.error("Failed to mark started", e));
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (isTimerRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            return 0;
          }

          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isTimerRunning, timeRemaining]);

  const progressPercent = Math.min(
    100,
    Math.max(
      0,
      ((initialTask.block_minutes * 60 - timeRemaining) /
        (initialTask.block_minutes * 60)) *
        100,
    ),
  );

  const completedCount = subtasks.filter(s => s.checked).length;
  const currentSubtask = subtasks[activeSubtaskIndex];

  const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
  const getEmail = () => typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null;

  // Complete a subtask via the API
  const completeSubtaskApi = useCallback(async (subtaskDbId: string) => {
    try {
      const email = getEmail();
      await fetch(`${getBackendUrl()}/api/tasks/subtask/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtask_id: subtaskDbId,
          email: email || undefined,
        }),
      });
    } catch (e) {
      console.error('Failed to complete subtask:', e);
    }
  }, []);

  // Complete the parent task via the API
  const completeTaskApi = useCallback(async () => {
    if (!initialTask.id) return;
    try {
      const email = getEmail();
      const elapsedMinutes = Math.round((initialTask.block_minutes * 60 - timeRemaining) / 60);
      await fetch(`${getBackendUrl()}/api/tasks/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: initialTask.id,
          actual_minutes: elapsedMinutes || initialTask.block_minutes,
          email: email || undefined,
        }),
      });
    } catch (e) {
      console.error('Failed to complete task:', e);
    }
  }, [initialTask.id, initialTask.block_minutes, timeRemaining]);

  const handlePause = () => setIsTimerRunning(false);
  const handleResume = () => setIsTimerRunning(true);

  // Check off the current subtask and advance to next
  const handleSubtaskDone = async () => {
    if (!currentSubtask || isCompletingSubtask) return;

    setIsCompletingSubtask(true);

    // Mark current subtask as checked
    const updatedSubtasks = subtasks.map((s, i) =>
      i === activeSubtaskIndex ? { ...s, checked: true } : s,
    );
    setSubtasks(updatedSubtasks);

    // Call API if we have a DB ID
    if (currentSubtask.dbId) {
      await completeSubtaskApi(currentSubtask.dbId);
    }

    // Find next unchecked subtask
    const nextUnchecked = updatedSubtasks.findIndex((s, i) => i > activeSubtaskIndex && !s.checked);
    const anyUnchecked = updatedSubtasks.findIndex(s => !s.checked);

    if (nextUnchecked >= 0) {
      // Advance to next subtask after current
      setActiveSubtaskIndex(nextUnchecked);
      setTimeRemaining(perSubtaskMinutes * 60);
      setIsTimerRunning(true);
    } else if (anyUnchecked >= 0) {
      // Wrap around to an earlier unchecked subtask
      setActiveSubtaskIndex(anyUnchecked);
      setTimeRemaining(perSubtaskMinutes * 60);
      setIsTimerRunning(true);
    } else {
      // All subtasks complete!
      setAllDone(true);
      setIsTimerRunning(false);

      await completeTaskApi();

      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', text: '🎉 All subtasks done! Great work. Heading back to dashboard...' },
      ]);

      setTimeout(() => router.push('/dashboard'), 2000);
    }

    setIsCompletingSubtask(false);
  };

  // Toggle a subtask from the side checklist
  const toggleSubtask = async (id: string) => {
    const idx = subtasks.findIndex(s => s.id === id);
    if (idx < 0) return;

    const subtask = subtasks[idx];
    const newChecked = !subtask.checked;

    setSubtasks(prev =>
      prev.map(s => s.id === id ? { ...s, checked: newChecked } : s),
    );

    // If checking off (not unchecking), call the API
    if (newChecked && subtask.dbId) {
      await completeSubtaskApi(subtask.dbId);
    }

    // If this was the active subtask and we just checked it, advance
    if (newChecked && idx === activeSubtaskIndex) {
      const updatedSubtasks = subtasks.map(s => s.id === id ? { ...s, checked: true } : s);
      const nextUnchecked = updatedSubtasks.findIndex((s, i) => i > idx && !s.checked);
      const anyUnchecked = updatedSubtasks.findIndex(s => !s.checked);

      if (nextUnchecked >= 0) {
        setActiveSubtaskIndex(nextUnchecked);
      } else if (anyUnchecked >= 0) {
        setActiveSubtaskIndex(anyUnchecked);
      } else {
        setAllDone(true);
        setIsTimerRunning(false);
        await completeTaskApi();
        setTimeout(() => router.push('/dashboard'), 2000);
      }
    }
  };

  // Done button: mark current subtask done (or go back if all done)
  const handleDone = async () => {
    if (allDone) {
      router.push('/dashboard');
      return;
    }
    await handleSubtaskDone();
  };

  const handleSendChat = async () => {
    const trimmed = chatDraft.trim();
    if (!trimmed || isChatLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: trimmed };
    const nextHistory = [...chatHistory, userMessage];
    setChatHistory(nextHistory);
    setChatDraft('');
    setIsChatLoading(true);

    try {
      const res = await fetch(`${getBackendUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          chat_history: chatHistory,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.status !== 'success') {
        throw new Error(data.detail || 'Chat request failed');
      }

      setChatHistory((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: data.reply || 'I’m here. What would help most right now?',
        },
      ]);
    } catch (error) {
      console.error('Failed to send focus chat message:', error);
      setChatHistory((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: 'I had trouble reaching the coach. Try again in a moment.',
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.ceil(seconds / 60);
    if (minutes === 1) return '1 min';
    return `${minutes} min`;
  };

  return (
    <main className="h-screen w-full overflow-hidden bg-[#FDFCFB] font-sans text-[#424242] selection:bg-teal-200">
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-6 py-6">
        <header className="mb-6 flex flex-shrink-0 items-center justify-between">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-widest text-[#828b9a]">
              Focus mode
            </p>
            <h1 className="mt-1 text-[28px] font-extrabold tracking-tight text-[#303030]">
              {initialTask.title}
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#6d6d6d] shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition hover:text-black hover:shadow-md"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="flex min-h-0 flex-1 items-stretch gap-6 pb-4 xl:gap-8">
          <SideRail
            collapsed={isLeftCollapsed}
            label="Planning chat"
            onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
            side="left"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
                {chatHistory.map((msg, index) => (
                  <div
                    key={`${msg.role}-${index}`}
                    className={`rounded-3xl border px-5 py-4 text-[13px] leading-relaxed shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${
                      msg.role === 'user'
                        ? 'border-[#DCEAE4] bg-[#F1F8F5] font-semibold text-[#5f766d]'
                        : 'border-gray-100 bg-white font-bold text-[#424242]'
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-shrink-0 items-center gap-3">
                <input
                  type="text"
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSendChat();
                    }
                  }}
                  placeholder="Ask for help..."
                  className="min-w-0 flex-1 rounded-3xl border border-gray-200 bg-white px-5 py-4 text-[13px] font-bold text-[#424242] shadow-sm transition-all placeholder:text-[#a1a1a1] hover:shadow-md focus:border-[#67B59F] focus:outline-none focus:ring-2 focus:ring-[#67B59F]/40"
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  disabled={!chatDraft.trim() || isChatLoading}
                  className="flex flex-shrink-0 items-center justify-center rounded-full bg-[#67B59F] px-5 py-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#5aa38e] disabled:opacity-50"
                >
                  {isChatLoading ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </SideRail>

          {/* ── Center Panel ─────────────────────────────────── */}
          <div className="flex h-full flex-1 flex-col rounded-[48px] bg-white p-10 shadow-[0_10px_40px_rgba(0,0,0,0.02)] transition-all duration-500 ease-in-out xl:p-14">
            <div className="flex flex-shrink-0 items-center space-x-4">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#8d8d8d]">
                {allDone ? 'All Done!' : `Subtask ${activeSubtaskIndex + 1} of ${subtasks.length}`}
              </span>
              {isTimerRunning && (
                <span className="animate-pulse rounded-full bg-[#E7F3ED] px-3 py-1.5 text-[10px] font-bold tracking-wide text-[#6cb593] shadow-sm">
                  In motion
                </span>
              )}
              {allDone && (
                <span className="rounded-full bg-[#E7F3ED] px-3 py-1.5 text-[10px] font-bold tracking-wide text-[#6cb593] shadow-sm">
                  🎉 Complete
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col items-center justify-center">
              {/* Current subtask name — big center text */}
              <h1 className="-mt-8 w-full max-w-[95%] text-center font-sans text-[48px] font-extrabold leading-[1.05] tracking-tight text-[#2B2B2B] md:text-[64px] xl:text-[80px]">
                {allDone ? '🎉' : (currentSubtask?.text ?? initialTask.title)}
              </h1>

              {/* Google Doc/Slides links */}
              {(docLinks.length > 0 || draftLinks.length > 0) && (
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                  {docLinks.map((url, i) => (
                    <a
                      key={`doc-${i}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-3xl border-2 border-dashed border-[#B5A6CC]/40 bg-white px-6 py-4 shadow-sm transition-all hover:border-[#B5A6CC] hover:shadow-md"
                    >
                      <svg className="h-7 w-7 text-[#4285F4] transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8v-2zm0-4h8v2H8v-2z"/>
                      </svg>
                      <span className="text-[13px] font-bold text-[#424242]">
                        Open Doc {docLinks.length > 1 ? i + 1 : ''}
                      </span>
                    </a>
                  ))}
                  {draftLinks.map((url, i) => (
                    <a
                      key={`draft-${i}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-3xl border-2 border-dashed border-[#B5A6CC]/40 bg-white px-6 py-4 shadow-sm transition-all hover:border-[#B5A6CC] hover:shadow-md"
                    >
                      <svg className="h-7 w-7 text-[#EA4335] transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                      </svg>
                      <span className="text-[13px] font-bold text-[#424242]">
                        Gmail Draft {draftLinks.length > 1 ? i + 1 : ''}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="mx-auto w-full max-w-[800px] flex-shrink-0">
              <div className="mb-10 flex w-full flex-col items-center xl:mb-12">
                <div className="mb-6 font-sans text-[48px] font-extrabold leading-none tracking-tight text-[#788294] xl:text-[64px]">
                  {formatTime(timeRemaining)}
                </div>

                {/* Subtask progress bar */}
                <div className="relative mb-3 h-3 w-full overflow-hidden rounded-full bg-[#F0F1F3]">
                  <div
                    className="absolute bottom-0 left-0 top-0 rounded-full bg-[#B5A6CC] transition-all duration-500 ease-out"
                    style={{ width: `${subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[11px] font-bold text-[#a1a1a1]">
                  {completedCount} / {subtasks.length} subtasks
                </p>
              </div>

              <div className="mx-auto grid w-full max-w-[600px] grid-cols-2 gap-6 xl:gap-8">
                <button
                  onClick={isTimerRunning ? handlePause : handleResume}
                  className="rounded-3xl border-b-4 border-[#deba5b] bg-[#EED077] py-5 text-[18px] font-extrabold tracking-wide text-white shadow-[0_4px_14px_0_rgba(238,208,119,0.39)] transition-all duration-300 hover:bg-[#deba5b] active:scale-[0.98] xl:py-7 xl:text-[22px]"
                >
                  {isTimerRunning ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={handleDone}
                  disabled={isCompletingSubtask || allDone}
                  className="rounded-3xl border-b-4 border-[#78957e] bg-[#87A48D] py-5 text-[18px] font-extrabold tracking-wide text-white shadow-[0_4px_14px_0_rgba(135,164,141,0.39)] transition-transform hover:bg-[#78957e] active:scale-[0.98] disabled:opacity-50 xl:py-7 xl:text-[22px]"
                >
                  {allDone ? '✓ All Done' : isCompletingSubtask ? '...' : 'Done'}
                </button>
              </div>
            </div>
          </div>

          <SideRail
            collapsed={isRightCollapsed}
            label="Subtasks"
            onClick={() => setIsRightCollapsed(!isRightCollapsed)}
            side="right"
          >
            <SubtasksChecklist
              subtasks={subtasks}
              activeIndex={activeSubtaskIndex}
              onToggle={toggleSubtask}
            />
          </SideRail>
        </section>
      </div>
    </main>
  );
}

function SideRail({
  children,
  collapsed,
  label,
  onClick,
  side,
}: {
  children: React.ReactNode;
  collapsed: boolean;
  label: string;
  onClick: () => void;
  side: 'left' | 'right';
}) {
  return (
    <div
      className={`relative z-10 flex h-full flex-shrink-0 flex-col transition-all duration-500 ease-in-out ${
        collapsed ? 'w-14 items-center' : 'w-[260px] xl:w-[300px]'
      }`}
    >
      <button
        onClick={onClick}
        className={`mb-6 flex flex-shrink-0 items-center transition-all ${
          collapsed
            ? 'mx-auto h-[180px] w-12 justify-center rounded-full border-2 border-gray-100 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:bg-gray-50 hover:shadow-md'
            : 'w-full justify-between px-1 text-[11px] font-bold text-[#6d6d6d] hover:text-black'
        }`}
        title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
      >
        {collapsed ? (
          <span
            className={`origin-center whitespace-nowrap text-[12px] font-extrabold uppercase tracking-widest text-[#788294] ${
              side === 'left' ? '-rotate-90' : 'rotate-90'
            }`}
          >
            {label}
          </span>
        ) : (
          <>
            <span className="text-[13px] font-extrabold uppercase tracking-widest text-[#828b9a]">
              {label}
            </span>
            <span>Collapse</span>
          </>
        )}
      </button>

      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden animate-in fade-in duration-500">
          {children}
        </div>
      )}
    </div>
  );
}

function SubtasksChecklist({
  onToggle,
  subtasks,
  activeIndex,
}: {
  onToggle: (id: string) => void;
  subtasks: SubtaskItem[];
  activeIndex: number;
}) {
  const completedCount = subtasks.filter((subtask) => subtask.checked).length;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 rounded-3xl bg-[#F8F6F1] px-5 py-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#8d8d8d]">
          Subtasks
        </p>
        <p className="mt-2 text-[13px] font-bold leading-relaxed text-[#6d6d6d]">
          {completedCount} of {subtasks.length} checked off
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
        {subtasks.map((subtask, index) => (
          <label
            key={subtask.id}
            className={`group flex cursor-pointer items-start gap-3 rounded-3xl border px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all hover:border-gray-200 hover:shadow-md ${
              subtask.checked
                ? 'border-[#DCEAE4] bg-[#F1F8F5] text-[#7b8d86]'
                : index === activeIndex
                  ? 'border-[#B5A6CC] bg-white text-[#424242] shadow-[0_4px_16px_rgba(181,166,204,0.2)]'
                  : 'border-gray-100 bg-white text-[#424242]'
            }`}
          >
            <input
              type="checkbox"
              checked={subtask.checked}
              onChange={() => onToggle(subtask.id)}
              className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-md border-gray-300 accent-[#67B59F]"
            />
            <div className="flex-1">
              <span
                className={`text-[13px] font-bold leading-relaxed ${
                  subtask.checked ? 'line-through' : ''
                }`}
              >
                {subtask.text}
              </span>
              {index === activeIndex && !subtask.checked && (
                <span className="ml-2 inline-block rounded-full bg-[#B5A6CC]/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[#8a78a8]">
                  Current
                </span>
              )}
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
