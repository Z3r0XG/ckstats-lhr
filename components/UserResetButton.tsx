'use client';

import React, { useState } from 'react';

interface UserResetButtonProps {
  address: string;
}

const UserResetButton: React.FC<UserResetButtonProps> = ({ address }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (isLoading) return;
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/resetUser?address=${address}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to reset user');
      }

      await response.json();
      // Hard reload with cache-busting to ensure fresh data
      const url = new URL(window.location.href);
      url.searchParams.set('r', Date.now().toString());
      window.location.href = url.toString();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to reset user';
      setError(message);
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        className="btn btn-error btn-sm"
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? 'Resetting...' : 'Reset User'}
      </button>
      {error && <p className="text-error mt-2">{error}</p>}
    </div>
  );
};

export default UserResetButton;
