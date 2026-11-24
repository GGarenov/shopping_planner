// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";
import { router } from "@/test/setup";
import { LanguageToggle } from "./LanguageToggle";

const setLocale = vi.fn<(l: string) => Promise<void>>(async () => {});
vi.mock("@/app/actions/locale", () => ({ setLocale: (l: string) => setLocale(l) }));

describe("LanguageToggle", () => {
  it("shows the current language as pressed", () => {
    renderWithIntl(<LanguageToggle />, { locale: "bg" });
    expect(screen.getByRole("button", { name: "Български" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches language: saves it and refreshes the page", async () => {
    const { user } = renderWithIntl(<LanguageToggle />, { locale: "bg" });
    await user.click(screen.getByRole("button", { name: "English" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(setLocale).toHaveBeenCalledWith("en");
  });

  it("does nothing when the current language is clicked again", async () => {
    const { user } = renderWithIntl(<LanguageToggle />, { locale: "en" });
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(setLocale).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
