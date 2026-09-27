// @vitest-environment jsdom

import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { setupWebviewTest } from "@tests/webview/test-utils";

let dropdown: typeof import("@/webview/components/ui/Dropdown");
let container: HTMLDivElement;

beforeAll(async () => {
  setupWebviewTest();
  Element.prototype.scrollIntoView = () => {};
  dropdown = await import("@/webview/components/ui/Dropdown");
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => render(null, container));
  container.remove();
  vi.restoreAllMocks();
});

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height
});

describe("fitPanel", () => {
  it("keeps a panel wider than its trigger inside a narrow window", () => {
    const fit = dropdown.fitPanel(box(60, 40, 100, 24), 300, 200, { width: 400, height: 800 });
    expect(60 + fit.left).toBe(8);
    expect(60 + fit.left + 300).toBeLessThanOrEqual(392);
    expect(fit.up).toBe(false);
  });

  it("stays right-aligned with its trigger where it fits", () => {
    const wide = dropdown.fitPanel(box(250, 40, 100, 24), 300, 200, { width: 1200, height: 800 });
    expect(wide.left).toBe(-200);
    expect(wide.maxWidth).toBe(384);
    // A trigger at the right edge still leaves the margin.
    const fit = dropdown.fitPanel(box(290, 40, 106, 24), 300, 200, { width: 400, height: 800 });
    expect(290 + fit.left + 300).toBe(392);
  });

  it("narrows a panel wider than the window", () => {
    const fit = dropdown.fitPanel(box(10, 40, 100, 24), 380, 200, { width: 300, height: 800 });
    expect(fit.maxWidth).toBe(284);
    expect(10 + fit.left).toBe(8);
  });

  it("opens upwards when there is more room above the trigger", () => {
    const viewport = { width: 800, height: 800 };
    expect(dropdown.fitPanel(box(10, 680, 100, 24), 200, 288, viewport)).toMatchObject({
      up: true,
      maxHeight: 288
    });
    expect(dropdown.fitPanel(box(10, 40, 100, 24), 200, 288, viewport)).toMatchObject({
      up: false,
      maxHeight: 288
    });
    // In a short window the panel scrolls within the larger side.
    const short = { width: 800, height: 300 };
    expect(dropdown.fitPanel(box(10, 120, 100, 24), 200, 288, short)).toMatchObject({
      up: false,
      maxHeight: 144
    });
  });
});

it("places the open panel inside the window and again after a resize", () => {
  const options = ["main", "a-very-long-branch-name-that-is-wider-than-the-trigger"].map(
    (name) => ({ label: name, value: name })
  );
  act(() =>
    render(
      h(dropdown.Dropdown, { label: "Branch", options, value: "main", onChange: () => {} }),
      container
    )
  );
  const trigger = container.querySelector<HTMLButtonElement>("button[aria-haspopup]")!;
  let width = 400;
  let triggerLeft = 60;
  vi.spyOn(document.documentElement, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(800);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const rect = this === trigger ? box(triggerLeft, 40, 100, 24) : box(0, 0, 300, 120);
    return { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top } as DOMRect;
  });

  act(() => trigger.click());
  const panel = container.querySelector<HTMLElement>('[role="combobox"]')!.parentElement!;
  expect(panel.style.left).toBe("-52px");
  expect(panel.style.right).toBe("auto");
  expect(panel.style.maxWidth).toBe("384px");

  // A wider window moves the trigger right, where the panel lines up with it again.
  width = 1200;
  triggerLeft = 250;
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(panel.style.left).toBe("-200px");
  expect(panel.style.maxWidth).toBe("384px");
});

describe("branch dropdown with 10,000 branches", () => {
  const branches = Array.from({ length: 10_000 }, (_, i) => ({
    label: `branch-${i}`,
    value: `branch-${i}`
  }));

  it("renders one page of options and pages with the keyboard", () => {
    act(() =>
      render(
        h(dropdown.Dropdown, {
          label: "Branch",
          options: branches,
          value: "branch-0",
          onChange: () => {}
        }),
        container
      )
    );
    act(() => container.querySelector("button")!.click());
    expect(container.querySelectorAll("li")).toHaveLength(dropdown.DROPDOWN_PAGE);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("dropdownPage");

    const combo = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    act(() => {
      combo.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    const last = container.querySelector<HTMLElement>('li[data-active="true"]');
    expect(last?.textContent).toBe("branch-9999");
    expect(combo.getAttribute("aria-activedescendant")).toBe(last?.id);
    expect(container.querySelectorAll("li").length).toBeLessThanOrEqual(dropdown.DROPDOWN_PAGE);
  });
});
