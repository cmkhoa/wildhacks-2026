'use client';

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

export default function Home() {
  const [taskInput, setTaskInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [gemsEarned, setGemsEarned] = useState(0);
  const [email, setEmail] = useState<string | null>(null);
  
  const username = email ? email.split('@')[0] : 'Haiha';
  const router = useRouter();

  const [activeTask, setActiveTask] = useState<TaskBlock | null>(null);
  const [queuedTasks, setQueuedTasks] = useState<TaskBlock[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskBlock[]>([]);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Keep the next move small enough to start.' },
  ]);

  const fetchTasks = async (userEmail: string) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const res = await fetch(`${backendUrl}/api/tasks?email=${encodeURIComponent(userEmail)}`);
      const data = await res.json();
      
      if (data.tasks) {
        const allCompleted: TaskBlock[] = [];
        const allPending: TaskBlock[] = [];
        let gems = 0;
        
        data.tasks.forEach((task: any) => {
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
      fetchTasks(finalEmail);
    }
  }, []);

  const dailyTasks = activeTask ? [activeTask, ...queuedTasks] : queuedTasks;
  const selectedTask = dailyTasks[selectedTaskIndex] ?? dailyTasks[0] ?? null;

  const enterFocusMode = () => {
    if (!selectedTask) return;

    const params = new URLSearchParams({
      title: selectedTask.title,
      reward: String(selectedTask.reward_value),
      minutes: String(selectedTask.block_minutes),
    });
    
    if (selectedTask.id) params.append('id', selectedTask.id);
    if (selectedTask.steps && selectedTask.steps.length > 0) {
      params.append('steps', JSON.stringify(selectedTask.steps));
    }
    
    router.push(`/focus?${params.toString()}`);
  };

  const executeSchedule = async (inputStr: string) => {
    if (!inputStr.trim()) return;

    setIsLoading(true);
    setChatHistory((previous) => [...previous, { role: 'user', text: inputStr }]);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const res = await fetch(`${backendUrl}/api/tasks/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_input: inputStr, email: email || 'anonymous' }),
      });
      const data = await res.json();

      if (data.status === 'success') {
        const tasks = data.parsed_plan?.subtasks || [];

        if (tasks.length > 0) {
          setChatHistory((previous) => [
            ...previous,
            {
              role: 'assistant',
              text: `Got it. I added ${tasks.length} small step${tasks.length === 1 ? '' : 's'} to your queue.`,
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

  const handleQuickAction = (actionText: string) => {
    executeSchedule(actionText);
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
          <div className="flex cursor-pointer items-center space-x-2 rounded-full bg-[#FDF3DE] px-5 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-md">
            <span className="relative bottom-[1px] text-xl leading-none text-[#E6B95C]">
              &#9830;
            </span>
            <span className="text-sm font-bold text-[#7a6a45]">
              Today&apos;s Gems: {gemsEarned}
            </span>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-6 pb-4 lg:grid-cols-2 xl:gap-8">
          <PlanningPanel
            chatHistory={chatHistory}
            executeSchedule={executeSchedule}
            handleQuickAction={handleQuickAction}
            isLoading={isLoading}
            setTaskInput={setTaskInput}
            taskInput={taskInput}
          />
          <TaskStartPanel
            completedTasks={completedTasks}
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
  handleQuickAction,
  isLoading,
  setTaskInput,
  taskInput,
}: {
  chatHistory: ChatMessage[];
  executeSchedule: (input: string) => void;
  handleQuickAction: (input: string) => void;
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
          What needs to feel easier?
        </h2>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        {['I\'m stuck', 'Break this down', '5 minute version', 'Motivate me'].map((action) => (
          <button
            key={action}
            onClick={() => handleQuickAction(action)}
            className="rounded-3xl border border-gray-100 bg-[#FDFCFB] px-5 py-4 text-left text-[13px] font-bold text-[#424242] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all hover:border-gray-200 hover:shadow-md active:scale-[0.98]"
          >
            {action}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {chatHistory.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={`rounded-3xl border px-5 py-5 text-[13px] leading-relaxed shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${
              msg.role === 'user'
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
  enterFocusMode,
  selectedTaskIndex,
  setSelectedTaskIndex,
  tasks,
}: {
  completedTasks: TaskBlock[];
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
                key={`${task.title}-${task.block_minutes}-${index}`}
                index={index}
                isSelected={index === selectedTaskIndex}
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
            <h3 className="mt-4 text-[34px] font-extrabold tracking-tight text-[#2B2B2B]">
              Ask the coach to make a plan.
            </h3>
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
  onSelect,
  task,
}: {
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  task: TaskBlock;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-3xl border px-5 py-5 text-left transition-all active:scale-[0.99] ${
        isSelected
          ? 'border-[#B5A6CC] bg-white shadow-[0_8px_24px_rgba(181,166,204,0.18)]'
          : 'border-gray-100 bg-white/75 shadow-[0_2px_8px_rgba(0,0,0,0.035)] hover:border-gray-200 hover:bg-white hover:shadow-md'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span
          className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest ${
            index === 0
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

      <h3 className="text-[18px] font-extrabold leading-snug text-[#303030]">
        {task.title}
      </h3>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-[#F4F5F7] px-3 py-1.5 text-[11px] font-bold text-[#788294]">
          {task.block_minutes} min
        </span>
        <span className="rounded-full bg-[#FDF3DE] px-3 py-1.5 text-[11px] font-bold text-[#7a6a45]">
          +{task.reward_value} gems
        </span>
      </div>
    </button>
  );
}
