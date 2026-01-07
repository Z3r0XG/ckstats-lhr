'use client';

import { useEffect, useRef, useState } from 'react';

export default function CountdownTimer({
  initialSeconds,
  onElapsed,
  error,
  isFetching,
}: {
  initialSeconds: number;
  onElapsed?: () => void;
  error?: Error | null;
  isFetching?: boolean;
}) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const onElapsedRef = useRef(onElapsed);

  // Keep ref up to date with latest callback
  useEffect(() => {
    onElapsedRef.current = onElapsed;
  }, [onElapsed]);

  useEffect(() => {
    setSeconds(initialSeconds);
    const timer = setInterval(() => {
      setSeconds((prevSeconds) => {
        if (prevSeconds <= 1) {
          if (onElapsedRef.current) {
            onElapsedRef.current();
          } else {
            window.location.reload();
          }
          return initialSeconds;
        }
        return prevSeconds - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [initialSeconds]);

  if (error) {
    return (
      <div
        className="badge badge-error whitespace-nowrap"
        title={error.message}
      >
        Fetch Error, Retry in {seconds}s
      </div>
    );
  }

  if (isFetching) {
    return (
      <div className="badge badge-primary whitespace-nowrap">Fetching...</div>
    );
  }

  if (seconds === 0) {
    return <div className="badge badge-primary">Updating Now</div>;
  }

  return (
    <div className="badge badge-primary whitespace-nowrap">
      Updating in {seconds}s
    </div>
  );
}
