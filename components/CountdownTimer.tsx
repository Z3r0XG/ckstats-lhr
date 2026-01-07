'use client';

import { useEffect, useState } from 'react';

export default function CountdownTimer({
  initialSeconds,
  onElapsed,
}: {
  initialSeconds: number;
  onElapsed?: () => void;
}) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
    const timer = setInterval(() => {
      setSeconds((prevSeconds) => {
        if (prevSeconds <= 1) {
          clearInterval(timer);
          if (onElapsed) {
            onElapsed();
            return initialSeconds;
          }
          window.location.reload();
          return initialSeconds;
        }
        return prevSeconds - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [initialSeconds, onElapsed]);

  if (seconds === 0) {
    return <div className="badge badge-primary">Updating Now</div>;
  }
  return (
    <div className="badge badge-primary whitespace-nowrap">
      Updating in {seconds}s
    </div>
  );
}
