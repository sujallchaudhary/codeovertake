import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  BadgeCheck, Check, Copy, Loader2, Lock, Mail, Search, ShieldCheck, Trophy, Unlink,
} from "lucide-react";
import {
  claimWithInstituteEmail, claimWithVerifiedPlatform, fetchClaimStatus, releaseClaim,
  startClaim, verifyClaim,
  type ClaimProofOption, type ClaimStatus,
} from "../api";
import { useAuth } from "../AuthContext";
import {
  ErrorBanner, PageHeader, PlatformGlyph, RequireAuth, Spinner,
} from "./TrackerUI";

const inputClass =
  "w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white "
  + "placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none";

/** One proof option: either an instant claim or the paste-a-code flow. */
function ProofCard({
  option, rollno, onClaimed, onError,
}: {
  option: ClaimProofOption;
  rollno: string;
  onClaimed: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState<{ code: string; field: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function instantClaim() {
    setBusy(true);
    try {
      const res = await claimWithVerifiedPlatform(rollno, option.platform);
      onClaimed(res.message);
    } catch (err: any) {
      onError(err.message || "Could not claim with that platform");
    } finally {
      setBusy(false);
    }
  }

  async function begin() {
    setBusy(true);
    try {
      const res = await startClaim(rollno, option.platform);
      setPending({ code: res.code, field: res.field });
    } catch (err: any) {
      onError(err.message || "Could not start the claim");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await verifyClaim(rollno);
      onClaimed(res.message);
    } catch (err: any) {
      onError(err.errors?.[0]?.message || err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph platform={option.platform} className="h-4 w-4" />
        <span className="font-['JetBrains_Mono'] text-sm text-white">{option.label}</span>
        <code className="rounded bg-[#1a1a1a] px-1.5 py-0.5 font-['JetBrains_Mono'] text-[11px] text-[#aaaaaa]">
          {option.maskedUsername}
        </code>
        {option.alreadyVerified && (
          <span className="ml-auto flex items-center gap-1 rounded bg-[#4ade80]/15 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] text-[#4ade80]">
            <BadgeCheck className="h-3 w-3" /> already verified
          </span>
        )}
      </div>

      {option.alreadyVerified ? (
        <>
          <p className="mb-2.5 font-['Archivo'] text-xs leading-relaxed text-[#888888]">
            You have already verified this handle on your portfolio, so we can link this profile
            straight away.
          </p>
          <button
            onClick={instantClaim}
            disabled={busy}
            className="flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Claim instantly
          </button>
        </>
      ) : !pending ? (
        <>
          <p className="mb-2.5 font-['Archivo'] text-xs leading-relaxed text-[#888888]">
            Prove you control this {option.label} account by pasting a one-time code into its{" "}
            <span className="font-['JetBrains_Mono'] text-[#aaaaaa]">{option.verificationField}</span>{" "}
            field.
          </p>
          <button
            onClick={begin}
            disabled={busy}
            className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Verify with a code
          </button>
        </>
      ) : (
        <div className="rounded border border-[#f59e0b]/25 bg-[#f59e0b]/5 p-2.5">
          <p className="font-['Archivo'] text-[11px] leading-relaxed text-[#ccaa77]">
            Paste this code into the{" "}
            <span className="font-['JetBrains_Mono'] text-[#f59e0b]">{pending.field}</span> field of
            that {option.label} profile, save it, then press Verify. You can change it back
            immediately afterwards.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-[#0a0a0a] px-2 py-1 font-['JetBrains_Mono'] text-[11px] text-[#4ade80]">
              {pending.code}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(pending.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded border border-[#1e1e1e] px-2 py-1 font-['JetBrains_Mono'] text-[10px] text-white"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={confirm}
            disabled={busy}
            className="mt-2.5 flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Verify and claim
          </button>
        </div>
      )}
    </div>
  );
}

function ClaimProfileInner() {
  const [params, setParams] = useSearchParams();
  const { user, refresh } = useAuth();

  const [rollnoInput, setRollnoInput] = useState(params.get("rollno") || user?.rollno || "");
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(async (rollno: string) => {
    const normalized = rollno.trim().toUpperCase();
    if (!normalized) return;

    setLoading(true);
    setError("");
    setSuccess("");
    setStatus(null);
    try {
      setStatus(await fetchClaimStatus(normalized));
    } catch (err: any) {
      setError(err.message || "Could not look up that roll number");
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep link support: /claim?rollno=... and the user's own claimed profile
  useEffect(() => {
    const initial = params.get("rollno") || user?.rollno;
    if (initial) lookup(initial);
    // Intentionally only on first mount / once the user record arrives
  }, [user?.rollno]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = rollnoInput.trim().toUpperCase();
    const next = new URLSearchParams(params);
    if (normalized) next.set("rollno", normalized);
    else next.delete("rollno");
    setParams(next, { replace: true });
    lookup(normalized);
  }

  async function onClaimed(message: string) {
    setSuccess(message);
    setError("");
    await refresh();
    await lookup(rollnoInput);
  }

  async function handleRelease() {
    if (!status) return;
    setBusy(true);
    setError("");
    try {
      await releaseClaim(status.rollno);
      setSuccess(`${status.rollno} is no longer linked to your account.`);
      await refresh();
      await lookup(status.rollno);
    } catch (err: any) {
      setError(err.message || "Could not release the profile");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailClaim() {
    if (!status) return;
    setBusy(true);
    setError("");
    try {
      const res = await claimWithInstituteEmail(status.rollno);
      await onClaimed(res.message);
    } catch (err: any) {
      setError(err.errors?.[0]?.message || err.message || "Could not claim with your email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Claim your leaderboard profile"
        subtitle="Take ownership of your roll number so only you can edit it."
      />

      <div className="mb-5 rounded border border-[#1e1e1e] bg-[#111111] p-4">
        <p className="font-['Archivo'] text-sm leading-relaxed text-[#aaaaaa]">
          Leaderboard profiles were created before accounts existed, so most have no owner and
          anyone who knows the roll number can edit them. Claiming yours proves it is you and locks
          editing to your account.
        </p>
      </div>

      <form onSubmit={submit} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555555]" />
          <input
            value={rollnoInput}
            onChange={(e) => setRollnoInput(e.target.value.toUpperCase())}
            placeholder="Your roll number, e.g. 2023UCS1234"
            className={`${inputClass} pl-9`}
          />
        </div>
        <button
          type="submit"
          disabled={!rollnoInput.trim() || loading}
          className="flex items-center gap-1.5 rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          Look up
        </button>
      </form>

      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2 font-['Archivo'] text-sm text-[#4ade80]">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {loading && !status && <Spinner label="Looking up that profile..." />}

      {status && (
        <div className="rounded border border-[#1e1e1e] bg-[#111111] p-5">
          {/* Record summary */}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#1e1e1e] pb-4">
            <div>
              <div className="font-['JetBrains_Mono'] text-base text-white">{status.rollno}</div>
              <div className="mt-0.5 font-['Archivo'] text-sm text-[#aaaaaa]">{status.name}</div>
              <div className="font-['JetBrains_Mono'] text-[11px] text-[#666666]">
                {status.branch} · Year {status.year}
              </div>
            </div>
            <Link
              to={`/student/${status.rollno}`}
              className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-2.5 py-1.5 font-['JetBrains_Mono'] text-[11px] text-white transition-colors hover:border-[#4ade80]"
            >
              <Trophy className="h-3 w-3" />
              View profile
            </Link>
          </div>

          {/* Already mine */}
          {status.isMine ? (
            <div>
              <div className="mb-3 flex items-center gap-2 font-['JetBrains_Mono'] text-sm text-[#4ade80]">
                <BadgeCheck className="h-4 w-4" />
                You own this profile
              </div>
              <p className="mb-4 font-['Archivo'] text-sm leading-relaxed text-[#888888]">
                Only your account can edit these usernames now, and the 24-hour edit cooldown no
                longer applies to you. It also shows on your portfolio.
              </p>
              <button
                onClick={handleRelease}
                disabled={busy}
                className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:border-[#ff4444]/50 hover:text-[#ff4444] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                Release this profile
              </button>
            </div>
          ) : status.claimed ? (
            /* Owned by someone else */
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#f59e0b]" />
              <div>
                <div className="font-['JetBrains_Mono'] text-sm text-white">
                  Already claimed
                </div>
                <p className="mt-1 font-['Archivo'] text-sm leading-relaxed text-[#888888]">
                  This profile belongs to{" "}
                  {status.claimedBy ? (
                    <Link to={`/u/${status.claimedBy.handle}`} className="text-[#4ade80]">
                      {status.claimedBy.name}
                    </Link>
                  ) : (
                    "another account"
                  )}
                  . If that is a mistake, contact an admin to have it reassigned.
                </p>
              </div>
            </div>
          ) : (
            /* Claimable */
            <div>
              <div className="mb-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                Prove it is yours
              </div>
              <p className="mb-4 font-['Archivo'] text-sm leading-relaxed text-[#888888]">
                Verify one of the coding accounts already on this record. Handles are masked here on
                purpose — you should recognise your own.
              </p>

              {status.proofOptions.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {status.proofOptions.map((option) => (
                    <ProofCard
                      key={option.platform}
                      option={option}
                      rollno={status.rollno}
                      onClaimed={onClaimed}
                      onError={setError}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3 font-['Archivo'] text-sm text-[#888888]">
                  This record has no platform handles to verify against, so the options below are
                  the only way to claim it.
                </p>
              )}

              {/* Institute email fallback */}
              <div className="mt-4 border-t border-[#1e1e1e] pt-4">
                <div className="mb-2 flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                  <Mail className="h-3 w-3" />
                  Or use your institute email
                </div>

                {status.instituteEmail.available ? (
                  <>
                    <p className="mb-2.5 font-['Archivo'] text-xs leading-relaxed text-[#888888]">
                      We can use your verified address{" "}
                      <span className="font-['JetBrains_Mono'] text-[#aaaaaa]">
                        {status.instituteEmail.email}
                      </span>
                      , as long as your account name matches the official record for this roll
                      number.
                    </p>
                    <button
                      onClick={handleEmailClaim}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80] disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                      Claim with email
                    </button>
                  </>
                ) : status.instituteEmail.domain ? (
                  <p className="font-['Archivo'] text-xs leading-relaxed text-[#666666]">
                    Add and verify an{" "}
                    <span className="font-['JetBrains_Mono'] text-[#aaaaaa]">
                      @{status.instituteEmail.domain}
                    </span>{" "}
                    address to your account to unlock this option.
                  </p>
                ) : (
                  <p className="font-['Archivo'] text-xs leading-relaxed text-[#666666]">
                    Institute email claiming is not enabled on this deployment.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ClaimProfile() {
  return (
    <RequireAuth feature="profile claiming">
      <ClaimProfileInner />
    </RequireAuth>
  );
}
