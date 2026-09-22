import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient, createCourse } from "../supabase/tests/helpers";

export const admin = adminClient();

export interface E2EUser {
  userId: string;
  email: string;
  password: string;
}

/** Creates a confirmed user via the admin API and signs in through the real sign-in form. */
export async function createUserAndSignIn(page: Page): Promise<E2EUser> {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`failed to create e2e user: ${error?.message}`);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  return { userId: data.user.id, email, password };
}

export async function seedCourse(userId: string, name = "CS 101"): Promise<string> {
  return createCourse(admin, userId, { name });
}

export async function openAssistant(page: Page): Promise<void> {
  await page.goto("/assistant");
  await expect(page.getByLabel("Text fallback for voice capture")).toBeVisible();
}

async function submitText(page: Page, text: string): Promise<void> {
  const box = page.getByLabel("Text fallback for voice capture");
  await expect(box).toBeEnabled();
  await box.fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/**
 * Sends a command that should propose a mutation, waits for the confirmation
 * prompt (the model's summary), clicks Confirm within the confirmation window, and
 * returns the confirmation prompt text and the executed-result text.
 */
export async function runMutation(page: Page, text: string): Promise<{ prompt: string; result: string }> {
  await submitText(page, text);
  const confirmButton = page.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirmButton, `expected a confirmation prompt for: "${text}"`).toBeVisible({ timeout: 45_000 });
  const prompt = await page.locator("p.text-text-primary").last().innerText();
  await confirmButton.click();
  await expect(confirmButton).toBeHidden({ timeout: 15_000 });
  const result = await page.locator("p.text-text-primary").last().innerText();
  return { prompt, result };
}

/** Sends a turn that should NOT go straight to a mutation confirmation; returns the assistant's reply text. */
export async function askAssistant(page: Page, text: string): Promise<string> {
  await submitText(page, text);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  const reply = page.locator("p.text-text-primary").last();
  await expect(reply).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel("Text fallback for voice capture")).toBeEnabled({ timeout: 45_000 });
  return reply.innerText();
}

/**
 * Chain-aware variant of runMutation (Workstream C's general multi-step
 * command queue): sends ONE initial command, then clicks Confirm on each
 * proposal in turn, following the server's `next` auto-continuation with NO
 * further text submitted -- exactly what proves the chain, not a lucky
 * follow-up phrase, is what drives a multi-step command to completion.
 * Confirming a step either surfaces a brand-new confirmation prompt
 * (`ConfirmationBar` remounts under a fresh `key={state.sessionId}`, so the
 * "Confirm" role query below transparently re-targets the new instance) or
 * lands on a terminal "Responding" message -- distinguished by whether the
 * Confirm button is still present after the click settles, not by the
 * button ever having disappeared and reappeared, since a same-status
 * AwaitingConfirmation->AwaitingConfirmation transition never unmounts
 * through anything in between.
 */
export async function runMutationChain(page: Page, text: string): Promise<{ prompts: string[]; result: string }> {
  await submitText(page, text);
  const confirmButton = page.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirmButton, `expected a confirmation prompt for: "${text}"`).toBeVisible({ timeout: 45_000 });

  const prompts: string[] = [];
  for (;;) {
    const prompt = await page.locator("p.text-text-primary").last().innerText();
    prompts.push(prompt);
    await confirmButton.click();
    // Either the button goes away (terminal) or a new prompt appears under
    // it (chain continues) -- wait for one of those, not just "not visible",
    // since a stale reference to the same prompt text would pass instantly.
    await expect(async () => {
      const stillThere = await confirmButton.isVisible();
      if (!stillThere) return;
      const currentPrompt = await page.locator("p.text-text-primary").last().innerText();
      expect(currentPrompt).not.toBe(prompt);
    }).toPass({ timeout: 15_000 });

    if (!(await confirmButton.isVisible())) {
      const result = await page.locator("p.text-text-primary").last().innerText();
      return { prompts, result };
    }
  }
}
