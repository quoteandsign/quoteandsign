import { SideMenuExtension, SuggestionMenu } from "@blocknote/core/extensions";
import {
  DragHandleButton,
  DragHandleMenu,
  SideMenu,
  useBlockNoteEditor,
  useComponentsContext,
  useExtension,
  useExtensionState,
  type SideMenuProps,
} from "@blocknote/react";
import { useEffect, useState } from "react";
import { PencilSimple, Trash, Plus } from "@phosphor-icons/react";
import { cn } from "../components/ui";

// BlockNote's named colours. The CSS variables come from index.css.
const COLOURS = ["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
type Colour = (typeof COLOURS)[number];
const LABEL: Record<Colour, string> = {
  default: "None", gray: "Gray", brown: "Brown", red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", blue: "Blue", purple: "Purple", pink: "Pink",
};
const varFor = (c: Colour, kind: "text" | "background") =>
  c === "default" ? undefined : `var(--bn-colors-highlights-${c}-${kind})`;

/** One panel: text colour, highlight, delete. Used by both the pencil and the drag handle. */
function BlockOptionsPanel() {
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { selector: (s) => s?.block }) as any;
  // Live copy of the colours: the side-menu snapshot only refreshes when the mouse moves.
  const [colours, setColours] = useState<{ textColor?: string; backgroundColor?: string }>({});
  useEffect(() => {
    if (!block) return;
    const fresh = (editor.getBlock(block.id) ?? block) as any;
    setColours({ textColor: fresh.props?.textColor, backgroundColor: fresh.props?.backgroundColor });
  }, [block, editor]);
  // Outline the block being edited while the panel is open, so there is no doubt which one it is.
  // The editor re-renders block elements and drops foreign classes, so the outline is a style
  // rule keyed on the block id rather than a class on the element.
  useEffect(() => {
    if (!block) return;
    const style = document.createElement("style");
    style.textContent = `.bn-editor [data-id="${block.id}"] > .bn-block > .bn-block-content{outline:2px dashed color-mix(in srgb,var(--color-brand) 55%,transparent);outline-offset:3px;border-radius:6px}`;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [block]);
  if (!block) return null;
  const props = (block.props ?? {}) as { textColor?: string; backgroundColor?: string };
  const canColour = "textColor" in props || "backgroundColor" in props;
  const set = (patch: Record<string, string>) => {
    editor.updateBlock(block, { props: patch } as any);
    setColours((c) => ({ ...c, ...patch }));
  };

  const Swatches = ({ kind, current }: { kind: "text" | "background"; current: string }) => (
    <div className="grid grid-cols-5 gap-1.5">
      {COLOURS.map((c) => {
        const on = (current || "default") === c;
        return (
          <button
            key={c}
            type="button"
            title={LABEL[c]}
            aria-label={`${kind === "text" ? "Text" : "Highlight"}: ${LABEL[c]}`}
            aria-pressed={on}
            onClick={() => set(kind === "text" ? { textColor: c } : { backgroundColor: c })}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-lg border text-[13px] font-semibold transition-[transform,border-color] duration-150 hover:scale-105",
              on ? "border-brand ring-2 ring-brand/30" : "border-hairline dark:border-white/10",
            )}
            style={
              kind === "text"
                ? { color: varFor(c, "text") ?? "inherit", background: "var(--bn-colors-menu-background)" }
                : { background: varFor(c, "background") ?? "var(--bn-colors-menu-background)" }
            }
          >
            {kind === "text" ? "A" : c === "default" ? <span className="h-3 w-3 rounded-full border border-hairline dark:border-white/20" /> : ""}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="w-[236px] p-2.5 text-ink dark:text-stone-50" onMouseDown={(e) => e.preventDefault()}>
      {canColour && (
        <>
          <div className="mb-1.5 text-[11.5px] font-medium text-graphite dark:text-stone-400">Text colour</div>
          <Swatches kind="text" current={colours.textColor ?? "default"} />
          <div className="mb-1.5 mt-3 text-[11.5px] font-medium text-graphite dark:text-stone-400">Highlight</div>
          <Swatches kind="background" current={colours.backgroundColor ?? "default"} />
          <div className="my-2.5 border-t border-hairline dark:border-white/10" />
        </>
      )}
      <button
        type="button"
        onClick={() => editor.removeBlocks([block])}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-red-700 hover:bg-red-600/10 dark:text-red-400"
      >
        <Trash size={15} weight="regular" /> Delete block
      </button>
    </div>
  );
}

function BlockOptions() {
  return (
    <DragHandleMenu>
      <BlockOptionsPanel />
    </DragHandleMenu>
  );
}

function PencilButton() {
  const Components = useComponentsContext()!;
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, { selector: (s) => s?.block });
  if (!block) return null;
  return (
    <Components.Generic.Menu.Root onOpenChange={(open: boolean) => (open ? sideMenu.freezeMenu() : sideMenu.unfreezeMenu())} position="left">
      <Components.Generic.Menu.Trigger>
        <Components.SideMenu.Button label="Block options" className="bn-button" icon={<PencilSimple size={18} weight="regular" data-test="blockOptions" />} />
      </Components.Generic.Menu.Trigger>
      <BlockOptions />
    </Components.Generic.Menu.Root>
  );
}

/**
 * BlockNote's own add button focuses the editor first, and with the selection still at the top of
 * the document the page jumps there. Putting the cursor on the hovered block first keeps the page
 * where the person is looking, and the menu opens right there.
 */
function AddHereButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const suggestion = useExtension(SuggestionMenu);
  const block = useExtensionState(SideMenuExtension, { selector: (s) => s?.block }) as any;
  if (!block) return null;
  return (
    <Components.SideMenu.Button
      label="Add block"
      className="bn-button"
      icon={<Plus size={18} weight="regular" data-test="dragHandleAdd" />}
      onClick={() => {
        const y = window.scrollY;
        const content = block.content;
        if (Array.isArray(content) && content.length === 0) editor.setTextCursorPosition(block);
        else editor.setTextCursorPosition(editor.insertBlocks([{ type: "paragraph" }], block, "after")[0]!);
        suggestion.openSuggestionMenu("/");
        // Focusing the editor can drag the page to the top of the document; keep it where the person is.
        requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 40) window.scrollTo({ top: y }); });
      }}
    />
  );
}

export function ProposalSideMenu(props: SideMenuProps) {
  return (
    <SideMenu {...props}>
      <AddHereButton />
      <DragHandleButton {...props} dragHandleMenu={BlockOptions} />
      <PencilButton />
    </SideMenu>
  );
}
