'use client';
import React from 'react';

function sendLog(payload: any) {
  try {
    const token = (window as any).__CLIENT_LOG_TOKEN || null;
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/client-logs', blob);
        return;
      } catch {
        // fall through to fetch
      }
    }

    fetch('/api/client-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-client-log-token': token } : {}),
      },
      body,
      keepalive: true,
    }).catch(() => {
      /* ignore */
    });
  } catch (err) {
    // Log failure to send client log, but do not throw
    // eslint-disable-next-line no-console
    console.error('[error-boundary][sendLog]', err);
  }
}

type Props = {
  children: React.ReactNode;
};

export default class ErrorBoundary extends React.Component<
  Props,
  { hasError: boolean }
> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    sendLog({
      source: 'error-boundary',
      message: error?.message,
      stack: error?.stack,
      info,
      url: typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      timestamp: new Date().toISOString(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4">
          An error occurred. The team has been notified.
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
