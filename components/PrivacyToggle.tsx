'use client';

import React from 'react';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

interface PrivacyToggleProps {
  address: string;
  initialIsPublic: boolean;
}

const PrivacyToggle: React.FC<PrivacyToggleProps> = ({
  address,
  initialIsPublic,
}) => {
  const router = useRouter();
  const [isPublic, setIsPublic] = React.useState(initialIsPublic);
  const [loadingState, setLoadingState] = React.useState(true);

  // Fetch authoritative privacy state on mount (no-store so it bypasses server HTML cache)
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch(`/api/users/privacy?address=${address}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!resp.ok) throw new Error('Failed to fetch privacy');
        const json = await resp.json();
        if (mounted && typeof json.isPublic === 'boolean') {
          setIsPublic(Boolean(json.isPublic));
        }
      } catch (err) {
        // keep initialIsPublic as fallback
        console.error('privacy fetch error', err);
      } finally {
        if (mounted) setLoadingState(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [address]);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/users/togglePrivacy?address=${address}`,
        {
          method: 'POST',
        }
      );
      if (!response.ok) {
        throw new Error('Failed to toggle privacy');
      }
      return response.json();
    },
    onMutate: async () => {
      // optimistic update
      setIsPublic((v) => !v);
    },
    onSuccess: (data) => {
      setIsPublic(Boolean(data.isPublic));
      // refresh server components for the current route so SSR fragments update
      try {
        router.refresh();
      } catch {
        // ignore router refresh failures
      }
    },
    onError: (error) => {
      console.error('Error toggling privacy:', error);
    },
  });

  return (
    <div>
      <button
        className={`btn btn-sm btn-primary ${isPublic ? '' : 'btn-outline'}`}
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || loadingState}
      >
        {isPublic ? 'Make Private' : 'Make Public'}
      </button>
      {mutation.isError && (
        <p className="text-error mt-2">Failed to update privacy setting.</p>
      )}
    </div>
  );
};

export default PrivacyToggle;
