import Link from 'next/link';

export default function BadgesPage() {
  const mockBadges = [
    {
      id: 1,
      title: 'First Step',
      description: 'Complete your first task',
      category: 'Tasks',
      achieved: false,
      icon: '✓',
    },
    {
      id: 2,
      title: 'Gem Collector',
      description: 'Earn 100 total gems',
      category: 'Gems',
      achieved: false,
      icon: '♦',
    },
    {
      id: 3,
      title: 'Time Saver',
      description: 'Finish a task 10% earlier than estimated',
      category: 'Early Finish',
      achieved: false,
      icon: '⏱',
    },
    {
      id: 4,
      title: 'Task Master',
      description: 'Complete 10 tasks in a single week',
      category: 'Tasks',
      achieved: false,
      icon: '🏆',
    },
    {
      id: 5,
      title: 'Speed Demon',
      description: 'Finish 5 tasks early in a row',
      category: 'Early Finish',
      achieved: false,
      icon: '🚀',
    },
    {
      id: 6,
      title: 'Diamond Hands',
      description: 'Hold 500 unspent gems',
      category: 'Gems',
      achieved: false,
      icon: '💎',
    },
  ];

  return (
    <main className="min-h-screen w-full bg-[#FDFCFB] font-sans text-[#424242]">
      <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col px-6 py-10">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-widest text-[#828b9a]">
              Achievements
            </p>
            <h1 className="mt-1 text-[36px] font-extrabold tracking-tight text-[#303030]">
              Badges & Milestones
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#6d6d6d] shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition hover:text-black hover:shadow-md"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mockBadges.map((badge) => (
            <div
              key={badge.id}
              className="flex flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-[#e2e2e2] bg-[#f8f9fa] p-8 text-center opacity-60 transition-opacity hover:opacity-80"
            >
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#EAEAEA] text-4xl grayscale">
                {badge.icon}
              </div>
              <h3 className="mb-2 text-xl font-extrabold text-[#505050]">
                {badge.title}
              </h3>
              <p className="mb-4 text-sm font-semibold text-[#8a8a8a]">
                {badge.description}
              </p>
              <span className="rounded-full bg-[#F0F1F3] px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-[#9a9a9a]">
                {badge.category}
              </span>
            </div>
          ))}
        </section>

        <div className="mt-12 rounded-[24px] bg-[#F1F8F5] p-6 text-center">
          <p className="text-sm font-bold text-[#5f766d]">
            Complete real tasks to start unlocking your badges!
          </p>
        </div>
      </div>
    </main>
  );
}
