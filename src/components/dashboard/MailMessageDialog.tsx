"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MailProviderIcon } from "@/components/dashboard/MailProviderIcon";
import { useMailMessageDetail } from "@/hooks/useMailMessageDetail";
import { revealBlockedImages } from "@/lib/mail/reveal-blocked-images";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { MailMessage, MailProvider } from "@/lib/mail/types";

const PROVIDER_LABEL: Record<MailProvider, string> = {
  google: "Gmail",
  microsoft: "Outlook",
};

type Props = {
  message: MailMessage | null;
  provider: MailProvider;
  onClose: () => void;
};

/**
 * Reading pane for one message. Body is rendered in a sandboxed iframe as
 * defense-in-depth on top of the server-side sanitization already applied
 * in sanitize-email-html.ts — sandbox="allow-popups" (nothing else) lets a
 * real target="_blank" link open a new tab without ever letting embedded
 * content execute script or reach the parent page.
 */
export function MailMessageDialog({ message, provider, onClose }: Props) {
  const [imagesShown, setImagesShown] = useState(false);
  const { data, isLoading } = useMailMessageDetail(provider, message?.id);

  const detail = data?.message;
  const bodyHtml = detail ? (imagesShown ? revealBlockedImages(detail.sanitizedBodyHtml) : detail.sanitizedBodyHtml) : "";

  return (
    <Dialog open={Boolean(message)} onClose={onClose} title={message?.subject ?? ""} size="xl">
      {message && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-panel-border pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <MailProviderIcon provider={provider} size={20} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm text-text-primary">{message.from}</span>
                <span className="font-mono text-xs text-text-secondary">
                  {formatRelativeTime(new Date(message.receivedAt))}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {detail && (
                <button
                  type="button"
                  onClick={() => setImagesShown((shown) => !shown)}
                  className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  {imagesShown ? "Hide images" : "Show images"}
                </button>
              )}
              {message.webLink && (
                <a
                  href={message.webLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  <MailProviderIcon provider={provider} size={14} />
                  Open in {PROVIDER_LABEL[provider]}
                </a>
              )}
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-[60vh] w-full" />
          ) : data?.needsReauth ? (
            <EmptyState
              title="Reconnect required"
              description={`${PROVIDER_LABEL[provider]} revoked access to this account. Reconnect to keep reading messages.`}
              action={
                <a
                  href={`/api/mail/oauth/${provider}/start`}
                  className="inline-flex items-center justify-center gap-2 rounded-control bg-accent-indigo px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-indigo/90"
                >
                  <MailProviderIcon provider={provider} size={16} />
                  Reconnect {PROVIDER_LABEL[provider]}
                </a>
              }
            />
          ) : (
            <iframe
              title={message.subject}
              sandbox="allow-popups"
              srcDoc={bodyHtml}
              className="h-[60vh] w-full rounded-control border-0 bg-white"
            />
          )}
        </div>
      )}
    </Dialog>
  );
}
