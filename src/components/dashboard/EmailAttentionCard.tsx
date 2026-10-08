"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Input";
import { MailProviderIcon } from "@/components/dashboard/MailProviderIcon";
import { TriageBucketBadge } from "@/components/dashboard/TriageBucketBadge";
import { EmailActionDialog, actionLabel } from "@/components/dashboard/EmailActionDialog";
import { useMailAccounts } from "@/hooks/useMailAccounts";
import { useEmailTriage, useRunEmailTriage, useUpdateTriageItem } from "@/hooks/useEmailTriage";
import { ApiError } from "@/lib/http/client";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { TRIAGE_DEFAULT_DAYS, TRIAGE_MAX_DAYS, TRIAGE_MIN_DAYS } from "@/lib/email-triage/constants";
import { attentionItems } from "@/lib/email-triage/rank";
import { senderName } from "@/lib/email-triage/summary";
import type { TriageItem, TriageRunResponse } from "@/lib/email-triage/types";
import type { MailProvider } from "@/lib/mail/types";

const PROVIDER_LABEL: Record<MailProvider, string> = { google: "Gmail", microsoft: "Outlook" };
const PRESET_DAYS = [1, 3, 7, 14] as const;

function isMailProvider(value: string): value is MailProvider {
  return value === "google" || value === "microsoft";
}

/**
 * "Needs your attention": open Important / Needs-action emails from the latest
 * manual triage. Checking email is always an explicit click — nothing here
 * polls or runs on load. Each item offers its suggested next step (confirmed
 * through the prefilled create form) and a dismiss.
 */
export function EmailAttentionCard() {
  const { data: stored, isLoading, isError } = useEmailTriage("open");
  const { data: accounts } = useMailAccounts();
  const runTriage = useRunEmailTriage();
  const updateItem = useUpdateTriageItem();

  const [panelOpen, setPanelOpen] = useState(false);
  const [chosenProvider, setChosenProvider] = useState<MailProvider | null>(null);
  const [days, setDays] = useState<number>(TRIAGE_DEFAULT_DAYS);
  const [customDays, setCustomDays] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [connectProvider, setConnectProvider] = useState<{ provider: MailProvider; reauth: boolean } | null>(null);
  const [actionItem, setActionItem] = useState<TriageItem | null>(null);

  const connected = (accounts ?? []).map((account) => account.provider).filter(isMailProvider);
  const provider = chosenProvider && connected.includes(chosenProvider) ? chosenProvider : (connected[0] ?? null);

  const parsedCustom = Number(customDays);
  const customValid = Number.isInteger(parsedCustom) && parsedCustom >= TRIAGE_MIN_DAYS && parsedCustom <= TRIAGE_MAX_DAYS;
  const effectiveDays = useCustom ? parsedCustom : days;
  const canRun = provider !== null && (!useCustom || customValid) && !runTriage.isPending;

  const items = attentionItems(stored ?? []);

  const describeRun = (result: TriageRunResponse, label: string): string => {
    if (!result.stats) return "";
    const { classified, considered, truncated } = result.stats;
    if (considered === 0) return `No unread ${label} mail in that range.`;
    const base = classified === 0 ? `Nothing new in ${label}.` : `Checked ${classified} new ${classified === 1 ? "email" : "emails"} in ${label}.`;
    return truncated ? `${base} There is more unread mail than one check covers.` : base;
  };

  const run = () => {
    if (!provider || !canRun) return;
    setFeedback(null);
    setConnectProvider(null);
    runTriage.mutate(
      { provider, days: effectiveDays },
      {
        onSuccess: (result) => {
          if (!result.connected) {
            setConnectProvider({ provider, reauth: false });
            return;
          }
          if (result.needsReauth) {
            setConnectProvider({ provider, reauth: true });
            return;
          }
          setFeedback(describeRun(result, PROVIDER_LABEL[provider]));
          setPanelOpen(false);
        },
        onError: (error) => {
          setFeedback(
            error instanceof ApiError && error.status === 429
              ? "You've checked email a lot recently. Try again later."
              : "Could not check your email. Please try again.",
          );
        },
      },
    );
  };

  return (
    <GlassPanel className="flex flex-col gap-3 p-5" data-testid="email-attention-card">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-accent-teal">Needs your attention</p>
        <Button size="sm" variant="secondary" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen}>
          Check email
        </Button>
      </div>

      {panelOpen && (
        <div className="flex flex-col gap-3 rounded-control border border-panel-border p-3" data-testid="email-triage-panel">
          {connected.length === 0 ? (
            <p className="text-sm text-text-secondary">Connect Gmail or Outlook in the mail card first.</p>
          ) : (
            <>
              <div role="group" aria-label="Account to check" className="flex gap-2">
                {connected.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={provider === candidate}
                    onClick={() => setChosenProvider(candidate)}
                    className={`flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs transition-colors ${
                      provider === candidate
                        ? "border-accent-teal text-text-primary"
                        : "border-panel-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <MailProviderIcon provider={candidate} size={14} />
                    {PROVIDER_LABEL[candidate]}
                  </button>
                ))}
              </div>

              <div role="group" aria-label="Time range" className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-text-secondary">Unread, last</span>
                {PRESET_DAYS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={!useCustom && days === preset}
                    onClick={() => {
                      setUseCustom(false);
                      setDays(preset);
                    }}
                    className={`rounded-control border px-2 py-1 font-mono text-xs transition-colors ${
                      !useCustom && days === preset
                        ? "border-accent-teal text-text-primary"
                        : "border-panel-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {preset}d
                  </button>
                ))}
                <Input
                  aria-label="Custom number of days"
                  type="number"
                  inputMode="numeric"
                  min={TRIAGE_MIN_DAYS}
                  max={TRIAGE_MAX_DAYS}
                  placeholder="days"
                  value={customDays}
                  onFocus={() => setUseCustom(true)}
                  onChange={(event) => {
                    setUseCustom(true);
                    setCustomDays(event.target.value);
                  }}
                  className="w-20"
                />
              </div>
              {useCustom && customDays !== "" && !customValid && (
                <p className="text-xs text-status-urgent">
                  Enter a whole number of days from {TRIAGE_MIN_DAYS} to {TRIAGE_MAX_DAYS}.
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={run} disabled={!canRun} isLoading={runTriage.isPending}>
                  Run
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPanelOpen(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {connectProvider && (
        <div className="flex items-center justify-between gap-3 text-sm text-text-secondary">
          <span>
            {connectProvider.reauth
              ? `Your ${PROVIDER_LABEL[connectProvider.provider]} connection expired.`
              : `${PROVIDER_LABEL[connectProvider.provider]} isn't connected.`}
          </span>
          <a
            href={`/api/mail/oauth/${connectProvider.provider}/start`}
            className="font-mono text-xs text-accent-teal hover:underline"
          >
            {connectProvider.reauth ? "Reconnect" : "Connect"}
          </a>
        </div>
      )}

      {feedback && (
        <p role="status" className="text-xs text-text-secondary">
          {feedback}
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <p className="text-sm text-text-secondary">Could not load your flagged emails.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">No flagged emails. Check email to look for new ones.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-panel-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-text-primary" title={item.subject}>
                  {item.subject}
                </p>
                <TriageBucketBadge bucket={item.bucket} className="shrink-0" />
              </div>
              <p className="font-mono text-xs text-text-secondary">
                {senderName(item.sender)} · {formatRelativeTime(new Date(item.receivedAt))}
              </p>
              <p className="text-xs text-text-secondary">{item.reason}</p>
              <div className="flex flex-wrap items-center gap-2">
                {item.suggestedAction && (
                  <Button size="sm" variant="secondary" onClick={() => setActionItem(item)}>
                    {actionLabel(item.suggestedAction)}
                  </Button>
                )}
                {item.webLink && (
                  <a
                    href={item.webLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
                  >
                    Open in {PROVIDER_LABEL[item.provider]}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => updateItem.mutate({ id: item.id, status: "dismissed" })}
                  className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
                  aria-label={`Dismiss ${item.subject}`}
                >
                  Dismiss
                </button>
              </div>
              {item.suggestedAction && (
                <p className="truncate text-xs text-text-eyebrow" title={item.suggestedAction.title}>
                  Suggested: {item.suggestedAction.title}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <EmailActionDialog item={actionItem} onClose={() => setActionItem(null)} />
    </GlassPanel>
  );
}
