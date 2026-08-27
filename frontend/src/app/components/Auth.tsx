import { SignIn, SignUp } from "@clerk/react";
import { Code2 } from "lucide-react";

/**
 * Sign-in and sign-up are Clerk's prebuilt components.
 *
 * Which providers appear here ("Continue with Google", GitHub, and so on) is
 * controlled entirely from the Clerk Dashboard under User & Authentication >
 * Social Connections - adding one needs no code change. Styling comes from the
 * shared `clerkAppearance` object.
 *
 * Both routes are mounted as splats (`/login/*`, `/signup/*`) because Clerk
 * renders its multi-step flows - SSO callback, second factor, email
 * verification - as nested paths beneath the base URL.
 */
function AuthShell({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col items-center text-center">
        <Code2 className="mb-3 h-8 w-8 text-[#4ade80]" strokeWidth={1.5} />
        <h1 className="font-['JetBrains_Mono'] text-xl tracking-tight text-white">{title}</h1>
        <p className="mt-1.5 font-['Archivo'] text-sm text-[#888888]">{subtitle}</p>
      </div>

      {children}

      <p className="mt-8 max-w-sm text-center font-['Archivo'] text-xs leading-relaxed text-[#666666]">
        Already on the leaderboard? After signing in you can claim your roll number
        from your profile to take ownership of it.
      </p>
    </div>
  );
}

export function Login() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace, sheets and revision queue."
    >
      <SignIn routing="path" path="/login" signUpUrl="/signup" fallbackRedirectUrl="/workspace" />
    </AuthShell>
  );
}

export function Signup() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Track questions, follow sheets and build a recruiter-ready portfolio."
    >
      <SignUp routing="path" path="/signup" signInUrl="/login" fallbackRedirectUrl="/workspace" />
    </AuthShell>
  );
}
