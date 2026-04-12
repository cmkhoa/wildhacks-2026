'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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

type SubtaskItem = {
  id: string;
  text: string;
  checked: boolean;
};

type FocusPageProps = {
  initialTask: TaskBlock;
};

export function FocusPage({ initialTask }: FocusPageProps) {
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(true);
  const [isRightCollapsed, setIsRightCollapsed] = useState(true);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(
    initialTask.block_minutes * 60,
  );
  const [chatDraft, setChatDraft] = useState('');

  const router = useRouter();

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'You are in focus mode. Keep only this block visible.' },
  ]);

  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(
    initialTask.steps && initialTask.steps.length > 0 
      ? initialTask.steps.map((st, i) => ({ id: `step-${i}`, text: st, checked: false }))
      : [
          { id: 'open-doc', text: 'Open the essay document', checked: false },
          { id: 'skim-notes', text: 'Skim notes and highlight three useful points', checked: false },
          { id: 'write-outline', text: 'Write the rough intro and three section bullets', checked: false },
          { id: 'mark-question', text: 'Mark one confusing part to ask about later', checked: false },
        ]
  );

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

  const handlePause = () => setIsTimerRunning(false);

  const handleDone = async () => {
    setIsTimerRunning(false);
    
    if (initialTask.id) {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
        let email: string | null = null;
        if (typeof window !== 'undefined') {
          email = localStorage.getItem('userEmail');
        }
        
        await fetch(`${backendUrl}/api/tasks/subtask/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            subtask_id: initialTask.id,
            email: email || undefined
          })
        });
      } catch (e) {
        console.error(e);
      }
    }
    
    router.push('/dashboard');
  };

  const toggleSubtask = (id: string) => {
    setSubtasks((previous) =>
      previous.map((subtask) =>
        subtask.id === id
          ? { ...subtask, checked: !subtask.checked }
          : subtask,
      ),
    );
  };

  const handleSendChat = () => {
    const trimmed = chatDraft.trim();
    if (!trimmed) return;

    setChatHistory((previous) => [
      ...previous,
      { role: 'user', text: trimmed },
      {
        role: 'assistant',
        text: 'Got it. Stay with the current block and make the next step tiny.',
      },
    ]);
    setChatDraft('');
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secondsLeft = seconds % 60;
    return `${minutes}:${secondsLeft.toString().padStart(2, '0')}`;
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
              One block. No clutter.
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
                  disabled={!chatDraft.trim()}
                  className="flex flex-shrink-0 items-center justify-center rounded-full bg-[#67B59F] px-5 py-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#5aa38e] disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </SideRail>

          <div className="flex h-full flex-1 flex-col rounded-[48px] bg-white p-10 shadow-[0_10px_40px_rgba(0,0,0,0.02)] transition-all duration-500 ease-in-out xl:p-14">
            <div className="flex flex-shrink-0 items-center space-x-4">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#8d8d8d]">
                Focus Now
              </span>
              {isTimerRunning && (
                <span className="animate-pulse rounded-full bg-[#E7F3ED] px-3 py-1.5 text-[10px] font-bold tracking-wide text-[#6cb593] shadow-sm">
                  In motion
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col items-center justify-center">
              <h1 className="-mt-8 w-full max-w-[95%] text-center font-sans text-[48px] font-extrabold leading-[1.05] tracking-tight text-[#2B2B2B] md:text-[64px] xl:text-[88px]">
                {initialTask.title}
              </h1>
            </div>

            <div className="mx-auto w-full max-w-[800px] flex-shrink-0">
              <div className="mb-10 flex w-full flex-col items-center xl:mb-12">
                <div className="mb-6 font-sans text-[48px] font-extrabold leading-none tracking-tight text-[#788294] xl:text-[64px]">
                  {formatTime(timeRemaining)}
                </div>

                <div className="relative h-5 w-full overflow-hidden rounded-full bg-[#F4F5F7] shadow-inner">
                  <div
                    className="absolute bottom-0 left-0 top-0 rounded-full bg-[#87A48D] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)] transition-all duration-1000 ease-linear"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="mx-auto grid w-full max-w-[600px] grid-cols-2 gap-6 xl:gap-8">
                <button
                  onClick={handlePause}
                  disabled={!isTimerRunning}
                  className="rounded-3xl border-b-4 border-[#deba5b] bg-[#EED077] py-5 text-[18px] font-extrabold tracking-wide text-white shadow-[0_4px_14px_0_rgba(238,208,119,0.39)] transition-all duration-300 hover:bg-[#deba5b] active:scale-[0.98] disabled:opacity-50 xl:py-7 xl:text-[22px]"
                >
                  Pause
                </button>
                <button
                  onClick={handleDone}
                  className="rounded-3xl border-b-4 border-[#78957e] bg-[#87A48D] py-5 text-[18px] font-extrabold tracking-wide text-white shadow-[0_4px_14px_0_rgba(135,164,141,0.39)] transition-transform hover:bg-[#78957e] active:scale-[0.98] xl:py-7 xl:text-[22px]"
                >
                  Done
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
            <SubtasksChecklist subtasks={subtasks} onToggle={toggleSubtask} />
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
}: {
  onToggle: (id: string) => void;
  subtasks: SubtaskItem[];
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
        {subtasks.map((subtask) => (
          <label
            key={subtask.id}
            className={`group flex cursor-pointer items-start gap-3 rounded-3xl border px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all hover:border-gray-200 hover:shadow-md ${
              subtask.checked
                ? 'border-[#DCEAE4] bg-[#F1F8F5] text-[#7b8d86]'
                : 'border-gray-100 bg-white text-[#424242]'
            }`}
          >
            <input
              type="checkbox"
              checked={subtask.checked}
              onChange={() => onToggle(subtask.id)}
              className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-md border-gray-300 accent-[#67B59F]"
            />
            <span
              className={`text-[13px] font-bold leading-relaxed ${
                subtask.checked ? 'line-through' : ''
              }`}
            >
              {subtask.text}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
