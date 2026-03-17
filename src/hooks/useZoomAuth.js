import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const TOKEN_KEY = 'zoom_smart_embed_token';
const CLIENT_ID = import.meta.env.VITE_ZOOM_SMART_EMBED_CLIENT_ID;
const REDIRECT_URI = 'https://spanavi.vercel.app';

export function useZoomAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle OAuth callback: detect ?code= in URL after Zoom redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    // Remove code from URL immediately so it doesn't persist on reload
    window.history.replaceState({}, '', window.location.pathname);

    setLoading(true);
    setError(null);
    supabase.functions.invoke('zoom-smart-embed-token', { body: { code } })
      .then(({ data, error: fnError }) => {
        if (fnError || !data?.access_token) {
          setError(fnError?.message || 'Token exchange failed');
          return;
        }
        localStorage.setItem(TOKEN_KEY, data.access_token);
        setToken(data.access_token);
      })
      .finally(() => setLoading(false));
  }, []);

  const connect = () => {
    if (!CLIENT_ID) { console.error('[ZoomAuth] VITE_ZOOM_SMART_EMBED_CLIENT_ID not set'); return; }
    const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = url;
  };

  const disconnect = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  return { token, loading, error, connect, disconnect };
}
