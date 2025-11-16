"use client";
import React from 'react';

function sendLog(payload: any) {
  try {
    var token = (window as any).__CLIENT_LOG_TOKEN || null;
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-logs', body);
      return;
    }
    fetch('/api/client-logs', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'x-client-log-token': token } : {}),
      body: body,
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
}

type Props = { children: React.ReactNode };

export default class ErrorBoundary extends React.Component<Props, { hasError: boolean }> {
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
      return <div className="p-4">An error occurred. The team has been notified.</div>;
    }
    return this.props.children as React.ReactElement;
  }
}
