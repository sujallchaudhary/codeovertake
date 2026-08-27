import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  BarChart3, Brain, Briefcase, Code2, FileText, Github, Globe, LayoutList, Linkedin,
  ListChecks, LogOut, Menu, Settings, ShieldCheck, Swords, Trophy, User, X, Zap,
} from "lucide-react";
import { useAuth } from "../AuthContext";

/** Primary sections, always visible on desktop. */
const primaryLinks = [
  { to: "/", label: "Leaderboard", icon: <Trophy className="h-3.5 w-3.5" /> },
  { to: "/workspace", label: "Workspace", icon: <ListChecks className="h-3.5 w-3.5" /> },
  { to: "/sheets", label: "Sheets", icon: <LayoutList className="h-3.5 w-3.5" /> },
  { to: "/contests", label: "Contests", icon: <Zap className="h-3.5 w-3.5" /> },
  { to: "/companies", label: "Companies", icon: <Briefcase className="h-3.5 w-3.5" /> },
];

/** Secondary sections, tucked into the "More" menu to keep the bar readable. */
const secondaryLinks = [
  { to: "/register", label: "Claim Spot", icon: <Zap className="h-3.5 w-3.5" /> },
  { to: "/headon", label: "HeadOn", icon: <Swords className="h-3.5 w-3.5" /> },
  { to: "/analytics", label: "Analytics", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { to: "/about", label: "About", icon: null },
];

/** Signed-in-only personal links. */
const accountLinks = [
  { to: "/portfolio", label: "My Portfolio", icon: <User className="h-3.5 w-3.5" /> },
  { to: "/revision", label: "Daily Revision", icon: <Brain className="h-3.5 w-3.5" /> },
  { to: "/notes", label: "My Notes", icon: <FileText className="h-3.5 w-3.5" /> },
  { to: "/claim", label: "Claim Roll Number", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { to: "/settings", label: "Edit Profile", icon: <Settings className="h-3.5 w-3.5" /> },
];

export function Layout() {
  const location = useLocation();
  const { user, isAuthenticated, signOut } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const moreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close the dropdowns on any outside click
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // Any navigation closes every menu
  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) =>
    (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  const avatar = user?.avatarUrl
    || `https://api.dicebear.com/9.x/identicon/svg?seed=${user?.handle || "guest"}`;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0a0a0a] text-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-[#1e1e1e] bg-[#0a0a0a]/90 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4 sm:h-16">
            {/* Logo */}
            <Link to="/" className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-70">
              <Code2 className="h-5 w-5 text-[#4ade80] sm:h-6 sm:w-6" strokeWidth={1.5} />
              <span className="font-['JetBrains_Mono'] text-base tracking-tight sm:text-lg">
                Code<span className="text-[#4ade80]">Overtake</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden items-center gap-5 font-['Archivo'] lg:flex">
              {primaryLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`relative flex items-center gap-1.5 text-sm transition-colors ${
                    isActive(link.to) ? "text-white" : "text-[#888888] hover:text-white"
                  }`}
                >
                  {link.icon}
                  {link.label}
                  {isActive(link.to) && (
                    <div className="absolute -bottom-4 left-0 right-0 h-[2px] bg-[#4ade80]" />
                  )}
                </Link>
              ))}

              {/* More menu */}
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className="flex items-center gap-1 text-sm text-[#888888] transition-colors hover:text-white"
                >
                  More
                  <span className="text-[10px]">▾</span>
                </button>
                {moreOpen && (
                  <div className="absolute right-0 top-full z-50 mt-3 w-44 overflow-hidden rounded border border-[#1e1e1e] bg-[#111111] py-1 shadow-xl">
                    {secondaryLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[#1a1a1a] ${
                          isActive(link.to) ? "text-[#4ade80]" : "text-[#aaaaaa] hover:text-white"
                        }`}
                      >
                        {link.icon}
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Account */}
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              {isAuthenticated ? (
                <div className="relative" ref={accountRef}>
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    className="flex items-center gap-2 rounded border border-[#1e1e1e] py-1 pl-1 pr-2.5 transition-colors hover:border-[#4ade80]"
                  >
                    <img src={avatar} alt={user?.name} className="h-6 w-6 rounded" />
                    <span className="max-w-[110px] truncate font-['JetBrains_Mono'] text-xs">
                      {user?.name}
                    </span>
                    <span className="text-[10px] text-[#888888]">▾</span>
                  </button>
                  {accountOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded border border-[#1e1e1e] bg-[#111111] py-1 shadow-xl">
                      <div className="border-b border-[#1e1e1e] px-3 py-2">
                        <div className="truncate font-['JetBrains_Mono'] text-xs text-white">
                          /u/{user?.handle}
                        </div>
                        <div className="mt-0.5 font-['Archivo'] text-[11px] text-[#666666]">
                          C-Score {user?.cScore?.total ?? 0}
                        </div>
                      </div>
                      {accountLinks.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          className="flex items-center gap-2 px-3 py-2 font-['Archivo'] text-sm text-[#aaaaaa] transition-colors hover:bg-[#1a1a1a] hover:text-white"
                        >
                          {link.icon}
                          {link.label}
                        </Link>
                      ))}
                      <button
                        onClick={signOut}
                        className="flex w-full items-center gap-2 border-t border-[#1e1e1e] px-3 py-2 font-['Archivo'] text-sm text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-[#ff6666]"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="rounded px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className="rounded bg-[#4ade80] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-[#888888] transition-colors hover:text-white lg:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-[#1e1e1e] bg-[#0a0a0a] lg:hidden">
            <div className="flex flex-col px-4 py-3 font-['Archivo']">
              {[...primaryLinks, ...secondaryLinks].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-2.5 rounded px-3 py-2.5 text-sm transition-colors ${
                    isActive(link.to)
                      ? "bg-[#4ade80]/10 text-[#4ade80]"
                      : "text-[#888888] hover:bg-[#111111] hover:text-white"
                  }`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              ))}

              <div className="my-2 h-px bg-[#1e1e1e]" />

              {isAuthenticated ? (
                <>
                  <div className="px-3 py-2 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#555555]">
                    {user?.name} · /u/{user?.handle}
                  </div>
                  {accountLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={`flex items-center gap-2.5 rounded px-3 py-2.5 text-sm transition-colors ${
                        isActive(link.to)
                          ? "bg-[#4ade80]/10 text-[#4ade80]"
                          : "text-[#888888] hover:bg-[#111111] hover:text-white"
                      }`}
                    >
                      {link.icon}
                      {link.label}
                    </Link>
                  ))}
                  <button
                    onClick={signOut}
                    className="flex items-center gap-2.5 rounded px-3 py-2.5 text-left text-sm text-[#888888] transition-colors hover:bg-[#111111] hover:text-[#ff6666]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </>
              ) : (
                <div className="flex gap-2 px-3 py-2">
                  <Link
                    to="/login"
                    className="flex-1 rounded border border-[#1e1e1e] px-3 py-2 text-center font-['JetBrains_Mono'] text-xs text-white"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className="flex-1 rounded bg-[#4ade80] px-3 py-2 text-center font-['JetBrains_Mono'] text-xs text-black"
                  >
                    Get started
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e1e1e] bg-[#0a0a0a]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* About */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-[#4ade80]" strokeWidth={1.5} />
                <span className="font-['JetBrains_Mono'] text-base tracking-tight">
                  Code<span className="text-[#4ade80]">Overtake</span>
                </span>
              </div>
              <p className="font-['Archivo'] text-sm leading-relaxed text-[#888888]">
                Track and compare coding profiles across platforms. Built for NSUT students to fuel healthy competition and growth.
              </p>
            </div>

            {/* Leaderboard */}
            <div>
              <h3 className="mb-3 font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">Leaderboard</h3>
              <div className="flex flex-col gap-2 font-['Archivo'] text-sm">
                <Link to="/" className="text-[#888888] transition-colors hover:text-white">Rankings</Link>
                <Link to="/daily-gainers" className="text-[#888888] transition-colors hover:text-white">Daily Gainers</Link>
                <Link to="/headon" className="text-[#888888] transition-colors hover:text-white">HeadOn</Link>
                <Link to="/analytics" className="text-[#888888] transition-colors hover:text-white">Analytics</Link>
                <Link to="/register" className="text-[#888888] transition-colors hover:text-white">Claim your spot</Link>
              </div>
            </div>

            {/* Tracker */}
            <div>
              <h3 className="mb-3 font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">Tracker</h3>
              <div className="flex flex-col gap-2 font-['Archivo'] text-sm">
                <Link to="/workspace" className="text-[#888888] transition-colors hover:text-white">My Workspace</Link>
                <Link to="/sheets" className="text-[#888888] transition-colors hover:text-white">Sheets</Link>
                <Link to="/revision" className="text-[#888888] transition-colors hover:text-white">Daily Revision</Link>
                <Link to="/companies" className="text-[#888888] transition-colors hover:text-white">Company Kits</Link>
                <Link to="/contests" className="text-[#888888] transition-colors hover:text-white">Contest Tracker</Link>
              </div>
            </div>

            {/* Contact */}
            <div>
              <h3 className="mb-3 font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">Built by</h3>
              <div className="font-['Archivo'] text-sm">
                <p className="text-white">Sujal Chaudhary</p>
                <p className="text-[#888888]">NSUT · CSAI · 2028</p>
                <div className="mt-3 flex items-center gap-3">
                  <a href="https://sujal.info" target="_blank" rel="noopener noreferrer" className="text-[#888888] transition-colors hover:text-white" title="Portfolio">
                    <Globe className="h-4 w-4" />
                  </a>
                  <a href="https://sujal.info/linkedin" target="_blank" rel="noopener noreferrer" className="text-[#888888] transition-colors hover:text-white" title="LinkedIn">
                    <Linkedin className="h-4 w-4" />
                  </a>
                  <a href="https://sujal.info/github" target="_blank" rel="noopener noreferrer" className="text-[#888888] transition-colors hover:text-white" title="GitHub">
                    <Github className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 border-t border-[#1e1e1e] pt-6 text-center font-['Archivo'] text-xs text-[#666666]">
            © {new Date().getFullYear()} CodeOvertake. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
