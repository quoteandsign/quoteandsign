import { useEffect, useRef } from "react";
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from "@blocknote/react";
import { cn } from "../components/ui";

// One compact grid for both the "+" button and typing "/". No scrolling through a long list:
// tiles grouped by purpose, the keyboard selection follows BlockNote's selectedIndex.

export function BlockMenu({ items, selectedIndex, onItemClick, loadingState }: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedIndex === undefined) return;
    ref.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const groups: { title: string; entries: { item: DefaultReactSuggestionItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const title = item.group ?? "Blocks";
    let g = groups.find((x) => x.title === title);
    if (!g) groups.push((g = { title, entries: [] }));
    g.entries.push({ item, index });
  });

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Add a block"
      className="w-[min(400px,calc(100vw-24px))] max-h-[85vh] overflow-y-auto rounded-2xl border border-hairline bg-white p-2 text-ink shadow-[0_1px_2px_rgba(25,24,22,.05),0_20px_50px_-20px_rgba(25,24,22,.3)] dark:border-white/10 dark:bg-stone-900 dark:text-stone-50"
    >
      {loadingState !== "loaded" && items.length === 0 ? (
        <div className="p-4 text-[13px] text-graphite dark:text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-4 text-[13px] text-graphite dark:text-stone-400">No blocks match. Keep typing or press Escape.</div>
      ) : (
        groups.map((g) => (
          <div key={g.title} className="p-1">
            <div className="px-1.5 pb-1.5 pt-1 text-[11.5px] font-medium text-graphite dark:text-stone-500">{g.title}</div>
            <div className="grid grid-cols-4 gap-1">
              {g.entries.map(({ item, index }) => (
                <button
                  key={item.title}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === index}
                  data-index={index}
                  title={item.subtext}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onItemClick?.(item)}
                  className={cn(
                    "grid h-[58px] place-items-center gap-0.5 rounded-xl border border-transparent text-ink transition-[background-color,border-color] duration-100 hover:bg-secondary dark:text-stone-100 dark:hover:bg-white/[.07]",
                    selectedIndex === index && "border-brand/40 bg-brand/[.06] dark:bg-brand/20",
                  )}
                >
                  <span className="grid h-6 w-6 place-items-center text-graphite [&_svg]:h-[18px] [&_svg]:w-[18px] dark:text-stone-400">{item.icon}</span>
                  <span className="text-[11px] leading-none">{item.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
