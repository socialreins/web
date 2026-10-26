// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaitlistForm } from "@/components/waitlist-form";

const respond = (status: number) => vi.fn().mockResolvedValue(new Response(null, { status }));

async function submit(email = "a@b.co") {
  fireEvent.change(screen.getByLabelText("Email for the hosted version waitlist"), { target: { value: email } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "Join the waitlist" }).closest("form")!);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WaitlistForm", () => {
  it("shows success in the live region and moves focus to it", async () => {
    vi.stubGlobal("fetch", respond(200));
    render(<WaitlistForm />);
    const message = screen.getByRole("status");
    expect(message).toHaveProperty("textContent", "");
    await submit();
    expect(message.textContent).toMatch(/on the waitlist/);
    expect(document.activeElement).toBe(message);
  });

  it("keeps the same live region for errors and the form usable", async () => {
    vi.stubGlobal("fetch", respond(422));
    render(<WaitlistForm />);
    const message = screen.getByRole("status");
    await submit("bad");
    expect(screen.getByRole("status")).toBe(message);
    expect(message.textContent).toMatch(/doesn't look right/);
    expect(screen.getByLabelText("Email for the hosted version waitlist").getAttribute("aria-invalid")).toBe("true");
  });

  it("clears the message while sending so a repeated error is announced again", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    render(<WaitlistForm />);
    const message = screen.getByRole("status");
    fireEvent.change(screen.getByLabelText("Email for the hosted version waitlist"), { target: { value: "a@b.co" } });
    fireEvent.submit(message.closest("form")!);
    expect(message.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Joining..." })).toHaveProperty("disabled", true);
    await act(async () => resolve(new Response(null, { status: 429 })));
    expect(message.textContent).toMatch(/Too many attempts/);
  });
});
