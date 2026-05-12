# Political Solutions — Design System & Visual Identity
Last updated: May 2026

---

## Brand Positioning

Political Solutions is a **professional intelligence platform** for Conservative campaign operations. It is not a party website, not a campaign agency, and not a political blog. It is a premium SaaS product — closer in feel to a top-tier consultancy or enterprise data platform than to anything that looks like it was built overnight.

**The single sentence that should govern every design decision:**
> "This is what serious campaign professionals use."

### Brand Personality

**Primary:** Trusted and professional — commands confidence, never shouts for it.  
**Secondary:** Authoritative — the data and analysis are serious; the design should reflect that.  
**Tertiary:** Sharp and modern — not old-school Conservative, not stodgy; forward-thinking.  

**Explicitly not:** Flashy, populist, over-animated, or politically garish. If it looks like a campaign leaflet or a generic SaaS template, it is wrong.

### Political Identity

The platform serves Conservative professionals but presents as **neutral and professional in appearance**. Subtle Conservative cues are acceptable (navy, understated British gravitas, restrained palette). Overt party branding — tree logos, red-white-and-blue campaigns, anything that looks like CCHQ comms — is not appropriate. The product must look credible to a senior agent or an MP's chief of staff on first glance.

---

## Colour System

The platform uses a **split scheme**: a light, clean marketing site and a dark, data-focused portal.

### Brand Palette — The Five Values

These are the only brand colours. Everything else is utility.

| Token | Hex | Role |
|---|---|---|
| Deep Navy | `#0F2744` | Primary. Structure, authority, headers, nav. |
| Mid Navy | `#2B4C7E` | Hover states, active elements, secondary surfaces. |
| Slate | `#4A5C6E` | Second colour. Subheadings, labels, secondary UI. |
| Near-white | `#F4F6F8` | Page backgrounds. Cool undertone — not warm. |
| Utility Green | `#1A6B3C` | CTAs and success states only. Not a brand colour. |

Gold is not used. It reads as aspirational-tacky, not authoritative. If something needs to feel premium, use contrast, spacing, and typography — not colour.

### Marketing Site (Light)

```css
--color-background:       #F4F6F8;   /* Cool near-white — calm, professional */
--color-surface:          #FFFFFF;   /* Cards, panels */
--color-surface-raised:   #EBEef2;   /* Subtle panel variation */
--color-border:           #D8DDE3;   /* Borders, dividers */

--color-text-primary:     #1A1A1A;   /* Near-black */
--color-text-secondary:   #4A5C6E;   /* Slate — secondary labels, body copy */
--color-text-muted:       #7A8A96;   /* Captions, metadata */

--color-navy:             #0F2744;   /* Primary brand colour */
--color-navy-mid:         #2B4C7E;   /* Hover states, active elements */
--color-slate:            #4A5C6E;   /* Secondary accent */
--color-slate-light:      #E2E8ED;   /* Tinted slate backgrounds */

--color-cta:              #1A6B3C;   /* CTAs only */
--color-cta-hover:        #145530;

--color-danger:           #C0392B;
--color-warning:          #C0670A;
--color-success:          #1A6B3C;
--color-info:             #2B4C7E;
```

### Portal (Dark)

```css
--portal-bg:              #0D1117;   /* Near-black base */
--portal-surface:         #161B22;   /* Cards, panels */
--portal-surface-raised:  #1F2733;   /* Elevated panels, modals */
--portal-border:          #2A3441;   /* Subtle dividers */
--portal-border-strong:   #3A4D61;   /* Visible borders, table lines */

--portal-text-primary:    #E8EAF0;   /* Main text */
--portal-text-secondary:  #8A9BB0;   /* Secondary labels — cool, not warm grey */
--portal-text-muted:      #526070;   /* Metadata, disabled */

--portal-navy:            #1E3A5F;   /* Active state backgrounds, highlighted rows */
--portal-slate:           #3A5068;   /* Softer secondary surfaces */

--portal-cta:             #2ECC71;   /* Green — brighter for dark bg */
--portal-cta-hover:       #27AE60;

--portal-danger:          #E74C3C;
--portal-warning:         #E67E22;
--portal-success:         #2ECC71;

/* Chart palette — cool, data-credible, no gold */
--portal-chart-1:         #4A90D9;   /* Blue */
--portal-chart-2:         #64B5A0;   /* Teal */
--portal-chart-3:         #2ECC71;   /* Green */
--portal-chart-4:         #E74C3C;   /* Red */
--portal-chart-5:         #7F8FA6;   /* Slate-grey */
```

### Colour Rules

- **Navy is for structure** — headers, nav, section anchors. Not for body text or decoration.
- **Slate is the workhorse** — secondary text, labels, supporting UI elements. It does the quiet work.
- **Green is functional, not decorative** — CTAs, success states, confirmation. That's it.
- **No gold, ever** — if something needs to feel important, use weight, size, and spacing.
- **No purple, ever** — generic AI/SaaS cliché.
- **No gradient meshes on navy** — flat is cleaner and more authoritative.
- **Cool undertones throughout** — warm off-whites and beiges are out. This is a data platform, not a lifestyle brand.

---

## Typography

The platform uses **Proxima Nova** throughout. This is a licensed typeface — files must be self-hosted via `@font-face` in the CSS. Do not use Google Fonts fallbacks in production.

**Font files available (licensed to Political Solutions):**
- `Mark_Simonson_-_Proxima_Nova.otf` — Regular 400
- `Mark_Simonson_-_Proxima_Nova_Semibold.otf` — Semibold 600
- `Mark_Simonson_-_Proxima_Nova_Bold.otf` — Bold 700
- `Mark_Simonson_-_Proxima_Nova_It.otf` — Italic 400

**Before deploying:** Convert all four `.otf` files to `.woff2` using [Transfonter](https://transfonter.org) (free, upload all four at once, tick "woff2", download). Place the resulting `.woff2` files in `/public/fonts/`. The filenames after conversion should match those in the `@font-face` declarations below exactly — rename if needed.

```css
/* Self-hosted — /public/fonts/ */
@font-face {
  font-family: 'Proxima Nova';
  src: url('/fonts/Mark_Simonson_-_Proxima_Nova.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Proxima Nova';
  src: url('/fonts/Mark_Simonson_-_Proxima_Nova_Semibold.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Proxima Nova';
  src: url('/fonts/Mark_Simonson_-_Proxima_Nova_Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Proxima Nova';
  src: url('/fonts/Mark_Simonson_-_Proxima_Nova_It.woff2') format('woff2');
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
```

**Preload the two most-used weights in `index.html` `<head>` for performance:**
```html
<link rel="preload" href="/fonts/Mark_Simonson_-_Proxima_Nova.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Mark_Simonson_-_Proxima_Nova_Semibold.woff2" as="font" type="font/woff2" crossorigin>
```

**System fallback stack (renders until fonts load):**
```css
font-family: 'Proxima Nova', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
```

### Type Scale

```css
--text-xs:    0.75rem;    /* 12px — labels, tags, micro-copy */
--text-sm:    0.875rem;   /* 14px — captions, table cells, secondary body */
--text-base:  1rem;       /* 16px — default body */
--text-md:    1.125rem;   /* 18px — lead paragraphs, intro text */
--text-lg:    1.25rem;    /* 20px — subheadings */
--text-xl:    1.5rem;     /* 24px — section headings */
--text-2xl:   2rem;       /* 32px — page headings */
--text-3xl:   2.75rem;    /* 44px — hero headings */
--text-4xl:   3.5rem;     /* 56px — major hero, landing pages only */
```

### Type Rules

- **Hero headings (h1):** `700`, tight tracking (`letter-spacing: -0.02em`), navy or near-black.
- **Section headings (h2):** `600`, slight negative tracking (`-0.01em`).
- **Subheadings (h3):** `600`, normal tracking.
- **Body copy:** `400`, `1.6` line height, `--text-base`.
- **Data tables:** `400` or `600` for headers, `--text-sm`, tighter line height (`1.3`).
- **Labels and badges:** `600`, uppercase, `--text-xs`, tracked out (`letter-spacing: 0.08em`).
- **Never use `font-weight: 800` or `900`** — too heavy for this brand register.
- **Never use decorative italics** for headings. Italics only for citations, legal text, or emphasis within body copy.

---

## Logo

The current logo needs a full refresh. The new logo should:

- Use the wordmark **"Political Solutions"** — no strapline at small sizes.
- Optionally include a **monogram mark** (`PS`) for favicon, app icon, and portal header uses.
- Be set in **Proxima Nova Bold** or a close geometric equivalent.
- Use **navy (`#0F2744`)** as primary, with an optional **gold (`#C9A84C`)** accent on the mark only.
- Have a **light version** (navy on white) and a **dark version** (white/gold on dark) — both required.
- Avoid: shields, rosettes, flags, maps of Britain, compass roses, generic data iconography. These are clichés.
- Aim for: clean, geometric, something that could sit on a professional's desk without embarrassment.

Logo files needed:
- `logo-light.svg` — for marketing site header
- `logo-dark.svg` — for portal header, dark backgrounds
- `logo-mark.svg` — monogram only, for favicon / compact uses
- `favicon.ico` / `favicon.svg` — 32×32 minimum

---

## Spacing System

Consistent 8px base grid throughout.

```css
--space-1:   0.25rem;   /* 4px */
--space-2:   0.5rem;    /* 8px */
--space-3:   0.75rem;   /* 12px */
--space-4:   1rem;      /* 16px */
--space-5:   1.25rem;   /* 20px */
--space-6:   1.5rem;    /* 24px */
--space-8:   2rem;      /* 32px */
--space-10:  2.5rem;    /* 40px */
--space-12:  3rem;      /* 48px */
--space-16:  4rem;      /* 64px */
--space-20:  5rem;      /* 80px */
--space-24:  6rem;      /* 96px */
```

Section padding on marketing pages: `--space-20` top and bottom minimum. Premium sites breathe.

---

## Component Standards

### Buttons

Three variants only. No ghost buttons on dark backgrounds (illegible at small sizes).

```css
/* Primary — navy fill */
.btn-primary {
  background: var(--color-navy);
  color: #FFFFFF;
  font-weight: 600;
  font-size: var(--text-sm);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.75rem 1.75rem;
  border-radius: 3px;           /* Minimal radius — consultancy feel, not bubbly */
  border: none;
  transition: background 0.15s ease;
}
.btn-primary:hover { background: var(--color-navy-mid); }

/* Secondary — outlined navy */
.btn-secondary {
  background: transparent;
  color: var(--color-navy);
  border: 1.5px solid var(--color-navy);
  /* Same padding, font as primary */
}
.btn-secondary:hover { background: var(--color-navy); color: #FFFFFF; }

/* CTA — action green, used for the single most important action per page */
.btn-cta {
  background: var(--color-cta);
  color: #FFFFFF;
  /* Same padding, font as primary */
}
```

### Cards

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: var(--space-6);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
}
/* No heavy drop shadows. No rounded corners above 6px. No coloured card headers. */
```

### Data Tables (Portal)

```css
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.data-table th {
  background: var(--portal-surface-raised);
  color: var(--portal-text-secondary);
  font-weight: 600;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--portal-border-strong);
  text-align: left;
}
.data-table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--portal-border);
  color: var(--portal-text-primary);
}
.data-table tr:hover td {
  background: var(--portal-navy);
}
```

### Badges / Status Labels

```css
.badge {
  display: inline-block;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2em 0.6em;
  border-radius: 2px;
}
.badge-active    { background: #D4EDDA; color: #1A6B3C; }
.badge-warning   { background: #FDECD5; color: #7D3D00; }
.badge-danger    { background: #FDEDEC; color: #922B21; }
.badge-neutral   { background: #E2E8ED; color: #4A5C6E; }
.badge-info      { background: #D6E4F0; color: #0F2744; }
/* Portal variants use slightly brighter fills on dark bg */
```

### Navigation

**Marketing site nav:**
- White or off-white background, full width.
- Logo left, links right, single CTA button (navy or CTA green) at far right.
- Links: `--text-sm`, `600`, navy, no underlines, no hover underlines — use colour shift only.
- Sticky on scroll; add a `1px` bottom border `rgba(0,0,0,0.08)` on scroll.

**Portal sidebar:**
- Dark background (`--portal-bg`).
- Logo top-left, monogram mark acceptable here.
- Nav groups with uppercase section labels (`--text-xs`, `600`, muted).
- Active state: left border `3px solid var(--portal-accent)` + slightly lighter background.
- No icons unless they are unambiguous and necessary. Text-only is preferred.

---

## Marketing Site Layout Principles

- **Max content width:** `1200px`, centred, with `--space-6` side padding on mobile.
- **Hero section:** Full-width, off-white background, headline at `--text-3xl` or `--text-4xl`, navy. A single strong subheading at `--text-md` in secondary text. One CTA. No hero images of politicians, stock photos of people on laptops, or maps unless they are actual product screenshots.
- **Feature sections:** Alternate background colours (white, `--color-background`) for visual separation. No bordered boxes around every feature. Let whitespace do the work.
- **Product screenshots in marketing:** Use real product UI. If the portal looks good, show it. A dark portal screenshot on a light marketing page is striking and demonstrates the product exists.
- **No hero gradients** on navy — flat navy section backgrounds are cleaner and more authoritative.
- **Pricing:** Should feel confident, not apologetic. Price prominently. Don't bury it.

---

## Portal Layout Principles

- **Sidebar fixed, content scrollable** — standard pattern, no deviation.
- **Page headers:** `--text-2xl`, `700`, `--portal-text-primary`. Subtitle in `--portal-text-secondary`. Keep them short.
- **Data density is a feature** — the portal is for professionals. Do not pad it out to feel more "consumer". Tables should be dense enough to be useful on a single screen.
- **Empty states must be designed** — never show a blank white box. Empty states should explain what the section does and how to populate it.
- **Loading states** — use skeleton placeholders, not spinners on every component.
- **Alert and status banners** — stay at the top of the content area, below the page header. Navy or gold for informational; red for errors. No popups.

---

## SEO Requirements

These must be implemented on every public-facing page.

### Meta and Structured Data

Every public page must have:
```jsx
<Helmet>
  <title>{pageTitle} | Political Solutions</title>
  <meta name="description" content="{150–160 char description}" />
  <meta property="og:title" content="{pageTitle} | Political Solutions" />
  <meta property="og:description" content="{description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{canonicalUrl}" />
  <meta property="og:image" content="/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="{canonicalUrl}" />
</Helmet>
```

- OG image (`/og-image.png`): `1200×630px`, navy background, white wordmark, gold accent. Static file — not dynamically generated per page.
- Blog posts get individual OG images and article structured data.
- Portal pages are `noindex` — already handled by `noindexPrefixes` in `seoRoutes.js`. Do not add meta robots tags manually.

### Performance

- All images: WebP format, explicit `width` and `height` attributes, `loading="lazy"` except above-the-fold.
- Proxima Nova fonts: `font-display: swap`, preload the two most common weights (`400`, `600`) in `<head>`.
- No render-blocking scripts.
- Core Web Vitals targets: LCP < 2.5s, CLS < 0.1, FID < 100ms.

### Content

- Every page heading (`h1`) must be unique across the site.
- `h1` → `h2` → `h3` hierarchy must be logical — never skip levels.
- All `<img>` elements must have descriptive `alt` text.
- Internal links use descriptive anchor text — never "click here" or "read more".

---

## Tone of Voice

### The Brand Voice in Three Words

**Authoritative. Direct. Grounded.**

Political Solutions speaks like a senior professional — someone who knows their subject completely and does not need to prove it. It does not shout. It does not over-explain. It does not hedge.

### Writing Principles

**Be direct.** Lead with the point. No preamble, no "we're excited to announce", no fluffy mission statements. If the sentence can be shorter without losing meaning, make it shorter.

> ✗ "Our comprehensive constituency intelligence platform provides campaign professionals with the data-driven insights they need to make informed strategic decisions."  
> ✓ "Every constituency. Every election. One platform."

**Earn credibility, don't claim it.** Never write "world-class", "best-in-class", "cutting-edge", or "revolutionary". Show what the product does; let the reader decide.

> ✗ "Our cutting-edge AI-powered analysis delivers world-class insights."  
> ✓ "Vulnerability scores across all 650 constituencies, updated after every election cycle."

**Know the audience.** Users are Conservative agents, MPs' offices, and campaign managers. They know what a marked register is. They know what a swing is. Do not explain basic political concepts to them.

**British English throughout.** Constituencies, not districts. Councillors, not councilors. Organisation, not organization.

**Numbers are precise.** Don't round unless rounding is appropriate. "650 constituencies" not "hundreds of constituencies". "£500 + VAT" not "from £500".

### What Political Solutions Is Not

- Not a news site — do not write like a journalist
- Not a political party — do not write like a press release
- Not a startup — do not write like a pitch deck
- Not a government department — do not write like a policy document

### Microcopy Standards

- **Buttons:** Imperative verb + object. "View analysis", "Upload register", "Request access". Not "Click here to view the analysis".
- **Error messages:** State what happened and what to do. "Upload failed. Check the file is a PDF and try again." Not "An error occurred."
- **Empty states:** State what this section shows and what action populates it. "No alerts yet. The by-election monitor checks daily and will flag new risks here."
- **Loading states:** Describe what's loading. "Loading constituency data…" not just a spinner.
- **Form labels:** Descriptive, no colons. "Association name" not "Association name:".

---

## What to Avoid — The Anti-Pattern List

These are banned. If any of these exist on the site currently, they should be fixed as part of the design refresh.

| Anti-pattern | Why it's wrong |
|---|---|
| Purple gradient backgrounds | Generic AI/SaaS cliché |
| Hero sections with stock photography | Inauthentic, unprofessional |
| Rounded corners > 6px on cards | Feels like a mobile app, not a platform |
| Drop shadows > 8px blur | Looks like 2018 |
| Animated counters ("5,000+ users!") | Startup cliché |
| Testimonial carousels | Distracting and rarely read |
| Cookie banners that obscure content | UX failure |
| Multiple competing CTAs on one screen | Dilutes conversion |
| Bold used for decoration | Bold means important — use it that way |
| Sentence case inconsistency | Pick a convention, apply it everywhere |
| Hover tooltips that appear instantly | 200ms delay minimum |
| Font weight 800+ in headings | Too heavy for this brand register |
| All-caps body text | Unreadable at length |
| Blue hyperlinks in body copy | Use navy underline, not browser default blue |

---

## Implementation Notes for Claude Code / Codex

- All CSS variables go in `:root {}` in `src/index.css` — this is the existing pattern, do not break it.
- The codebase uses **pure CSS only** — no Tailwind, no CSS-in-JS. This rule does not change.
- Proxima Nova font files will be provided by the user and placed in `/public/fonts/`. The `@font-face` declarations go in `src/index.css`.
- The portal uses a dark theme — CSS variables for portal should be scoped under a `.portal-layout` class or `[data-theme="dark"]` attribute set on `PortalLayout.jsx`.
- Do not touch `src/context/PermissionsContext.jsx` or `src/lib/permissionsApi.js` during any visual refresh work.
- `paul@politicalsolutions.uk` always has full admin access — this must remain true regardless of any changes to portal UI.
- Component changes should be made to shared components in `src/components/` first, then verified on individual pages.
- Any changes to `PortalLayout.jsx` (sidebar nav, header) must be tested with both admin and non-admin user states.

---

## Prompt for Claude Code — Design Refresh Implementation

Use this prompt when handing this task to Claude Code:

---

> **Read `POLITICAL_SOLUTIONS_CONTEXT.md`, `CODEBASE_MAP.md`, and `POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md` before doing anything else.**
>
> Implement the Political Solutions design system refresh as defined in `POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md`. This is a pure CSS and component-level visual refresh — no changes to business logic, routing, auth, permissions, Lambda functions, or Supabase queries.
>
> **Scope:**
> 1. Update all CSS custom properties in `src/index.css` to match the colour and spacing tokens in the design system file.
> 2. Implement the split theme: marketing site uses light variables, portal uses dark variables scoped to `.portal-layout`.
> 3. Update `src/components/Button.jsx` to implement the three-variant button system (primary, secondary, CTA).
> 4. Update `src/components/Card.jsx` to match the card standards.
> 5. Update `src/components/Badge.jsx` to match badge standards.
> 6. Update the marketing site nav (Header component) to match nav layout principles.
> 7. Update `PortalLayout.jsx` sidebar to match portal nav standards. Test with both admin and non-admin states.
> 8. Add `@font-face` declarations for Proxima Nova to `src/index.css`. Use `font-display: swap`. Paul will place the `.woff2` files in `/public/fonts/` — placeholder declarations are fine until then; use the system fallback stack in the interim.
>
> **Constraints:**
> - Pure CSS only. No Tailwind, no CSS-in-JS, no inline style objects except for dynamic values.
> - Do not modify: `PermissionsContext.jsx`, `permissionsApi.js`, any Lambda handlers, any Supabase query functions, `App.jsx` routing, or any auth files.
> - Do not introduce any new npm packages.
> - PowerShell for all terminal commands — no `&&` operators.
> - Always target `ps-upload-api-prod` (API ID `77i4hpcez8`) if any backend work is required.
> - `paul@politicalsolutions.uk` must retain full admin access throughout.
>
> **Verify by:**
> 1. Running `npm run dev` and checking the homepage, `/portal`, and at least one constituency detail page visually.
> 2. Confirming the portal sidebar renders correctly for both admin and non-admin accounts.
> 3. Confirming all three button variants render correctly across marketing and portal pages.
> 4. Confirming font fallbacks display correctly before Proxima Nova files are added.
> 5. Run `npm run build` — it must complete without errors.

---

*End of design system file.*
