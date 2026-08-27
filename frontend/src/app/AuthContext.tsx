import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  fetchMe,
  login as loginRequest,
  signup as signupRequest,
  githubCallback as githubCallbackRequest,
  setAuthToken,
  getAuthToken,
  type AuthUser,
} from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  /** True only while the initial "am I signed in?" check is running. */
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (data: { email: string; password: string; name: string; handle?: string; rollno?: string }) => Promise<AuthUser>;
  loginWithGithubCode: (code: string) => Promise<AuthUser>;
  logout: () => void;
  /** Re-reads the account from the server (after edits elsewhere). */
  refresh: () => Promise<void>;
  /** Patches the cached user without a round trip. */
  patchUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(Boolean(getAuthToken()));

  // Resume a stored session on first load
  useEffect(() => {
    if (!getAuthToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchMe()
      .then(({ user: me }) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // Expired or revoked token: drop it silently
        setAuthToken(null);
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginRequest({ email, password });
    setAuthToken(session.token);
    setUser(session.user);
    return session.user;
  }, []);

  const signup = useCallback(async (data: {
    email: string; password: string; name: string; handle?: string; rollno?: string;
  }) => {
    const session = await signupRequest(data);
    setAuthToken(session.token);
    setUser(session.user);
    return session.user;
  }, []);

  const loginWithGithubCode = useCallback(async (code: string) => {
    const session = await githubCallbackRequest(code);
    setAuthToken(session.token);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const { user: me } = await fetchMe();
      setUser(me);
    } catch {
      setAuthToken(null);
      setUser(null);
    }
  }, []);

  const patchUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      signup,
      loginWithGithubCode,
      logout,
      refresh,
      patchUser,
    }),
    [user, loading, login, signup, loginWithGithubCode, logout, refresh, patchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an <AuthProvider>");
  return context;
}
