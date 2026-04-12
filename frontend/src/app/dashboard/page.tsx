'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

type SubtaskInfo = {
  id?: string;
  title: string;
  estimated_minutes: number;
  reward_value: number;
  steps?: string[];
  completed?: boolean;
};

type TaskBlock = {
  id?: string;
  title: string;
  reward_value: number;
  block_minutes: number;
  steps?: string[];
  subtasks?: SubtaskInfo[];
  docLinks?: string[];
  draftLinks?: string[];
};

type ChatMessage = {
  role: 'assistant' | 'user';
  text: string;
};

type ParsedSubtask = {
  title?: string;
  reward_value?: number;
  steps?: string[];
};

const deletedTaskIdsKey = (userEmail: string) => `unstuck.deletedTasks.${userEmail}`;

const readDeletedTaskIds = (userEmail: string) => {
  if (typeof window === 'undefined') return new Set<string>();

  try {
    const stored = localStorage.getItem(deletedTaskIdsKey(userEmail));
    return new Set<string>(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set<string>();
  }
};

const rememberDeletedTaskId = (userEmail: string, taskId: string) => {
  if (typeof window === 'undefined') return;

  const deletedIds = readDeletedTaskIds(userEmail);
  deletedIds.add(taskId);
  localStorage.setItem(deletedTaskIdsKey(userEmail), JSON.stringify([...deletedIds]));
};

export default function Home() {
  const [taskInput, setTaskInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [gemsEarned, setGemsEarned] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [previousStreak, setPreviousStreak] = useState(0);
  const [email, setEmail] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const username = email ? email.split('@')[0] : 'Haiha';
  const router = useRouter();

  const [activeTask, setActiveTask] = useState<TaskBlock | null>(null);
  const [queuedTasks, setQueuedTasks] = useState<TaskBlock[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskBlock[]>([]);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const fetchTasks = async (userEmail: string) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const res = await fetch(`${backendUrl}/api/tasks?email=${encodeURIComponent(userEmail)}`);
      const data = await res.json();

      if (data.tasks) {
        const allCompleted: TaskBlock[] = [];
        const allPending: TaskBlock[] = [];
        const deletedTaskIds = readDeletedTaskIds(userEmail);
        let gems = 0;

        data.tasks.forEach((task: any) => {
          if (task.id && deletedTaskIds.has(String(task.id))) {
            return;
          }

          const subtasks: SubtaskInfo[] = (task.subtasks || []).map((st: any) => ({
            id: st.id,
            title: st.title,
            estimated_minutes: st.estimated_minutes || 15,
            reward_value: st.reward_value || 10,
            steps: st.steps || [],
            completed: st.completed,
          }));

          const completedSubs = subtasks.filter(s => s.completed);
          const pendingSubs = subtasks.filter(s => !s.completed);
          const allSubsDone = subtasks.length > 0 && pendingSubs.length === 0;

          // Aggregate totals at the parent task level
          const totalMinutes = subtasks.reduce((sum, s) => sum + s.estimated_minutes, 0) || task.estimated_minutes || 25;
          const totalReward = subtasks.reduce((sum, s) => sum + s.reward_value, 0) || 10;

          const tBlock: TaskBlock = {
            id: task.id,
            title: task.title,
            reward_value: totalReward,
            block_minutes: totalMinutes,
            // Pass subtask titles as steps so focus page can show them
            steps: subtasks.map(s => s.title),
            subtasks,
            docLinks: task.drive_doc_link ? [task.drive_doc_link] : [],
            draftLinks: task.gmail_draft_link ? [task.gmail_draft_link] : [],
          };

          if (allSubsDone) {
            allCompleted.push(tBlock);
            gems += totalReward;
          } else {
            allPending.push(tBlock);
            gems += completedSubs.reduce((sum, s) => sum + s.reward_value, 0);
          }
        });

        setCompletedTasks(allCompleted);
        setGemsEarned(gems);

        if (allPending.length > 0) {
          setActiveTask(allPending[0]);
          setQueuedTasks(allPending.slice(1));
        } else {
          setActiveTask(null);
          setQueuedTasks([]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProfile = async (userEmail: string) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const res = await fetch(`${backendUrl}/auth/me?email=${encodeURIComponent(userEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setGemsEarned(data.reward_points ?? 0);
        setCurrentStreak(data.current_streak ?? 0);
        setPreviousStreak(data.previous_streak ?? 0);
      }
    } catch (e) {
      console.error('Failed to fetch profile', e);
    }
  };

  const handleRestoreStreak = async () => {
    if (!email) return;
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const res = await fetch(`${backendUrl}/api/tasks/streaks/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setCurrentStreak(data.current_streak);
        setGemsEarned(data.reward_points);
        setPreviousStreak(0);
      } else {
        alert(data.message || 'Failed to restore streak');
      }
    } catch (e) {
      console.error(e);
      alert('Error restoring streak');
    }
  };

  useEffect(() => {
    const urlEmail = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('email') : null;
    let finalEmail = urlEmail;
    if (urlEmail) {
      localStorage.setItem('userEmail', urlEmail);
    } else {
      finalEmail = localStorage.getItem('userEmail');
    }

    if (finalEmail) {
      setEmail(finalEmail);
      fetchProfile(finalEmail);
      fetchTasks(finalEmail);
    }
  }, []);

  const dailyTasks = activeTask ? [activeTask, ...queuedTasks] : queuedTasks;
  const selectedTask = dailyTasks[selectedTaskIndex] ?? dailyTasks[0] ?? null;

  const deleteTaskAtIndex = async (taskIndex: number) => {
    const taskToDelete = dailyTasks[taskIndex];
    const remainingTasks = dailyTasks.filter((_, index) => index !== taskIndex);

    setActiveTask(remainingTasks[0] ?? null);
    setQueuedTasks(remainingTasks.slice(1));
    setSelectedTaskIndex((currentIndex) => {
      if (remainingTasks.length === 0) return 0;
      if (taskIndex < currentIndex) return currentIndex - 1;
      if (taskIndex === currentIndex) {
        return Math.min(currentIndex, remainingTasks.length - 1);
      }
      return Math.min(currentIndex, remainingTasks.length - 1);
    });

    if (!taskToDelete?.id || !email) return;

    rememberDeletedTaskId(email, taskToDelete.id);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const response = await fetch(
        `${backendUrl}/api/tasks/${encodeURIComponent(taskToDelete.id)}?email=${encodeURIComponent(email)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Delete request failed');
      }
    } catch (error) {
      console.error('Failed to delete task from backend', error);
      setChatHistory((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: 'I hid that task here, but I could not delete it from the backend yet. Try refreshing the backend and deleting again if it comes back.',
        },
      ]);
    }
  };

  const enterFocusMode = () => {
    if (!selectedTask) return;

    const params = new URLSearchParams({
      title: selectedTask.title,
      reward: String(selectedTask.reward_value),
      minutes: String(selectedTask.block_minutes),
    });

    if (selectedTask.id) params.append('id', selectedTask.id);

    // Pass full subtask data (with DB IDs) for sequential completion
    if (selectedTask.subtasks && selectedTask.subtasks.length > 0) {
      params.append('subtasks', JSON.stringify(selectedTask.subtasks));
    } else if (selectedTask.steps && selectedTask.steps.length > 0) {
      params.append('steps', JSON.stringify(selectedTask.steps));
    }

    // Pass doc links for quick access in focus mode
    if (selectedTask.docLinks && selectedTask.docLinks.length > 0) {
      params.append('docLinks', JSON.stringify(selectedTask.docLinks));
    }

    if (selectedTask.draftLinks && selectedTask.draftLinks.length > 0) {
      params.append('draftLinks', JSON.stringify(selectedTask.draftLinks));
    }

    router.push(`/focus?${params.toString()}`);
  };

  const confirmLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userEmail');
      sessionStorage.clear();
      document.cookie.split(';').forEach((cookie) => {
        const name = cookie.split('=')[0]?.trim();
        if (name) {
          document.cookie = `${name}=; Max-Age=0; path=/`;
        }
      });
    }

    setEmail(null);
    setTaskInput('');
    setSelectedTaskIndex(0);
    setGemsEarned(0);
    setCurrentStreak(0);
    setPreviousStreak(0);
    setActiveTask(null);
    setQueuedTasks([]);
    setCompletedTasks([]);
    setChatHistory([]);
    setShowLogoutConfirm(false);

    router.replace('/login');
  };

  const executeSchedule = async (inputStr: string) => {
    if (!inputStr.trim()) return;

    setIsLoading(true);
    const userMessage: ChatMessage = { role: 'user', text: inputStr };
    const nextHistory: ChatMessage[] = [...chatHistory, userMessage];
    setChatHistory(nextHistory);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const chatRes = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputStr,
          email: email || 'anonymous',
          chat_history: chatHistory,
        }),
      });
      const chatData = await chatRes.json();

      if (!chatRes.ok || chatData.status !== 'success') {
        throw new Error(chatData.detail || 'Chat request failed');
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        text: chatData.reply || 'I’m here. What would help most right now?',
      };
      setChatHistory((previous) => [...previous, assistantMessage]);

      if (!chatData.should_create_task) {
        setIsLoading(false);
        setTaskInput('');
        return;
      }

      const res = await fetch(`${backendUrl}/api/tasks/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_input: inputStr,
          email: email || 'anonymous',
          chat_history: nextHistory
        }),
      });
      const data = await res.json();

      if (data.status === 'success') {
        const tasks = data.parsed_plan?.subtasks || [];

        if (tasks.length > 0) {
          setChatHistory((previous) => [
            ...previous,
            {
              role: 'assistant',
              text: `I also added ${tasks.length} small step${tasks.length === 1 ? '' : 's'} to your task queue.`,
            },
          ]);

          // Try to refresh from backend DB to get persisted IDs
          let fetchedFromDb = false;
          if (email) {
            await fetchTasks(email);
            // fetchTasks sets activeTask/queuedTasks — check if it found anything
            // We can't read state synchronously here, so we use the response data as fallback below
          }

          // Populate task list directly from the response in case DB is unavailable
          // Group all subtasks under one parent task
          const parentTitle = data.parsed_plan?.title || inputStr;
          const subtaskInfos: SubtaskInfo[] = tasks.map((st: any, i: number) => ({
            id: st.id || undefined,
            title: st.title || `Step ${i + 1}`,
            estimated_minutes: st.adjusted_minutes || st.estimated_minutes || 15,
            reward_value: st.reward_value || Math.max(5, Math.floor((st.estimated_minutes || 15) / 3)),
            steps: st.steps || [],
          }));

          const parentTask: TaskBlock = {
            id: data.task_id || undefined,
            title: parentTitle,
            reward_value: subtaskInfos.reduce((sum, s) => sum + s.reward_value, 0),
            block_minutes: subtaskInfos.reduce((sum, s) => sum + s.estimated_minutes, 0),
            steps: subtaskInfos.map(s => s.title),
            subtasks: subtaskInfos,
            docLinks: data.created_docs || [],
            draftLinks: data.created_drafts || [],
          };

          // Set task from response (this ensures it shows even without DB)
          setActiveTask((current) => current ?? parentTask);
          setQueuedTasks((current) => current.length > 0 ? current : []);
        } else {
          setChatHistory((previous) => [
            ...previous,
            { role: 'assistant', text: "I organized that, but couldn't pull out specific steps." },
          ]);
        }
      } else if (data.status === 'needs_clarification') {
        // LLM needs more info before creating the task
        setChatHistory((previous) => [
          ...previous,
          { role: 'assistant', text: data.question || 'Can you tell me more about this task?' },
        ]);
      } else {
        setChatHistory((previous) => [
          ...previous,
          { role: 'assistant', text: data.detail || 'Error scheduling tasks.' },
        ]);
      }
    } catch (error) {
      console.error('Failed to schedule', error);
      setChatHistory((previous) => [
        ...previous,
        { role: 'assistant', text: 'Could not connect to backend.' },
      ]);
    }

    setIsLoading(false);
    setTaskInput('');
  };

  return (
    <main className="h-screen w-full overflow-hidden bg-[#FDFCFB] font-sans text-[#424242] selection:bg-teal-200">
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-6 py-6">
        <header className="mb-6 flex flex-shrink-0 items-center justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold tracking-tight text-[#303030]">
              Welcome, {username}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {currentStreak > 0 && (
              <div className="flex cursor-default items-center space-x-1 rounded-full bg-[#FFEAE5] px-4 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-md">
                <span className="text-xl leading-none">🔥</span>
                <span className="text-sm font-bold text-[#E55A3D]">{currentStreak}</span>
              </div>
            )}
            
            <Link 
              href="/badges"
              className="flex cursor-pointer items-center space-x-2 rounded-full bg-[#FDF3DE] px-5 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-md"
            >
              <span className="relative bottom-[1px] text-xl leading-none text-[#E6B95C]">
                &#9830;
              </span>
              <span className="text-sm font-bold text-[#7a6a45]">{gemsEarned}</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="rounded-full border border-[#E8ECEA] bg-white px-5 py-2.5 text-sm font-bold text-[#6f7774] shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all hover:border-[#F1D7D2] hover:bg-[#FFF7F5] hover:text-[#C05B4B] hover:shadow-md active:scale-[0.98]"
            >
              Logout
            </button>
          </div>
        </header>

        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#203B37]/25 px-4 backdrop-blur-sm">
            <div className="w-full max-w-[420px] rounded-[36px] border border-white/80 bg-white p-7 text-center shadow-[0_24px_80px_rgba(32,59,55,0.16)]">
              <p className="text-[12px] font-extrabold uppercase tracking-widest text-[#828b9a]">
                Confirm logout
              </p>
              <h2 className="mt-3 text-[28px] font-extrabold tracking-tight text-[#303030]">
                Are you sure you want to log out?
              </h2>
              <div className="mt-7 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="rounded-[24px] border border-[#E8ECEA] bg-white px-5 py-4 text-sm font-extrabold text-[#6f7774] shadow-sm transition-all hover:bg-[#F8F6F1] active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmLogout}
                  className="rounded-[24px] bg-[#67B59F] px-5 py-4 text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(103,181,159,0.25)] transition-all hover:bg-[#5aa38e] active:scale-[0.98]"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}

        {previousStreak > 0 && currentStreak === 0 && (
          <div className="mb-6 flex items-center justify-between rounded-[24px] bg-[#FFEAE5] p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow-sm">💔</div>
              <div>
                <h3 className="text-sm font-extrabold text-[#E55A3D]">Streak Broken!</h3>
                <p className="text-xs font-semibold text-[#A6412D]">Your {previousStreak}-task streak was lost.</p>
              </div>
            </div>
            <button 
              onClick={handleRestoreStreak}
              className="rounded-full bg-[#E55A3D] px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-[#D44B30]"
            >
              Restore with Gems
            </button>
          </div>
        )}

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-6 pb-4 lg:grid-cols-2 xl:gap-8">
          <PlanningPanel
            chatHistory={chatHistory}
            executeSchedule={executeSchedule}
            isLoading={isLoading}
            setTaskInput={setTaskInput}
            taskInput={taskInput}
          />
          <TaskStartPanel
            completedTasks={completedTasks}
            deleteTaskAtIndex={deleteTaskAtIndex}
            enterFocusMode={enterFocusMode}
            selectedTaskIndex={selectedTaskIndex}
            setSelectedTaskIndex={setSelectedTaskIndex}
            tasks={dailyTasks}
          />
        </section>
      </div>
    </main>
  );
}

function PlanningPanel({
  chatHistory,
  executeSchedule,
  isLoading,
  setTaskInput,
  taskInput,
}: {
  chatHistory: ChatMessage[];
  executeSchedule: (input: string) => void;
  isLoading: boolean;
  setTaskInput: (value: string) => void;
  taskInput: string;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-[40px] bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.035)]">
      <div className="mb-6">
        <p className="text-[13px] font-extrabold uppercase tracking-widest text-[#828b9a]">
          Planning chat
        </p>
        <h2 className="mt-3 text-[34px] font-extrabold tracking-tight text-[#303030]">
          Any tasks on your mind?
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {chatHistory.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={`rounded-3xl border px-5 py-5 text-[13px] leading-relaxed shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${msg.role === 'user'
              ? 'ml-10 border-[#DCEAE4] bg-[#F1F8F5] text-[#5f766d]'
              : 'mr-10 border-gray-100 bg-white font-bold text-[#424242]'
              }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      <div className="relative mt-5 flex flex-shrink-0 items-center space-x-3">
        <input
          type="text"
          value={taskInput}
          onChange={(event) => setTaskInput(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && executeSchedule(taskInput)}
          placeholder="Ask for help..."
          className="flex-1 rounded-3xl border border-gray-200 bg-white px-5 py-4 text-[13px] font-bold text-[#424242] shadow-sm transition-all placeholder:text-[#a1a1a1] hover:shadow-md focus:border-[#67B59F] focus:outline-none focus:ring-2 focus:ring-[#67B59F]/40"
        />
        <button
          onClick={() => executeSchedule(taskInput)}
          disabled={isLoading || !taskInput.trim()}
          className="flex flex-shrink-0 items-center justify-center rounded-full bg-[#67B59F] p-4 text-white shadow-sm transition-colors hover:bg-[#5aa38e] disabled:opacity-50"
          aria-label="Send"
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <span className="text-sm font-black">Go</span>
          )}
        </button>
      </div>
    </section>
  );
}

function TaskStartPanel({
  completedTasks,
  deleteTaskAtIndex,
  enterFocusMode,
  selectedTaskIndex,
  setSelectedTaskIndex,
  tasks,
}: {
  completedTasks: TaskBlock[];
  deleteTaskAtIndex: (index: number) => void;
  enterFocusMode: () => void;
  selectedTaskIndex: number;
  setSelectedTaskIndex: (index: number) => void;
  tasks: TaskBlock[];
}) {
  const selectedTask = tasks[selectedTaskIndex] ?? tasks[0] ?? null;

  return (
    <section className="flex min-h-0 flex-col rounded-[40px] bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.035)]">
      <div className="mb-6">
        <p className="text-[13px] font-extrabold uppercase tracking-widest text-[#828b9a]">
          Task
        </p>
        <h2 className="mt-3 text-[34px] font-extrabold tracking-tight text-[#303030]">
          Today&apos;s tasks
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[36px] bg-[#F8F6F1] p-4">
        {tasks.length > 0 ? (
          <div className="space-y-3">
            {tasks.map((task, index) => (
              <TaskItem
                key={task.id ?? `${task.title}-${task.block_minutes}-${index}`}
                index={index}
                isSelected={index === selectedTaskIndex}
                onDelete={() => deleteTaskAtIndex(index)}
                onSelect={() => setSelectedTaskIndex(index)}
                task={task}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
            <p className="text-[12px] font-extrabold uppercase tracking-widest text-[#8d8d8d]">
              No tasks yet
            </p>
          </div>
        )}
      </div>

      <button
        onClick={enterFocusMode}
        disabled={!selectedTask}
        className="mt-6 rounded-[32px] border-b-4 border-[#A696BF] bg-[#B5A6CC] py-7 text-[24px] font-extrabold tracking-wide text-white shadow-[0_8px_24px_rgba(181,166,204,0.35)] transition-all hover:bg-[#A696BF] active:scale-[0.98] disabled:opacity-50"
      >
        {selectedTask ? `Start: ${selectedTask.title}` : 'Start'}
      </button>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-3xl border border-gray-100 bg-white px-5 py-4">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#c1c1c1]">
            Up next
          </p>
          <p className="mt-2 text-[22px] font-extrabold text-[#424242]">
            {Math.max(tasks.length - 1, 0)}
          </p>
        </div>
        <div className="rounded-3xl border border-gray-100 bg-white px-5 py-4">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#c1c1c1]">
            Done today
          </p>
          <p className="mt-2 text-[22px] font-extrabold text-[#424242]">
            {completedTasks.length}
          </p>
        </div>
      </div>
    </section>
  );
}

function TaskItem({
  index,
  isSelected,
  onDelete,
  onSelect,
  task,
}: {
  index: number;
  isSelected: boolean;
  onDelete: () => void;
  onSelect: () => void;
  task: TaskBlock;
}) {
  const formatBlockMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:00`;
    }
    return `${mins}:00`; // Return MM:00 for minutes under an hour
  };

  return (
    <article
      className={`w-full rounded-3xl border px-5 py-5 text-left transition-all active:scale-[0.99] ${isSelected
        ? 'border-[#B5A6CC] bg-white shadow-[0_8px_24px_rgba(181,166,204,0.18)]'
        : 'border-gray-100 bg-white/75 shadow-[0_2px_8px_rgba(0,0,0,0.035)] hover:border-gray-200 hover:bg-white hover:shadow-md'
        }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest ${index === 0
              ? 'bg-[#E7F3ED] text-[#6cb593]'
              : 'bg-[#F0F1F3] text-[#9a9a9a]'
              }`}
          >
            {index === 0 ? 'Current / next' : `Task ${index + 1}`}
          </span>
          {isSelected && (
            <span className="rounded-full bg-[#FDF3DE] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#9a7b32]">
              Selected
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full border border-[#F1D7D2] bg-[#FFF7F5] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#C05B4B] transition-all hover:border-[#E9BBB2] hover:bg-[#FFEAE5] active:scale-[0.96]"
          aria-label={`Delete ${task.title}`}
        >
          Delete
        </button>
      </div>

      <button type="button" onClick={onSelect} className="w-full text-left">
        <h3 className="text-[18px] font-extrabold leading-snug text-[#303030]">
          {task.title}
        </h3>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[#F4F5F7] px-3 py-1.5 text-[11px] font-bold text-[#788294]">
            {formatBlockMinutes(task.block_minutes)}
          </span>
          <span className="rounded-full bg-[#FDF3DE] px-3 py-1.5 text-[11px] font-bold text-[#7a6a45]">
            +{task.reward_value} gems
          </span>
        </div>
      </button>
    </article>
  );
}
