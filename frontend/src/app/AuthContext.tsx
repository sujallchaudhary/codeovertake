import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth as useClerkAuth, useUser as useClerkUser } from "@clerk/react";
import { fetchMe, setTokenProvider, type AuthUser } from "./api";

/**
 * Bridges Clerk's session to the rest of the app.
 *
 * Clerk owns authentication; this context owns the *local* user record (handle,
 * portfolio, platform links, claimed roll number) that our API returns from
 * `/auth/me`. The backend provisions that record just in time on the first
 * authenticated request, so there is no separate "create profile" step.
 */
interface AuthContextValue {
  /** Local mirror of the account, or null when signed out. */
  user: AuthUser | null;
  /** True while either Clerk or our own /auth/me lookup is still resolving. */
  loading: boolean;
  isAuthenticated: boolean;
  /** Present when the account has a verified leaderboard profile. */
  claimedRollno: string | null;
  signOut: () => void;
  /** Re-reads the account from our API (after edits or a claim). */
  refresh: () => Promise<void>;
  /** Patches the cached user without a round trip. */
  patchUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(false);

  /**
   * Hand the API client a way to fetch a fresh Clerk token per request.
   * Clerk rotates short-lived session tokens in the background, so caching a
   * string would go stale; `getToken()` always returns a usable one.
   */
  useEffect(() => {
    setTokenProvider(() => getToken());
    return () => setTokenProvider(null);
  }, [getToken]);

  // Resolve (or clear) the local account whenever the Clerk session changes
  useEffect(() => {
    if (!clerkLoaded) return;

    if (!isSignedIn) {
      setUser(null);
      setLoadingLocal(false);
      return;
    }

    let cancelled = false;
    setLoadingLocal(true);
    fetchMe()
      .then(({ user: me }) => {
        if (!cancelled) setUser(me);
      })
      .catch((err) => {
        // Signed in with Clerk but our API rejected it (misconfigured keys, or
        // the backend is down). Surface as signed-out rather than half-broken.
        console.error("Could not load your CodeOvertake profile:", err?.message || err);
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingLocal(false);
      });

    return () => {
      cancelled = true;
    };
    // clerkUser?.id changes on account switch; primaryEmailAddress on email edit
  }, [clerkLoaded, isSignedIn, clerkUser?.id, clerkUser?.primaryEmailAddress?.emailAddress]);

  const refresh = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const { user: me } = await fetchMe();
      setUser(me);
    } catch (err) {
      console.error("Could not refresh your profile:", err);
    }
  }, [isSignedIn]);

  const patchUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    void clerkSignOut();
  }, [clerkSignOut]);

  const value = useMemo(
    () => ({
      user,
      loading: !clerkLoaded || loadingLocal,
      isAuthenticated: Boolean(isSignedIn && user),
      claimedRollno: user?.rollno || null,
      signOut,
      refresh,
      patchUser,
    }),
    [user, clerkLoaded, loadingLocal, isSignedIn, signOut, refresh, patchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an <AuthProvider>");
  return context;
}
