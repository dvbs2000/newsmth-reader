# AGENTS.md — newsmth-reader

Minimalist local web reader for NewSMTH (`水木社区`), inspired by `Maxwin-z/xsmth-newsmth` and tailored for distraction-free desktop & responsive reading with full account read/write capabilities.

## Stack & Toolchain
- **Runtime**: Node.js `>= 22`
- **Package Manager**: `npm` (lockfile: `package-lock.json`; do not switch to yarn/pnpm)
- **Frontend**: React 19 + TypeScript + Vite + native CSS custom properties (zero heavy UI component libraries)
- **Backend (Local BFF)**: Node.js + Express + TypeScript (`tsx` in dev, compiled JS in production)
- **Upstream Strategy**: Primary `https://wap.newsmth.net/wap/*` UTF-8 JSON API; `server/nforumSlot.ts` reserves an isolated session/adapter slot for optional `www.newsmth.net/nForum` fallback features.

## Commands
- `npm install` — install dependencies
- `npm run dev` — start local BFF (`http://127.0.0.1:3174`) and Vite frontend (`http://127.0.0.1:3173`) concurrently
- `npm run build` — typecheck & build frontend (`dist/`) + server (`dist-server/`)
- `npm start` — run cross-platform single-process local production server on `http://127.0.0.1:3173`
- `npm run typecheck` — run strict TypeScript check for both frontend and server
- `npm test` — run unit & BFF integration tests (`node --test`)

## Architecture & Security Guardrails
1. **Local-Only Session Security**: Captured NewSMTH cookies are stored strictly in `.local/session.json` with `0600` file permissions and ignored by `.gitignore`. Never log raw cookie values or commit `.local/`.
2. **No CAPTCHA Bypass**: Scheme B login launches a visible local Chrome/Edge window so the user completes login & CAPTCHA manually; posting/replying/liking mounts the official Geetest v4 human-verification popup when required by upstream.
3. **XSS & Upstream HTML Safety**: Never inject raw upstream HTML with `dangerouslySetInnerHTML`. Parse into structured text/quote/link/image segments.
4. **Stealth Image Proxy**: All upstream images (`ks3`, `att.newsmth.net`, avatars) flow through `/api/proxy/image` with strict hostname allowlisting (SSRF protection) and proper `Referer`.
5. **No Commercial Fonts in Repo**: Never commit commercial TTF/OTF font files; rely on system fonts and user-imported local fonts stored under `.local/fonts/`.
6. **Visual Discipline**: Follow `DESIGN.md` strictly—single-column centered layout, reading vs UI font separation, grayscale/OLED palette, native `<dialog>` overlays, zero visual bloat.
