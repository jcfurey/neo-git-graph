// @vitest-environment jsdom

import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
