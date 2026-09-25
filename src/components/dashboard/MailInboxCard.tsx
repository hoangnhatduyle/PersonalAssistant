"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MailMessageDialog } from "@/components/dashboard/MailMessageDialog";
import { MailProviderIcon } from "@/components/dashboard/MailProviderIcon";
import { useMailAccounts, useDisconnectMailAccount } from "@/hooks/useMailAccounts";
import { useMailMessages } from "@/hooks/useMailMessages";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { MailMessage, MailProvider } from "@/lib/mail/types";

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
  const { data: accounts } = useMailAccounts();
  const { data: inbox, isLoading, isFetching, refetch } = useMailMessages(activeTab);
  const disconnectMutation = useDisconnectMailAccount();

  const activeAccount = accounts?.find((account) => account.provider === activeTab);

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
            <ul className="flex max-h-[14rem] flex-col divide-y divide-panel-border overflow-y-auto pr-1">
              {inbox.messages.map((message) => (
                <li key={message.id} className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                  {!message.isRead && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-ok" aria-hidden="true" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedMessage(message)}
                      className="truncate text-left text-sm text-text-primary hover:underline"
                    >
                      {message.subject}
                    </button>
                    <span className="truncate font-mono text-xs text-text-secondary">
                      {message.from} · {formatRelativeTime(new Date(message.receivedAt))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
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
