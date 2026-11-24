// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BeforeInstallPromptEvent } from "@/lib/pwa/install";
import { renderWithIntl } from "@/test/render";
import { InstallButton } from "./InstallButton";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";

function setDevice({ ua, standalone = false }: { ua: string; standalone?: boolean }) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as unknown as typeof window.matchMedia;
}

/** What the inline script in the layout stores when the browser offers installation. */
function offerInstall(outcome: "accepted" | "dismissed" = "accepted") {
  const event = { prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) } as unknown as BeforeInstallPromptEvent;
  window.__bip = event;
  window.dispatchEvent(new Event("bip-change"));
  return event;
}

beforeEach(() => {
  window.__bip = null;
  window.__bipInstalled = false;
});
afterEach(() => vi.restoreAllMocks());

describe("InstallButton", () => {
  it("Android with the browser's install offer: one tap opens the system dialog, then «Готово!»", async () => {
    setDevice({ ua: ANDROID });
    const event = offerInstall("accepted");
    const { user } = renderWithIntl(<InstallButton />);
    await user.click(screen.getByRole("button", { name: /Добави в телефона/ }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Готово!");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("picks up an install offer that arrives after the page rendered", async () => {
    setDevice({ ua: ANDROID });
    const { user } = renderWithIntl(<InstallButton />);
    let event!: BeforeInstallPromptEvent;
    act(() => {
      event = offerInstall("dismissed");
    });
    await user.click(screen.getByRole("button", { name: /Добави в телефона/ }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument(); // dismissed → button stays
  });

  it("iPhone (no install API): opens the 2-step Safari guide, «Разбрах» closes it", async () => {
    setDevice({ ua: IPHONE });
    const { user } = renderWithIntl(<InstallButton variant="banner" />);
    await user.click(screen.getByRole("button", { name: /Добави в телефона/ }));
    const dialog = screen.getByRole("dialog", { name: "Добави в iPhone с 2 докосвания" });
    expect(dialog).toHaveTextContent("Добави към началния екран");
    await user.click(screen.getByRole("button", { name: "Разбрах" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Android browser without the install offer: shows the browser-menu guide", async () => {
    setDevice({ ua: ANDROID });
    const { user } = renderWithIntl(<InstallButton />);
    await user.click(screen.getByRole("button", { name: /Добави в телефона/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Инсталиране на приложението");
  });

  it("renders nothing inside the installed app", () => {
    setDevice({ ua: ANDROID, standalone: true });
    const { container } = renderWithIntl(<InstallButton />);
    expect(container).toBeEmptyDOMElement();
  });
});
