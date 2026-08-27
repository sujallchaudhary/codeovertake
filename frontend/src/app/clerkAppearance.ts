/**
 * Shared Clerk appearance so its prebuilt components match the app's dark
 * palette instead of shipping default light-theme cards.
 *
 * Colours mirror the hand-rolled Tailwind values used everywhere else:
 * #0a0a0a background, #111111 panels, #1e1e1e borders, #4ade80 accent.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#4ade80",
    colorBackground: "#111111",
    colorText: "#ffffff",
    colorTextSecondary: "#888888",
    colorInputBackground: "#0a0a0a",
    colorInputText: "#ffffff",
    colorDanger: "#ff4444",
    colorSuccess: "#4ade80",
    colorWarning: "#f59e0b",
    colorNeutral: "#ffffff",
    borderRadius: "0.25rem",
    fontFamily: "Archivo, system-ui, sans-serif",
  },
  elements: {
    rootBox: "w-full",
    card: "bg-[#111111] border border-[#1e1e1e] shadow-none",
    headerTitle: "font-['JetBrains_Mono'] text-white",
    headerSubtitle: "font-['Archivo'] text-[#888888]",

    // Social buttons ("Continue with Google", ...) are the primary path here
    socialButtonsBlockButton:
      "border border-[#1e1e1e] bg-[#0a0a0a] text-white hover:border-[#4ade80] transition-colors",
    socialButtonsBlockButtonText: "font-['JetBrains_Mono'] text-sm text-white",

    dividerLine: "bg-[#1e1e1e]",
    dividerText: "font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#555555]",

    formFieldLabel: "font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]",
    formFieldInput:
      "bg-[#0a0a0a] border border-[#1e1e1e] text-white focus:border-[#4ade80] focus:ring-0",
    formButtonPrimary:
      "bg-[#4ade80] text-black font-['JetBrains_Mono'] text-sm normal-case hover:opacity-90",

    footer: "bg-transparent",
    footerActionText: "font-['Archivo'] text-[#888888]",
    footerActionLink: "text-[#4ade80] hover:opacity-80",

    identityPreview: "bg-[#0a0a0a] border border-[#1e1e1e]",
    formFieldInputShowPasswordButton: "text-[#888888]",
    otpCodeFieldInput: "bg-[#0a0a0a] border-[#1e1e1e] text-white",

    // Account menu / profile modal
    userButtonPopoverCard: "bg-[#111111] border border-[#1e1e1e]",
    userButtonPopoverActionButton: "text-[#aaaaaa] hover:bg-[#1a1a1a] hover:text-white",
    userButtonPopoverActionButtonText: "font-['Archivo'] text-sm",
    userButtonPopoverFooter: "hidden",
    navbar: "bg-[#0a0a0a] border-r border-[#1e1e1e]",
    navbarButton: "text-[#aaaaaa] hover:text-white",
    profileSectionTitleText: "font-['JetBrains_Mono'] text-white",
    badge: "bg-[#4ade80]/15 text-[#4ade80]",
  },
} as const;
