import { ClerkProvider } from "@clerk/react";
import { RouterProvider } from "react-router";
import { AuthProvider } from "./AuthContext";
import { clerkAppearance } from "./clerkAppearance";
import { router } from "./routes";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

/**
 * Shown instead of a blank page when the Clerk key is missing, because
 * <ClerkProvider> throws without one and the resulting white screen gives no
 * hint about what to fix.
 */
function MissingClerkKey() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="max-w-lg rounded border border-[#ff4444]/30 bg-[#ff4444]/5 p-6">
        <h1 className="font-['JetBrains_Mono'] text-base text-white">
          Clerk publishable key missing
        </h1>
        <p className="mt-2 font-['Archivo'] text-sm leading-relaxed text-[#aaaaaa]">
          Set <code className="font-['JetBrains_Mono'] text-[#4ade80]">VITE_CLERK_PUBLISHABLE_KEY</code>{" "}
          in <code className="font-['JetBrains_Mono']">frontend/.env</code> and restart the dev
          server. You can copy it from the Clerk Dashboard under{" "}
          <span className="text-white">Configure &rarr; API keys</span>.
        </p>
        <p className="mt-3 font-['Archivo'] text-xs text-[#666666]">
          See <code className="font-['JetBrains_Mono']">frontend/.env.example</code> for the full list.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!publishableKey) return <MissingClerkKey />;

  return (
    // Clerk sits outermost: AuthProvider consumes its hooks to resolve our own
    // user record, and every route below can read both.
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={clerkAppearance}
      signInUrl="/login"
      signUpUrl="/signup"
      afterSignOutUrl="/"
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ClerkProvider>
  );
}
