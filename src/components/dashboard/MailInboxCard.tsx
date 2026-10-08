"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MailMessageDialog } from "@/components/dashboard/MailMessageDialog";
import { MailProviderIcon } from "@/components/dashboard/MailProviderIcon";
import { TriageBucketBadge, bucketLabel } from "@/components/dashboard/TriageBucketBadge";
import { useEmailTriage } from "@/hooks/useEmailTriage";
import { useMailAccounts, useDisconnectMailAccount } from "@/hooks/useMailAccounts";
import { useMailMessages } from "@/hooks/useMailMessages";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { TriageBucket } from "@/lib/email-triage/types";
import type { MailMessage, MailProvider } from "@/lib/mail/types";

const FILTERS = ["all", "needs_action", "important", "fyi", "ignore"] as const satisfies ReadonlyArray<TriageBucket | "all">;

const PROVIDER_LABEL: Record<MailProvider, string> = {
  google: "Gmail",
  microsoft: "Outlook",
};

const PROVIDERS: MailProvider[] = ["google", "microsoft"];

const CONNECT_LINK_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-control bg-accent-indigo px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-indigo/90";

/**
 * Self-fetching section (own hooks, zero props) rendered inside
 * UpNextPanel's own GlassPanel — not its own card — per the settled design:
 * one continuous card containing the countdown rings/queue row and Mail
 * below it, not two stacked cards.
 */
export function MailInboxCard() {
  const [activeTab, setActiveTab] = useState<MailProvider>("google");
  const [selectedMessage, setSelectedMessage] = useState<MailMessage | null>(null);
  const [bucketFilter, setBucketFilter] = useState<TriageBucket | "all">("all");
  const { data: accounts } = useMailAccounts();
  const { data: inbox, isLoading, isFetching, refetch } = useMailMessages(activeTab);
  const disconnectMutation = useDisconnectMailAccount();

  const activeAccount = accounts?.find((account) => account.provider === activeTab);

  // Stored triage results (every non-expired item, including dismissed/acted)
  // joined to the visible messages by provider message id. Badges/filters only
  // appear for messages a manual triage run has actually classified.
  const { data: triageItems } = useEmailTriage("all");
  const triageByMessageId = useMemo(
    () => new Map((triageItems ?? []).filter((item) => item.provider === activeTab).map((item) => [item.messageId, item])),
    [triageItems, activeTab],
  );
  const bucketCounts = useMemo(() => {
    const counts = new Map<TriageBucket, number>();
    for (const message of inbox?.messages ?? []) {
      const triage = triageByMessageId.get(message.id);
      if (triage) counts.set(triage.bucket, (counts.get(triage.bucket) ?? 0) + 1);
    }
    return counts;
  }, [inbox, triageByMessageId]);
  // A filter whose bucket has no messages left (e.g. after a refresh) falls back to "all".
  const activeFilter = bucketFilter !== "all" && !bucketCounts.has(bucketFilter) ? "all" : bucketFilter;
  const visibleMessages = (inbox?.messages ?? []).filter(
    (message) => activeFilter === "all" || triageByMessageId.get(message.id)?.bucket === activeFilter,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Mail</p>
        <div role="group" aria-label="Mail provider" className="flex flex-wrap items-center gap-2">
          {PROVIDERS.map((provider) => {
            const isActive = activeTab === provider;
            return (
              <button
                key={provider}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveTab(provider)}
                className={`flex items-center gap-2 font-mono text-xs uppercase tracking-wide transition-colors ${
                  isActive ? "rounded-full bg-status-urgent py-1 pl-1.5 pr-2.5 text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <MailProviderIcon provider={provider} size={22} />
                {PROVIDER_LABEL[provider]}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !inbox?.connected ? (
        <EmptyState
          title={`Connect ${PROVIDER_LABEL[activeTab]}`}
          description={`See your recent ${PROVIDER_LABEL[activeTab]} messages here — read-only, nothing is sent on your behalf.`}
          action={
            <a href={`/api/mail/oauth/${activeTab}/start`} className={CONNECT_LINK_CLASSES}>
              <MailProviderIcon provider={activeTab} size={16} />
              Connect {PROVIDER_LABEL[activeTab]}
            </a>
          }
        />
      ) : inbox.needsReauth ? (
        <EmptyState
          title="Reconnect required"
          description={`${PROVIDER_LABEL[activeTab]} revoked access to this account. Reconnect to keep seeing messages.`}
          action={
            <a href={`/api/mail/oauth/${activeTab}/start`} className={CONNECT_LINK_CLASSES}>
              <MailProviderIcon provider={activeTab} size={16} />
              Reconnect {PROVIDER_LABEL[activeTab]}
            </a>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {activeAccount && (
              <div className="flex min-w-0 items-center gap-1.5">
                <MailProviderIcon provider={activeTab} size={16} />
                <p className="truncate font-mono text-[20px] text-text-secondary">{activeAccount.provider_email}</p>
              </div>
            )}
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
              >
                {isFetching ? "Refreshing…" : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => disconnectMutation.mutate(activeTab)}
                disabled={disconnectMutation.isPending}
                className="font-mono text-xs text-text-secondary transition-colors hover:text-status-urgent disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>

          {inbox.messages.length === 0 ? (
            <EmptyState title="Inbox zero" description={`No recent ${PROVIDER_LABEL[activeTab]} messages.`} />
          ) : (
            <>
              {bucketCounts.size > 0 && (
                <div role="group" aria-label="Filter by triage bucket" className="flex flex-wrap items-center gap-1.5">
                  {FILTERS.map((filter) => {
                    const count = filter === "all" ? inbox.messages.length : (bucketCounts.get(filter) ?? 0);
                    if (filter !== "all" && count === 0) return null;
                    const isActive = activeFilter === filter;
                    return (
                      <button
                        key={filter}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setBucketFilter(filter)}
                        className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                          isActive
                            ? "border-accent-teal text-text-primary"
                            : "border-panel-border text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {filter === "all" ? "All" : bucketLabel(filter)} {count}
                      </button>
                    );
                  })}
                </div>
              )}
              {visibleMessages.length === 0 ? (
                <p className="text-sm text-text-secondary">No messages in this bucket.</p>
              ) : (
                <ul className="flex max-h-[14rem] flex-col divide-y divide-panel-border overflow-y-auto pr-1">
                  {visibleMessages.map((message) => {
                    const triage = triageByMessageId.get(message.id);
                    return (
                      <li key={message.id} className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                        {!message.isRead && (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-ok" aria-hidden="true" />
                        )}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedMessage(message)}
                              className="min-w-0 truncate text-left text-sm text-text-primary hover:underline"
                            >
                              {message.subject}
                            </button>
                            {triage && <TriageBucketBadge bucket={triage.bucket} className="shrink-0" />}
                          </div>
                          <span className="truncate font-mono text-xs text-text-secondary">
                            {message.from} · {formatRelativeTime(new Date(message.receivedAt))}
                          </span>
                          {triage && <span className="truncate text-xs text-text-secondary">{triage.reason}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}

      <MailMessageDialog
        message={selectedMessage}
        provider={activeTab}
        onClose={() => setSelectedMessage(null)}
      />
    </div>
  );
}
