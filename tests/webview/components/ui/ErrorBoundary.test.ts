// @vitest-environment jsdom

import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "@/webview/components/ui/ErrorBoundary";

import { setupWebviewTest } from "@tests/webview/test-utils";

let container: HTMLDivElement;

beforeAll(() => setupWebviewTest());

afterEach(() => {
  act(() => render(null, container));
  container.remove();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("replaces only a failing view with its error and a retry", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("cannot draw");
    let fail = true;
    function Fragile() {
      if (fail) {
        throw error;
      }
      return h("p", null, "drawn");
    }
    container = document.createElement("div");
    document.body.append(container);

    act(() =>
      render(
        h("div", null, h("span", null, "header"), h(ErrorBoundary, null, h(Fragile, null))),
        container
      )
    );

    expect(container.textContent).toContain("header");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("viewFailedretryView");
    expect(logged).toHaveBeenCalledWith(error);

    fail = false;
    act(() => container.querySelector("button")!.click());

    expect(container.textContent).toBe("headerdrawn");
  });
});
