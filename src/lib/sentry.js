import * as Sentry from "@sentry/react";

let enabled = false;

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!import.meta.env.PROD || !dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
  enabled = true;
}

export function isSentryEnabled() {
  return enabled;
}

export function captureException(error) {
  if (enabled) {
    Sentry.captureException(error);
  }
}
