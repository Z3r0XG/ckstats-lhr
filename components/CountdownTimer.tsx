'use client';

import { useEffect, useRef, useState } from 'react';

export default function CountdownTimer({
  initialSeconds,
  onElapsed,
}: {
  initialSeconds: number;
  onElapsed?: () => void;
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
          clearInterval(timer);
          if (onElapsedRef.current) {
            onElapsedRef.current();
            return initialSeconds;
          }
          window.location.reload();
          return initialSeconds;
        }
        return prevSeconds - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [initialSeconds]);

  if (seconds === 0) {
    return <div className="badge badge-primary">Updating Now</div>;
  }
  return (
    <div className="badge badge-primary whitespace-nowrap">
      Updating in {seconds}s
    </div>
  );
}
