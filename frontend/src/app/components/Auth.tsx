import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Code2, Github, Loader2 } from "lucide-react";
import { useAuth } from "../AuthContext";
import { checkHandle, fetchGithubAuthUrl } from "../api";
import { ErrorBanner } from "./TrackerUI";

type Mode = "login" | "signup";

const inputClass =
  "w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white "
  + "placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none";

/** One component serves both routes; `mode` decides the copy and which fields show. */
export function Auth({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [rollno, setRollno] = useState("");

  const [handleState, setHandleState] = useState<{ status: string; reason?: string | null }>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Send people back where they came from once signed in
  const redirectTo = (location.state as { from?: string } | null)?.from || "/workspace";

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  // Debounced handle availability check (signup only)
  useEffect(() => {
    if (mode !== "signup" || handle.trim().length < 3) {
      setHandleState({ status: "idle" });
      return;
    }
    setHandleState({ status: "checking" });
    const timer = setTimeout(() => {
      checkHandle(handle.trim())
        .then((res) => setHandleState({
          status: res.available ? "available" : "unavailable",
          reason: res.reason,
        }))
        .catch(() => setHandleState({ status: "idle" }));
    }, 450);
    return () => clearTimeout(timer);
  }, [handle, mode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await signup({
          email: email.trim(),
          password,
          name: name.trim(),
          handle: handle.trim() || undefined,
          rollno: rollno.trim() || undefined,
        });
      }
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      if (Array.isArray(err.errors)) {
        const mapped: Record<string, string> = {};
        err.errors.forEach((e: any) => {
          const key = e.field || e.path;
          if (key) mapped[key] = e.message || e.msg;
        });
        setFieldErrors(mapped);
      }
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGithub() {
    setError("");
    try {
      const redirectUri = `${window.location.origin}/auth/github/callback`;
      const { url } = await fetchGithubAuthUrl(redirectUri);
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || "GitHub sign-in is not configured on this server");
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col items-center text-center">
        <Code2 className="mb-3 h-8 w-8 text-[#4ade80]" strokeWidth={1.5} />
        <h1 className="font-['JetBrains_Mono'] text-xl tracking-tight text-white">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 font-['Archivo'] text-sm text-[#888888]">
          {isSignup
            ? "Track questions, follow sheets and build a recruiter-ready portfolio."
            : "Sign in to your workspace, sheets and revision queue."}
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isSignup && (
          <div>
            <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Ada Lovelace"
              required
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-[#ff8888]">{fieldErrors.name}</p>}
          </div>
        )}

        <div>
          <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          {fieldErrors.email && <p className="mt-1 text-xs text-[#ff8888]">{fieldErrors.email}</p>}
        </div>

        <div>
          <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder={isSignup ? "At least 8 characters" : "••••••••"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
          />
          {fieldErrors.password && <p className="mt-1 text-xs text-[#ff8888]">{fieldErrors.password}</p>}
        </div>

        {isSignup && (
          <>
            <div>
              <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                Profile handle <span className="normal-case tracking-normal text-[#555555]">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="font-['JetBrains_Mono'] text-xs text-[#555555]">/u/</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  className={inputClass}
                  placeholder="auto-generated from your name"
                />
              </div>
              {handleState.status === "checking" && (
                <p className="mt-1 flex items-center gap-1 text-xs text-[#888888]">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking availability
                </p>
              )}
              {handleState.status === "available" && (
                <p className="mt-1 text-xs text-[#4ade80]">Available</p>
              )}
              {handleState.status === "unavailable" && (
                <p className="mt-1 text-xs text-[#ff8888]">
                  {handleState.reason === "invalid"
                    ? "3-30 characters: lowercase letters, numbers, hyphen or underscore"
                    : "Already taken"}
                </p>
              )}
              {fieldErrors.handle && <p className="mt-1 text-xs text-[#ff8888]">{fieldErrors.handle}</p>}
            </div>

            <div>
              <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                NSUT roll number <span className="normal-case tracking-normal text-[#555555]">(optional)</span>
              </label>
              <input
                value={rollno}
                onChange={(e) => setRollno(e.target.value.toUpperCase())}
                className={inputClass}
                placeholder="Links your portfolio to the leaderboard"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={submitting || handleState.status === "unavailable"}
          className="mt-1 flex items-center justify-center gap-2 rounded bg-[#4ade80] px-4 py-2.5 font-['JetBrains_Mono'] text-sm text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#1e1e1e]" />
        <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#555555]">or</span>
        <div className="h-px flex-1 bg-[#1e1e1e]" />
      </div>

      <button
        type="button"
        onClick={handleGithub}
        className="flex items-center justify-center gap-2 rounded border border-[#1e1e1e] px-4 py-2.5 font-['JetBrains_Mono'] text-sm text-white transition-colors hover:border-[#4ade80]"
      >
        <Github className="h-4 w-4" />
        Continue with GitHub
      </button>
      <p className="mt-2 text-center font-['Archivo'] text-xs text-[#666666]">
        GitHub sign-in also verifies your development stats automatically.
      </p>

      <p className="mt-8 text-center font-['Archivo'] text-sm text-[#888888]">
        {isSignup ? "Already have an account? " : "New to CodeOvertake? "}
        <Link
          to={isSignup ? "/login" : "/signup"}
          className="text-[#4ade80] transition-opacity hover:opacity-80"
        >
          {isSignup ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}

export function Login() {
  return <Auth mode="login" />;
}

export function Signup() {
  return <Auth mode="signup" />;
}

/**
 * Landing point for the GitHub OAuth redirect. Exchanges the `?code=` for a
 * session, then forwards into the workspace.
 */
export function GithubCallback() {
  const navigate = useNavigate();
  const { loginWithGithubCode } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setError("GitHub did not return an authorization code.");
      return;
    }
    loginWithGithubCode(code)
      .then(() => navigate("/workspace", { replace: true }))
      .catch((err: any) => setError(err.message || "GitHub sign-in failed"));
  }, [loginWithGithubCode, navigate]);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {error ? (
        <>
          <ErrorBanner message={error} />
          <Link to="/login" className="font-['JetBrains_Mono'] text-sm text-[#4ade80]">
            Back to sign in
          </Link>
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 font-['Archivo'] text-sm text-[#888888]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Completing GitHub sign-in...
        </div>
      )}
    </div>
  );
}
