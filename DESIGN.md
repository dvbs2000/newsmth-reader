# DESIGN.md — newsmth-reader Visual & Interaction System

Inspired by `Maxwin-z/xsmth-newsmth`, built from scratch for calm, ultra-readable desktop & responsive web browsing.

## 1. Philosophy: Quiet Paper & Ink
- **Content first, chrome invisible**: No hero banners, decorative gradients, marketing cards, heavy shadows, or noisy badges. Reading a thread should feel like reading clean monochrome prose or a minimalist code editor.
- **Single-column centered flow**: On every viewport width (wide Mac monitor, split window, tablet, mobile), content stays in a focused centered column (`--col-width: 720px`, adjustable to `640px` / `720px` / `820px`) with generous breathing margins and a slide-out **Left Drawer** (authentic `xsmth` navigation).
- **Stealth & focus ("摸鱼友好")**: Default to pure-text reading (avatars hidden by default, client signatures stripped, quoted blocks collapsed behind a subtle toggle) and smart image gating (collapsed pill or muted grayscale mini-thumbnail until clicked).

## 2. Color Tokens (Faithful to `xsmth` `SMTheme.m`)

| Token | Light (`light`) | Dark (`dark`) | OLED Black (`oled`) | Role |
|---|---|---|---|---|
| `--bg` | `#FCFCFC` | `#1E1E20` | `#000000` | Page canvas |
| `--surface` | `#FFFFFF` | `#262628` | `#0C0C0D` | Sticky topbar, drawer, dialog surface |
| `--surface-subtle` | `#F4F4F5` | `#2E2E31` | `#151517` | Hover row, quote block, input bg |
| `--border` | `#E6E6E8` | `#353539` | `#222225` | 1px hairlines (≥3:1 against interactive targets) |
| `--text` | `#2B2B2D` | `#D4D4D8` | `#C8C8CC` | Primary body ink (WCAG ≥ 10:1) |
| `--text-muted` | `#66666A` | `#94949B` | `#8A8A91` | Metadata, timestamps, counts (WCAG ≥ 4.8:1) |
| `--text-quote` | `#7A7A80` | `#7E7E85` | `#74747B` | Collapsed/expanded quote text |
| `--text-read` | `#9A9AA0` | `#696970` | `#606066` | Already-read topic titles |
| `--accent` | `#1C00CE` | `#8F9BFF` | `#8F9BFF` | Sparingly used: active indicator, OP tag, links |
| `--accent-soft` | `rgba(28,0,206,0.08)` | `rgba(143,155,255,0.14)` | `rgba(143,155,255,0.14)` | Subtle focus/active wash |
| `--danger` | `#B91C1C` | `#F87171` | `#F87171` | Delete / error states |

- `<meta name="color-scheme" content="light dark">` plus inline anti-FOUC theme bootstrap in `index.html`.

## 3. Typography & Rhythm
- **Font Stack**:
  - Primary UI & Reading: `"PingFang SC", "Hiragino Sans GB", -apple-system, BlinkMacSystemFont, "Noto Sans SC", "Helvetica Neue", sans-serif` (light/regular weight crispness echoing `FZLanTingHei-L-GBK`).
  - Mono / Tabular Meta: `ui-monospace, "SF Mono", Menlo, monospace` with `font-variant-numeric: tabular-nums` for floor numbers (`#1`, `#2`), reply counts, timestamps, and keyboard shortcut hints.
- **Scale** (3 disciplined levels, user-adjustable base `--font-size-body`: `14px` / `15.5px` default / `17px` / `19px`):
  - Page / Thread Title: `1.2rem`, weight `600`, line-height `1.4`
  - Feed Row Title / Floor Body: `var(--font-size-body)`, weight `400`, line-height `1.72` (thread body) / `1.45` (list)
  - Metadata / Hairline Labels: `0.78rem` (`12.5px`), weight `400`, `tabular-nums`
- **Spacing**: 4px base grid (`4 / 8 / 12 / 16 / 20 / 28px`). Top bar fixed at `48px`. Hairline dividers (`1px solid var(--border)`) instead of nested boxes.

## 4. Components, Overlays & Motion
- **Overlays**: Modals, Command Palette (`/`), Login Dialog, Composer, and Image Lightbox use native `<dialog>` + `showModal()`, `overscroll-behavior: contain`, backdrop click-to-dismiss, and `@starting-style` + `transition-behavior: allow-discrete` transitions.
- **Motion**: Only animate `transform` and `opacity` (`160ms–220ms cubic-bezier(0.2, 0.8, 0.2, 1)`). Respect `prefers-reduced-motion: reduce`. Never use `transition: all`.
- **Accessibility & Performance**:
  - Interactive touch/click targets `>= 32px`.
  - Clear `:focus-visible` ring (`2px solid var(--accent); outline-offset: 2px`).
  - Offscreen thread floors use `content-visibility: auto; contain-intrinsic-size: auto 160px;` and images use `loading="lazy"`.

## 5. Keyboard-First Navigation Map
- `/` or `Space` (on list views): Open Quick Board Jump / Command Palette
- `J` / `K`: Move selection down / up (topic list or thread floors)
- `Enter`: Open focused topic
- `Esc`: Close dialog/drawer, or go back from Thread → Board/Home
- `O`: Toggle Only-OP (`只看楼主`) inside a thread
- `R`: Open Reply Composer inside a thread (`N` on Board to post new topic)
- `D`: Cycle theme (`Light → Dark → OLED`)
- `I`: Cycle image mode (`Collapsed → Stealth Thumb → Auto`)
- `[` / `]`: Previous / Next page
- `?`: Show keyboard shortcuts dialog
