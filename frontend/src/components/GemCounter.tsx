type GemCounterProps = {
  count: number;
};

export function GemCounter({ count }: GemCounterProps) {
  return (
    <div className="gem-glow flex items-center gap-3 rounded-[8px] border border-[#d8e7e3] bg-[#fbfdfc] px-4 py-3 text-[#24413d] shadow-sm">
      <span
        className="grid h-10 w-10 place-items-center rounded-[8px] bg-[#dff5ef] text-xl font-bold text-[#2f8f83]"
        aria-hidden="true"
      >
        *
      </span>
      <div>
        <p className="text-sm font-medium text-[#5f7772]">Today&apos;s gems</p>
        <p className="text-2xl font-semibold leading-none">{count}</p>
      </div>
    </div>
  );
}
