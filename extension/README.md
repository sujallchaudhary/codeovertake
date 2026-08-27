# CodeOvertake browser extension

Save a problem to your workspace without leaving the problem page.

## What it does

- Lights up the toolbar icon with a green `+` on any recognised problem page
- Resolves the problem through the API, so title, difficulty and topics are
  filled in for you
- Saves to your workspace, optionally **as solved**, **starred** and **tagged**
- Adds the problem to any sheet you own or follow
- Attaches a note that is linked to the problem, so it shows up on every other
  question you link that note to

Supported: LeetCode, Codeforces, CodeChef, GeeksforGeeks, AtCoder, HackerRank,
InterviewBit, Code360 (Naukri / Coding Ninjas) and SPOJ.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension/` folder.
3. Open the extension's **Settings** (link in the popup, or the options page).
4. Set the **API base URL** — include the `/api` suffix, e.g.
   `http://localhost:5000/api` for local development.
5. In the web app go to **Edit profile → Extension**, copy the pairing token,
   paste it here, then press **Test connection**.

Firefox works the same way via `about:debugging` → **Load Temporary Add-on**.

## Why a pairing token instead of a login?

The extension cannot refresh a short-lived session JWT, so it authenticates with
a long-lived token scoped to your account. It is accepted by the same
`requireAuth` middleware as a normal session (see
`backend/middlewares/auth.js`). Rotating the token from the web app immediately
invalidates every existing install.
