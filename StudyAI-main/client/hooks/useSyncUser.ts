import { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

export function useSyncUser() {
  const { user, isLoaded } = useUser();
  const rawBase = import.meta.env.VITE_API_BASE_URL || '';
  const apiBase = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

  useEffect(() => {
    if (!isLoaded || !user) return;

    // Sync user data to backend when user signs in
    const syncUser = async () => {
      try {
        const endpoint = apiBase ? `${apiBase}/api/sync-user` : '/api/sync-user';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clerk_id: user.id,
            email: user.primaryEmailAddress?.emailAddress || '',
            first_name: user.firstName || null,
            last_name: user.lastName || null,
            full_name: user.fullName || user.firstName || user.lastName || null,
            image_url: user.imageUrl || null
          })
        });

        if (response.ok) {
          console.log('User synced to database successfully');
        } else {
          console.error('Failed to sync user to database');
        }
      } catch (error) {
        console.error('Error syncing user:', error);
      }
    };

    syncUser();
  }, [user, isLoaded, apiBase]);
}

