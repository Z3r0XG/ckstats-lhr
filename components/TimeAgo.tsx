"use client";

import React, { useEffect, useState } from 'react';
import { formatTimeAgo } from '../utils/helpers';

interface TimeAgoProps {
  timestamp: string | number | Date;
  minDiff?: number;
}

export default function TimeAgo({ timestamp, minDiff = 1 }: TimeAgoProps) {
  const getText = () => formatTimeAgo(new Date(timestamp), minDiff);
  const [text, setText] = useState<string>(() => getText());

  useEffect(() => {
    // Update on mount in case server rendered value is stale
    setText(getText());
    // Update every 60s while mounted to keep relative time fresh
    const id = setInterval(() => setText(getText()), 60000);
    return () => clearInterval(id);
  }, [timestamp, minDiff]);

  return <span>{text}</span>;
}
