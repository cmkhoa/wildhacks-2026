'use client';
import { useState } from 'react';

export default function Home() {
  const [taskInput, setTaskInput] = useState('');
  const [subtasks, setSubtasks] = useState([{title: "Outline History Essay", reward_value: 10}]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSchedule = async () => {
    if (!taskInput.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/tasks/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_input: taskInput })
      });
      const data = await res.json();
      if (data.status === 'success') {
        if (data.parsed_plan?.subtasks) {
          setSubtasks(data.parsed_plan.subtasks);
        }
        setTaskInput('');
      } else {
        alert(data.detail || "Error scheduling tasks");
      }
    } catch (e) {
      console.error("Failed to schedule", e);
      alert("Could not connect to backend");
    }
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen bg-black text-white selection:bg-indigo-500/30 overflow-hidden relative font-sans">
      {/* Background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-600/20 blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 py-12 relative z-10 flex flex-col min-h-screen">
        <header className="mb-16 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">Chronos</h1>
            <p className="text-white/50 text-sm mt-1">Your AI-powered executive function assistant</p>
          </div>
          <div className="flex items-center space-x-3 bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
             <span className="text-sm font-medium text-white/80">Rewards: </span>
             <span className="text-indigo-400 font-bold">120 pts</span>
             <span className="w-1 h-1 rounded-full bg-white/20 mx-1"></span>
             <span className="text-violet-400 text-sm">2 Passes</span>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
          {/* Main Input & Current Actions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
              <div className="relative bg-[#0d0d0d] border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-xl">
                <textarea 
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  placeholder="Brain dump what you need to get done..."
                  className="w-full bg-transparent text-white placeholder-white/30 p-4 min-h-[120px] resize-none focus:outline-none focus:ring-0 text-lg"
                />
                <div className="flex justify-end p-2">
                  <button 
                    onClick={handleSchedule}
                    disabled={isLoading}
                    className="bg-white text-black hover:bg-gray-200 transition-colors px-6 py-2.5 rounded-xl font-medium shadow-[0_0_15px_rgba(255,255,255,0.1)] active:scale-95 disabled:opacity-50"
                  >
                    {isLoading ? "Scheduling..." : "Schedule for me"}
                  </button>
                </div>
              </div>
            </div>

            {/* Subtasks rendering */}
            <div className="bg-[#0a0a0a] rounded-2xl border border-white/5 p-6 mt-8">
              <h2 className="text-lg font-medium text-white/80 mb-4">Current Focus</h2>
                {subtasks.map((st, i) => (
                  <div key={i} className="group flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer">
                    <div className="flex items-center space-x-4">
                      <div className="w-5 h-5 rounded border border-white/30 group-hover:border-indigo-400 transition-colors flex items-center justify-center"></div>
                      <span className="text-white/90">{st.title}</span>
                    </div>
                    <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md">+{st.reward_value} pts</span>
                  </div>
                ))}
            </div>

          </div>

          {/* Calendar visual */}
          <div className="bg-gradient-to-b from-white/5 to-transparent rounded-2xl border border-white/10 p-6 flex flex-col h-full">
            <h2 className="text-lg font-medium text-white/80 mb-6">Today's Timeline</h2>
            <div className="flex-1 space-y-6 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
               
               <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="w-3 h-3 bg-indigo-500 rounded-full border-4 box-content border-black relative z-10 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                  <div className="w-[calc(100%-2rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl bg-white/5 border border-white/10 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/5 transition-all">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-white">Focus Time</div>
                      <time className="font-mono text-xs text-indigo-400">14:00</time>
                    </div>
                    <div className="text-white/60 text-sm">Write intro paragraph</div>
                  </div>
               </div>

            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
