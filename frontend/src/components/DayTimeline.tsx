import type { FocusBlock } from "./NowPanel";

type DayTimelineProps = {
  blocks: FocusBlock[];
  selectedBlockId: string;
  onSelectBlock: (blockId: string) => void;
  onCollapse?: () => void;
};

const statusLabels: Record<FocusBlock["status"], string> = {
  planned: "Planned",
  active: "Active",
  completed: "Done",
};

export function DayTimeline({
  blocks,
  selectedBlockId,
  onSelectBlock,
  onCollapse,
}: DayTimelineProps) {
  return (
    <aside className="rounded-[8px] border border-[#dce7e4] bg-white/80 p-4 shadow-[0_16px_42px_rgba(35,74,67,0.08)] backdrop-blur">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#6d827d]">
            Queue
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[#203b37]">
            Up next
          </h2>
        </div>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            className="button-pop rounded-[8px] border border-[#d8e7e3] bg-white px-3 py-2 text-sm font-semibold text-[#5f7772] transition hover:scale-[1.02] hover:border-[#2f8f83] hover:text-[#276f67] active:scale-[0.96]"
          >
            Collapse
          </button>
        ) : null}
      </div>

      <div className="space-y-2.5">
        {blocks.map((block) => {
          const isSelected = block.id === selectedBlockId;
          const isCompleted = block.status === "completed";

          return (
            <button
              key={block.id}
              type="button"
              onClick={() => onSelectBlock(block.id)}
              className={`button-pop group relative w-full overflow-hidden rounded-[8px] border p-3.5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#2f8f83] hover:bg-white ${
                isSelected
                  ? "active-timeline-card border-[#2f8f83] bg-[linear-gradient(135deg,#ffffff,#effaf6)] shadow-[0_12px_28px_rgba(47,143,131,0.16)]"
                  : isCompleted
                    ? "border-[#dde7e4] bg-[#f3f7f6]/80"
                  : "border-[#dce7e4] bg-white/70"
              }`}
            >
              <span
                className={`absolute bottom-0 left-0 top-0 w-1 ${
                  isCompleted
                    ? "bg-[#9fb7b2]"
                    : isSelected
                      ? "bg-[#2f8f83]"
                      : "bg-transparent group-hover:bg-[#b8dcd5]"
                }`}
              />
              <div className="flex items-start justify-between gap-3">
                <time className="pl-2 text-sm font-semibold text-[#5f7772]">
                  {block.timeRange}
                </time>
                <span
                  className={`rounded-[8px] px-2.5 py-1 text-xs font-semibold ${
                    isCompleted
                      ? "bg-[#e7eeec] text-[#5f7772]"
                      : isSelected
                        ? "bg-[#dff5ef] text-[#276f67] ring-2 ring-[#2f8f83]/10"
                        : "bg-[#f1f5f4] text-[#6d827d]"
                  }`}
                >
                  {isCompleted ? (
                    <>
                      <span aria-hidden="true">&#10003;</span> Done
                    </>
                  ) : (
                    statusLabels[block.status]
                  )}
                </span>
              </div>
              <p
                className={`mt-2 pl-2 text-lg font-semibold leading-snug ${
                  isCompleted ? "text-[#7c908b] line-through" : "text-[#203b37]"
                }`}
              >
                {block.title}
              </p>
              {!isCompleted ? (
                <p className="mt-2 pl-2 text-sm font-medium text-[#6d827d]">
                  {block.durationMinutes} minute block
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
