"use client";

import { createContext, use, useCallback, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "border-status-ok/40 text-status-ok",
  error: "border-status-urgent/40 text-status-urgent",
  info: "border-panel-border-hover text-text-primary",
};

const AUTO_DISMISS_MS = 5000;

const subscribeNoop = () => () => {};

/**
 * The portal target only exists client-side; server-rendering nothing and
 * then synchronously checking `typeof document` on the client's first pass
 * renders a different tree than the server did (portal appears "for free"
 * on hydration) — a real hydration mismatch. useSyncExternalStore's
 * server/client snapshot split is the React-idiomatic way to say "false
 * during SSR and the first client render, true from the second client
 * render on" without a setState-in-effect render pass.
 */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const isMounted = useIsMounted();

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, tone, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext value={{ showToast }}>
      {children}
      {isMounted &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                role={toast.tone === "error" ? "alert" : "status"}
                className={`rounded-control border bg-bg-void-elevated px-4 py-3 text-sm shadow-panel ${TONE_CLASSES[toast.tone]}`}
              >
                {toast.message}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const context = use(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
