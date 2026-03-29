/**
 * Google Calendar OAuth 2.0 PKCE flow (client-side only, no backend).
 *
 * To use this integration, you need a Google Cloud project with the
 * Calendar API enabled and an OAuth 2.0 Client ID (type: Web application).
 *
 * Steps to get your own Client ID:
 * 1. Go to https://console.cloud.google.com/apis/credentials
 * 2. Create a new project (or select existing)
 * 3. Enable the "Google Calendar API" under APIs & Services > Library
 * 4. Go to APIs & Services > Credentials > Create Credentials > OAuth Client ID
 * 5. Application type: "Web application"
 * 6. Add your Beacon URL to "Authorized JavaScript origins" and
 *    "Authorized redirect URIs" (e.g. http://localhost:5173)
 * 7. Copy the Client ID and set it as VITE_GOOGLE_CLIENT_ID in your .env
 *
 * The Client ID is NOT a secret — it's safe to embed in a client-side app.
 */

import { CalendarEvent, CalendarInfo, getCalendarColor, CALENDAR_COLORS } from '../types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_KEY = 'beacon-google-token';
const REDIRECT_URI = window.location.origin + window.location.pathname;

// Google OAuth endpoints
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export interface GoogleTokenData {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  email?: string;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, length);
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

function loadToken(): GoogleTokenData | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToken(token: GoogleTokenData): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  } catch { /* ignore */ }
}

function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('beacon-google-pkce-verifier');
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns true if a Google Client ID is configured. */
export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

/** Returns the stored token data (or null). */
export function getStoredToken(): GoogleTokenData | null {
  return loadToken();
}

/** Returns true if the stored token is still valid (not expired). */
export function isTokenValid(): boolean {
  const token = loadToken();
  if (!token) return false;
  // Consider expired 60s early to avoid edge cases
  return Date.now() < token.expires_at - 60_000;
}

/**
 * Kicks off the Google OAuth PKCE sign-in flow.
 * Redirects the browser to Google's consent screen.
 */
export async function signIn(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured');
  }

  const verifier = generateRandomString(64);
  localStorage.setItem('beacon-google-pkce-verifier', verifier);

  const challenge = base64UrlEncode(await sha256(verifier));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

/**
 * Handles the OAuth redirect callback.
 * Call this on app load — it checks the URL for an authorization code.
 * Returns true if a code was found and exchanged, false otherwise.
 */
export async function handleRedirectCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;

  const verifier = localStorage.getItem('beacon-google-pkce-verifier');
  if (!verifier) return false;

  try {
    const body = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      console.error('Google token exchange failed:', await res.text());
      return false;
    }

    const data = await res.json();
    const token: GoogleTokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };

    // Fetch user email
    try {
      const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (userInfo.ok) {
        const info = await userInfo.json();
        token.email = info.email;
      }
    } catch { /* non-critical */ }

    saveToken(token);
    localStorage.removeItem('beacon-google-pkce-verifier');

    // Clean the URL (remove code & scope params)
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    return true;
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return false;
  }
}

/** Signs out by clearing the stored token. */
export function signOut(): void {
  clearToken();
}

// ---------------------------------------------------------------------------
// Authenticated API calls
// ---------------------------------------------------------------------------

async function googleFetch(path: string, params?: Record<string, string>): Promise<unknown> {
  const token = loadToken();
  if (!token) throw new Error('Not signed in to Google');

  const url = new URL(`${CALENDAR_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Calendar & Event fetching
// ---------------------------------------------------------------------------

interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status?: string;
}

/** Fetches the list of calendars for the signed-in user. */
export async function getCalendars(): Promise<CalendarInfo[]> {
  const data = (await googleFetch('/users/me/calendarList', {
    minAccessRole: 'reader',
  })) as { items: GoogleCalendarListEntry[] };

  const colorCount = Object.keys(CALENDAR_COLORS).length;

  return (data.items || []).map((cal, index) => ({
    id: `google:${cal.id}`,
    name: cal.summary,
    color: cal.backgroundColor || getCalendarColor(index + colorCount),
  }));
}

/** Fetches events from a specific Google Calendar within a time range. */
export async function getEvents(
  calendarId: string,
  start: string,
  end: string,
): Promise<CalendarEvent[]> {
  // Strip the "google:" prefix to get the real Google Calendar ID
  const googleCalId = calendarId.replace(/^google:/, '');

  const data = (await googleFetch(`/calendars/${encodeURIComponent(googleCalId)}/events`, {
    timeMin: new Date(start).toISOString(),
    timeMax: new Date(end).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })) as { items: GoogleEvent[]; summary?: string };

  const calName = data.summary || 'Google Calendar';

  return (data.items || [])
    .filter((ev) => ev.status !== 'cancelled' && ev.summary)
    .map((ev) => {
      const allDay = !!ev.start.date;
      return {
        id: `google:${ev.id}`,
        title: ev.summary || '(No title)',
        start: allDay ? ev.start.date! : ev.start.dateTime!,
        end: allDay ? ev.end.date! : ev.end.dateTime!,
        allDay,
        description: ev.description,
        calendarId,
        calendarName: calName,
        color: '#4285f4', // Google blue — will be overridden by calendar color
      };
    });
}
