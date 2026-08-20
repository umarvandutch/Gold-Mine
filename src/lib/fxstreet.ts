import { MacroRelease, releases } from '@/data/releases';

const API_BASE = process.env.EXPO_PUBLIC_MACRO_API_BASE;

export async function getLatestUSReleases(): Promise<{ data: MacroRelease[]; mode: 'live' | 'demo' }> {
  if (!API_BASE) return { data: releases, mode: 'demo' };

  try {
    const response = await fetch(`${API_BASE.replace(/\/$/, '')}/releases?country=US`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Macro API returned ${response.status}`);
    const data = (await response.json()) as MacroRelease[];
    return { data, mode: 'live' };
  } catch {
    return { data: releases, mode: 'demo' };
  }
}

// Security note:
// FXStreet OAuth client secrets must stay on a backend/serverless function.
// The mobile app should only call your own authenticated proxy endpoint.
