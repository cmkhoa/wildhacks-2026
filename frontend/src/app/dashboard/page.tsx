'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [taskInput, setTaskInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gemsEarned, setGemsEarned] = useState(4);
  const username = "Haiha";

  // Collapse State
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  // Task State
  const [activeTask, setActiveTask] = useState<{ title: string, reward_value: number, block_minutes: number } | null>({
    title: "Outline history essay",
    reward_value: 10,
    block_minutes: 40
  });

  const [queuedTasks, setQueuedTasks] = useState([
    { title: "Reply to two important emails", reward_value: 5, block_minutes: 20 },
    { title: "Review chapter 4", reward_value: 15, block_minutes: 30 }
  ]);

  const [completedTasks, setCompletedTasks] = useState([
    { title: "Open planner", reward_value: 5, block_minutes: 10 }
  ]);

  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', text: 'Keep the next move small enough to start.' }
  ]);

  // Timer State
  const DEFAULT_TIMER = 25 * 60;
  const [timeRemaining, setTimeRemaining] = useState(40 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
    } else if (timeRemaining === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeRemaining]);

  useEffect(() => {
    if (activeTask) {
      const totalSeconds = activeTask.block_minutes * 60;
      const elapsed = totalSeconds - timeRemaining;
      const percent = Math.min(100, Math.max(0, (elapsed / totalSeconds) * 100));
      setProgressPercent(percent);
    } else {
      setProgressPercent(0);
    }
  }, [timeRemaining, activeTask]);

  const handleStart = () => setIsTimerRunning(true);
  const handlePause = () => setIsTimerRunning(false);

  const handleDone = () => {
    setIsTimerRunning(false);
    if (activeTask) {
      setGemsEarned(p => p + activeTask.reward_value);
      setCompletedTasks(prev => [activeTask, ...prev]);
    }

    if (queuedTasks.length > 0) {
      const nextTask = queuedTasks[0];
      setActiveTask(nextTask);
      setQueuedTasks(prev => prev.slice(1));
      setTimeRemaining(nextTask.block_minutes * 60);
    } else {
      setActiveTask(null);
      setTimeRemaining(DEFAULT_TIMER);
    }
  };

  const executeSchedule = async (inputStr: string) => {
    if (!inputStr.trim()) return;
    setIsLoading(true);
    setChatHistory(p => [...p, { role: 'user', text: inputStr }]);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const res = await fetch(`${backendUrl}/api/tasks/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_input: inputStr })
      });
      const data = await res.json();

      if (data.status === 'success') {
        let tasks = data.parsed_plan?.subtasks || [];
        if (tasks.length > 0) {
          const formattedTasks = tasks.map((st: any) => ({
            title: st.title,
            reward_value: st.reward_value || 10,
            block_minutes: Math.max(5, Math.floor((data.parsed_plan.schedule_minutes || 60) / tasks.length))
          }));

          setChatHistory(p => [...p, { role: 'assistant', text: `Got it! I scheduled "${data.parsed_plan.title || 'that'}". Added ${tasks.length} steps to your queue.` }]);

          if (!activeTask) {
            setActiveTask(formattedTasks[0]);
            setQueuedTasks(p => [...p, ...formattedTasks.slice(1)]);
            setTimeRemaining(formattedTasks[0].block_minutes * 60);
          } else {
            setQueuedTasks(p => [...p, ...formattedTasks]);
          }
        } else {
          setChatHistory(p => [...p, { role: 'assistant', text: "I organized that, but couldn't pull out specific steps." }]);
        }
      } else {
        setChatHistory(p => [...p, { role: 'assistant', text: data.detail || "Error scheduling tasks." }]);
      }
    } catch (e) {
      console.error("Failed to schedule", e);
      setChatHistory(p => [...p, { role: 'assistant', text: "Could not connect to backend." }]);
    }
    setIsLoading(false);
    setTaskInput('');
  };

  const handleQuickAction = (actionText: string) => {
    executeSchedule(actionText);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <main className="h-screen w-full bg-[#FDFCFB] text-[#424242] font-sans selection:bg-teal-200 overflow-hidden transition-all">

      <div className="max-w-[1600px] w-full mx-auto px-6 py-6 flex flex-col h-full">

        {/* TOP HEADER */}
        <header className="mb-6 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-[28px] font-extrabold text-[#303030] tracking-tight">Welcome, {username}</h1>
          </div>
          <div className="flex items-center space-x-2 bg-[#FDF3DE] px-5 py-2.5 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.02)] cursor-pointer hover:shadow-md transition-shadow">
            <span className="text-[#E6B95C] text-xl leading-none relative bottom-[1px]">♦</span>
            <span className="text-sm font-bold text-[#7a6a45]">Today's Gems: {gemsEarned}</span>
          </div>
        </header>

        {/* 3 COLUMN FLEX LAYOUT */}
        <section className="flex gap-6 xl:gap-8 flex-1 min-h-0 pb-4 items-stretch">

          {/* COLUMN 1: LEFT (PLANNING CHAT) */}
          <div className={`${isLeftCollapsed ? 'w-14 items-center' : 'w-[260px] xl:w-[300px]'} flex flex-col flex-shrink-0 h-full transition-all duration-500 ease-in-out relative z-10`}>
            {/* Header / Collapse Toggle */}
            <div className={`flex items-center mb-6 flex-shrink-0 ${isLeftCollapsed ? 'justify-center mx-auto' : 'justify-between px-1 w-full'}`}>
              {!isLeftCollapsed && <h2 className="text-[13px] font-extrabold text-[#828b9a] uppercase tracking-widest">Planning chat</h2>}
              <button
                onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
                className={`transition-all ${isLeftCollapsed ? 'bg-white border-2 border-gray-100 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-full h-[180px] w-12 flex items-center justify-center hover:bg-gray-50 hover:shadow-md' : 'text-[11px] font-bold text-[#6d6d6d] hover:text-black'}`}
                title={isLeftCollapsed ? "Expand Chat" : "Collapse Chat"}
              >
                {isLeftCollapsed ? <span className="-rotate-90 whitespace-nowrap text-[12px] font-extrabold text-[#788294] tracking-widest uppercase origin-center">PLANNING CHAT</span> : 'Collapse'}
              </button>
            </div>

            {/* Expanded Content */}
            {!isLeftCollapsed && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-500">
                {/* Quick Actions & Chat History */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-4 scrollbar-hide">
                  <button onClick={() => handleQuickAction("I'm stuck")} className="w-full text-left bg-white border border-gray-100 text-[13px] font-bold text-[#424242] px-5 py-4 rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-gray-200 transition-all">I'm stuck</button>
                  <button onClick={() => handleQuickAction("Break this down")} className="w-full text-left bg-white border border-gray-100 text-[13px] font-bold text-[#424242] px-5 py-4 rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-gray-200 transition-all">Break this down</button>
                  <button onClick={() => handleQuickAction("5 minute version")} className="w-full text-left bg-white border border-gray-100 text-[13px] font-bold text-[#424242] px-5 py-4 rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-gray-200 transition-all">5 minute version</button>
                  <button onClick={() => handleQuickAction("Motivate me")} className="w-full text-left bg-white border border-gray-100 text-[13px] font-bold text-[#424242] px-5 py-4 rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-gray-200 transition-all">Motivate me</button>

                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`w-full text-left bg-white border border-gray-200 text-[13px] px-5 py-5 rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-8 leading-relaxed ${msg.role === 'user' ? 'text-[#a1a1a1]' : 'text-[#424242] font-bold ring-1 ring-gray-100'}`}>
                      {msg.text}
                    </div>
                  ))}
                </div>

                {/* Input Area */}
                <div className="relative flex items-center space-x-3 mt-4 flex-shrink-0">
                  <input
                    type="text"
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && executeSchedule(taskInput)}
                    placeholder="Ask for help..."
                    className="flex-1 bg-white border border-gray-200 text-[#424242] placeholder-[#a1a1a1] px-5 py-4 rounded-3xl focus:outline-none focus:ring-2 focus:ring-[#67B59F]/40 focus:border-[#67B59F] text-[13px] font-bold shadow-sm transition-all hover:shadow-md"
                  />
                  <button
                    onClick={() => executeSchedule(taskInput)}
                    disabled={isLoading || !taskInput.trim()}
                    className="bg-[#67B59F] hover:bg-[#5aa38e] text-white p-4 rounded-full flex items-center justify-center transition-colors shadow-sm disabled:opacity-50 flex-shrink-0"
                    aria-label="Send"
                  >
                    {isLoading ?
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      :
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 -rotate-45 relative left-px bottom-px">
                        <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                      </svg>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 2: CENTER (THE DO ZONE) */}
          <div className="flex-1 bg-white rounded-[48px] p-10 xl:p-14 shadow-[0_10px_40px_rgba(0,0,0,0.02)] flex flex-col relative h-full transition-all duration-500 ease-in-out">
            <div className="flex items-center space-x-4 flex-shrink-0">
              <span className="text-[11px] font-bold text-[#8d8d8d] uppercase tracking-widest">Focus Now</span>
              {isTimerRunning && (
                <span className="bg-[#E7F3ED] text-[#6cb593] text-[10px] font-bold px-3 py-1.5 rounded-full tracking-wide animate-pulse shadow-sm">In motion</span>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-center items-center">
              <h1 className="text-[48px] md:text-[64px] xl:text-[88px] font-extrabold tracking-tight text-[#2B2B2B] leading-[1.05] text-center max-w-[95%] w-full font-sans -mt-8">
                {activeTask ? activeTask.title : "Ready for a new block"}
              </h1>
            </div>

            {/* Timer & Buttons Area at Bottom */}
            <div className="w-full flex-shrink-0 max-w-[800px] mx-auto">
              <div className="flex flex-col items-center w-full mb-10 xl:mb-12">
                <div className="text-[48px] xl:text-[64px] font-extrabold text-[#788294] font-sans tracking-tight leading-none mb-6">
                  {formatTime(timeRemaining)}
                </div>

                <div className="w-full bg-[#F4F5F7] rounded-full h-5 overflow-hidden relative shadow-inner">
                  <div className="absolute top-0 left-0 bottom-0 bg-[#87A48D] rounded-full transition-all duration-1000 ease-linear shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-6 xl:gap-8 w-full max-w-[600px] mx-auto">
                <button
                  onClick={() => isTimerRunning ? handlePause() : handleStart()}
                  disabled={!activeTask && !isTimerRunning}
                  className={`${isTimerRunning ? 'bg-[#EED077] hover:bg-[#deba5b] border-[#deba5b] shadow-[0_4px_14px_0_rgba(238,208,119,0.39)]' : 'bg-[#B5A6CC] hover:bg-[#A696BF] border-[#A696BF] shadow-[0_4px_14px_0_rgba(181,166,204,0.39)]'} disabled:opacity-50 text-white py-5 xl:py-7 rounded-3xl font-extrabold text-[18px] xl:text-[22px] transition-all duration-300 active:scale-[0.98] tracking-wide border-b-4`}
                >
                  {isTimerRunning ? "Pause" : "Start"}
                </button>
                <button onClick={handleDone} className="bg-[#87A48D] hover:bg-[#78957e] disabled:opacity-50 text-white py-5 xl:py-7 rounded-3xl font-extrabold text-[18px] xl:text-[22px] transition-transform active:scale-[0.98] shadow-[0_4px_14px_0_rgba(135,164,141,0.39)] tracking-wide border-b-4 border-[#78957e]">
                  {activeTask ? "Done" : "Skip Block"}
                </button>
              </div>
            </div>
          </div>

          {/* COLUMN 3: RIGHT (UP NEXT QUEUE) */}
          <div className={`${isRightCollapsed ? 'w-14 items-center' : 'w-[260px] xl:w-[300px]'} flex flex-col flex-shrink-0 h-full transition-all duration-500 ease-in-out relative z-10`}>
            {/* Header / Collapse Toggle */}
            <div className={`flex items-center mb-6 flex-shrink-0 ${isRightCollapsed ? 'justify-center mx-auto' : 'justify-between px-1 w-full'}`}>
              {!isRightCollapsed && <h2 className="text-[13px] font-extrabold text-[#828b9a] uppercase tracking-widest">Up next</h2>}
              <button
                onClick={() => setIsRightCollapsed(!isRightCollapsed)}
                className={`transition-all ${isRightCollapsed ? 'bg-white border-2 border-gray-100 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-full h-[140px] w-12 flex items-center justify-center hover:bg-gray-50 hover:shadow-md' : 'text-[11px] font-bold text-[#6d6d6d] hover:text-black'}`}
                title={isRightCollapsed ? "Expand Queue" : "Collapse Queue"}
              >
                {isRightCollapsed ? <span className="rotate-90 whitespace-nowrap text-[12px] font-extrabold text-[#788294] tracking-widest uppercase origin-center">UP NEXT</span> : 'Collapse'}
              </button>
            </div>

            {/* Expanded Content */}
            {!isRightCollapsed && (
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-4 scrollbar-hide animate-in fade-in duration-500">
                {/* Completed Tasks */}
                {completedTasks.slice(0, 3).map((ct, i) => (
                  <div key={`done-${i}`} className="bg-white border border-gray-100 rounded-3xl px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] opacity-70">
                    <div className="text-[9px] font-extrabold text-[#A8D3BE] uppercase tracking-widest mb-1.5 flex justify-between">
                      <span>Done</span>
                      <span>+{ct.reward_value} ♦</span>
                    </div>
                    <h3 className="font-semibold text-[#a1a1a1] line-through text-[13px]">{ct.title}</h3>
                  </div>
                ))}

                {/* Queued Tasks */}
                {queuedTasks.map((qt, i) => (
                  <div key={`queue-${i}`} className="bg-white border border-gray-100 rounded-3xl px-5 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-gray-200 transition-all cursor-default">
                    <div className="text-[9px] font-extrabold text-[#d1d1d1] uppercase tracking-widest mb-1.5">Planned ({qt.block_minutes}m)</div>
                    <h3 className="font-bold text-[#424242] text-[13px] leading-snug">{qt.title}</h3>
                  </div>
                ))}
              </div>
            )}
          </div>

        </section>
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
      className={`group relative order-3 flex min-h-[72px] items-center justify-center rounded-[8px] border border-[#cfe0dc] bg-white/75 px-4 py-3 text-[#276f67] shadow-[0_14px_34px_rgba(35,74,67,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#2f8f83] hover:bg-white hover:shadow-[0_18px_42px_rgba(35,74,67,0.12)] active:scale-[0.98] lg:order-none lg:min-h-[calc(100vh-170px)] lg:px-2 ${side === "left" ? "lg:col-start-1" : "lg:col-start-3"
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
        className={`pointer-events-none absolute top-4 hidden rounded-[8px] bg-[#203b37] px-3 py-2 text-sm font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 lg:block ${side === "left" ? "left-14" : "right-14"
          }`}
      >
        {hint}
      </span>
    </button>
  );
}
