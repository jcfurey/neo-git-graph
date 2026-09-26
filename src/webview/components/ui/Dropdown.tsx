import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";

import { ChevronDownIcon } from "./Icons";

/**
 * Options rendered at once. Keyboard moves page through the rest, and the filter narrows them,
 * so thousands of branches open as fast as a few.
 */
export const DROPDOWN_PAGE = 200;

/** Space a dropdown panel keeps from the window's edges, in pixels. */
const EDGE = 8;
/** The gap between the trigger and the panel, as `mt-1`. */
const GAP = 4;
/** The panel's usual height limit, as `max-h-72`. */
const MAX_HEIGHT = 288;

type Box = { left: number; right: number; top: number; bottom: number };

/**
 * Where a panel of `width` × `height` fits beside its trigger in a `viewport`-sized window: right
 * aligned with the trigger where it can be, shifted to stay inside the window, narrowed to the
 * window, and opened upwards when there is more room above the trigger than below it.
 */
export function fitPanel(
  trigger: Box,
  width: number,
  height: number,
  viewport: { width: number; height: number }
) {
  const maxWidth = Math.max(0, viewport.width - 2 * EDGE);
  const fitted = Math.min(width, maxWidth);
  const left = Math.max(EDGE, Math.min(trigger.right - fitted, viewport.width - EDGE - fitted));
  const below = viewport.height - trigger.bottom - GAP - EDGE;
  const above = trigger.top - GAP - EDGE;
  const up = height > below && above > below;
  return {
    /** Offset from the trigger's left edge. */
    left: left - trigger.left,
    maxWidth,
    maxHeight: Math.max(0, Math.min(MAX_HEIGHT, up ? above : below)),
    up
  };
}

type DropdownOption = {
  label: string;
  value: string;
};

type DropdownProps = {
  label: string;
  options: Array<DropdownOption>;
  value: string | undefined;
  onChange: (value: string) => void;
  class?: string;
  disabled?: boolean;
};

export function Dropdown({
  label,
  options,
  value,
  onChange,
  class: className,
  disabled = false
}: DropdownProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const open = expanded && !disabled;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const listId = `${id}-list`;

  const selected = options.find((option) => option.value === value);
  const matches = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase())
  );
  const active = Math.min(activeIndex, matches.length - 1);
  const pageStart = Math.max(0, Math.floor(active / DROPDOWN_PAGE) * DROPDOWN_PAGE);
  const page = matches.slice(pageStart, pageStart + DROPDOWN_PAGE);

  useEffect(() => {
    if (!open) {
      return;
    }

    inputRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // Keep the open panel inside the window, which a narrow window or a trigger near its left edge
  // would otherwise cut off.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!open || panel === null || trigger === null) {
      return;
    }
    const place = () => {
      panel.removeAttribute("style");
      const size = panel.getBoundingClientRect();
      const root = document.documentElement;
      const fit = fitPanel(trigger.getBoundingClientRect(), size.width, size.height, {
        width: root.clientWidth,
        height: root.clientHeight
      });
      Object.assign(panel.style, {
        left: `${fit.left}px`,
        right: "auto",
        maxWidth: `${fit.maxWidth}px`,
        maxHeight: `${fit.maxHeight}px`,
        ...(fit.up ? { top: "auto", bottom: "100%", marginTop: "0", marginBottom: `${GAP}px` } : {})
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, matches.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function close() {
    setExpanded(false);
    triggerRef.current?.focus();
  }

  function toggle() {
    if (open) {
      setExpanded(false);
      return;
    }
    setQuery("");
    setActiveIndex(
      Math.max(
        options.findIndex((option) => option.value === value),
        0
      )
    );
    setExpanded(true);
  }

  function select(option: DropdownOption | undefined) {
    if (option === undefined) {
      return;
    }

    close();
    if (option.value !== value) {
      onChange(option.value);
    }
  }

  function move(step: number) {
    if (matches.length === 0) {
      return;
    }
    setActiveIndex((active + step + matches.length) % matches.length);
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      toggle();
    }
  }

  function onFilterKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(matches.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        select(matches[active]);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        setExpanded(false);
        break;
    }
  }

  return (
    <div ref={rootRef} class="flex min-w-0 items-center gap-2">
      <span id={labelId}>{label}:</span>
      <div class="relative min-w-0">
        <button
          ref={triggerRef}
          type="button"
          class={`flex w-full cursor-pointer items-center gap-1 rounded-md bg-dropdown py-1 pl-3 pr-2 text-dropdown-fg outline-1 outline-dropdown-border focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${labelId} ${valueId}`}
          title={selected?.value}
          onClick={toggle}
          onKeyDown={onTriggerKeyDown}
        >
          <span id={valueId} class="min-w-0 flex-1 truncate text-left">
            {selected?.label}
          </span>
          <ChevronDownIcon class="shrink-0" />
        </button>
        {open && (
          <div
            ref={panelRef}
            class="absolute right-0 top-full z-10 mt-1 flex max-h-72 w-max min-w-full max-w-96 flex-col rounded-md border border-line bg-menu text-menu-fg shadow-md"
          >
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              class="m-1 rounded-sm bg-input px-2 py-1 text-input-fg outline-1 outline-line focus:outline-focus"
              placeholder={window.l10n.filterPlaceholder.replace("{0}", label)}
              value={query}
              aria-expanded={true}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={matches.length > 0 ? `${id}-option-${active}` : undefined}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={onFilterKeyDown}
            />
            {matches.length === 0 ? (
              <div class="px-3 py-1 italic">{window.l10n.noResultsFound}</div>
            ) : (
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-labelledby={labelId}
                class="min-h-0 overflow-y-auto py-1"
              >
                {page.map((option, offset) => {
                  const index = pageStart + offset;
                  return (
                    <li
                      key={option.value}
                      id={`${id}-option-${index}`}
                      role="option"
                      aria-selected={option.value === value}
                      data-active={index === active}
                      title={option.value === option.label ? undefined : option.value}
                      class={`cursor-pointer truncate px-3 py-1 ${
                        index === active
                          ? "bg-menu-active text-menu-active-fg"
                          : option.value === value
                            ? "bg-btn-hover"
                            : ""
                      }`}
                      onPointerMove={() => setActiveIndex(index)}
                      onClick={() => select(option)}
                    >
                      {option.label}
                    </li>
                  );
                })}
              </ul>
            )}
            {matches.length > DROPDOWN_PAGE && (
              <div class="border-t border-line px-3 py-1 text-xs text-muted" role="status">
                {window.l10n.dropdownPage
                  .replace("{0}", String(pageStart + 1))
                  .replace("{1}", String(pageStart + page.length))
                  .replace("{2}", String(matches.length))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
