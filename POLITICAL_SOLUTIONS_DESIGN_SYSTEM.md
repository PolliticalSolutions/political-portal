# Political Solutions — Design System & Visual Identity
Last updated: August 2026

> **Revised 13 August 2026.** The colour, typography and logo sections were
> rewritten to match the actual Political Solutions identity. The previous
> version (May 2026) specified Proxima Nova, a different navy, a green CTA and
> a logo that was never made — and contradicted itself on gold. Decks, Word
> documents, the email signature and the Instagram cards have all been on the
> identity below since August 2026; the website was the only holdout.
> Everything outside those three sections is unchanged from May.
>
> **Source of truth for brand assets:** the `Brand/` folder of Paul's
> knowledge base, and specifically `Brand/README - Logo usage.md`. If this
> file and that one ever disagree, that one wins.

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

The platform uses a **split scheme**: a light, clean marketing site and a dark, data-focused portal. Both draw on the same brand palette.

### Brand Palette

These are the only brand colours. Everything else is utility. They are the
same values used by the deck kit, the document kit and the email signature —
sampled from the source artwork, not estimated.

| Token | Hex | Role |
|---|---|---|
| Navy | `#101F36` | Primary. Structure, authority, headers, nav, dark backgrounds. |
| Navy, deep | `#0C1729` | Darker stop for gradients and the portal base. |
| Navy, mid | `#24384F` | Hover states, active elements, dividers on dark. |
| Blue | `#0087DC` | The accent. CTAs, links, active states, data highlights. |
| Blue, dark | `#005FA3` | CTA hover, table header fills. |
| Blue, light | `#41A8EC` | Highlights on dark backgrounds, secondary chart series. |
| Off-white | `#F5F7FA` | Page backgrounds; text on navy. |
| Slate | `#5B6C82` | Secondary text on light backgrounds. |
| Muted blue-grey | `#8DA0B8` | Secondary text on dark; captions, metadata. |
| Hairline | `#E1E7EE` | Borders and dividers on light. |

**Blue is the accent, not green.** The old system used a utility green for
CTAs. It was never a brand colour and it doesn't appear anywhere else in the
identity. Brand blue does the job and ties the site to every other thing the
business sends out.

Gold is not used anywhere, on anything, including the logo. It reads as
aspirational-tacky, not authoritative. If something needs to feel premium, use
contrast, spacing and typography.

### Marketing Site (Light)

```css
--color-background:       #F5F7FA;   /* Cool off-white — calm, professional */
--color-surface:          #FFFFFF;   /* Cards, panels */
--color-surface-raised:   #F4F7FA;   /* Subtle panel variation */
--color-border:           #E1E7EE;   /* Borders, dividers */

--color-text-primary:     #101F36;   /* Navy — not a separate near-black */
--color-text-secondary:   #5B6C82;   /* Slate — secondary labels, body copy */
--color-text-muted:       #8DA0B8;   /* Captions, metadata */

--color-navy:             #101F36;   /* Primary brand colour */
--color-navy-mid:         #24384F;   /* Hover states, active elements */
--color-slate:            #5B6C82;   /* Secondary accent */
--color-slate-light:      #E1E7EE;   /* Tinted backgrounds */

--color-cta:              #0087DC;   /* Brand blue — CTAs */
--color-cta-hover:        #005FA3;

--color-danger:           #C0392B;
--color-warning:          #C0670A;
--color-success:          #1A6B3C;
--color-info:             #0087DC;
```

### Portal (Dark)

```css
--portal-bg:              #0C1729;   /* Deep navy base */
--portal-surface:         #101F36;   /* Cards, panels */
--portal-surface-raised:  #1A2C46;   /* Elevated panels, modals */
--portal-border:          #24384F;   /* Subtle dividers */
--portal-border-strong:   #3A4D61;   /* Visible borders, table lines */

--portal-text-primary:    #F5F7FA;   /* Main text */
--portal-text-secondary:  #8DA0B8;   /* Secondary labels */
--portal-text-muted:      #526070;   /* Metadata, disabled */

--portal-navy:            #24384F;   /* Active row backgrounds */
--portal-slate:           #3A5068;   /* Softer secondary surfaces */

--portal-cta:             #0087DC;
--portal-cta-hover:       #41A8EC;

--portal-danger:          #E74C3C;
--portal-warning:         #E67E22;
--portal-success:         #2ECC71;

/* Chart palette — brand blue leads, then cool neutrals. No gold. */
--portal-chart-1:         #0087DC;   /* Brand blue */
--portal-chart-2:         #41A8EC;   /* Light blue */
--portal-chart-3:         #64B5A0;   /* Teal */
--portal-chart-4:         #E74C3C;   /* Red */
--portal-chart-5:         #8DA0B8;   /* Muted blue-grey */
```

### Colour Rules

- **Navy is for structure** — headers, nav, section anchors, dark panels.
- **Blue is the accent and it is used sparingly** — CTAs, links, active states, the one thing on the page you want clicked. If everything is blue, nothing is.
- **Slate is the workhorse** — secondary text, labels, supporting UI on light backgrounds. It does the quiet work.
- **`#8DA0B8` is a dark-background colour.** It's designed to sit on navy. On white it is far too pale for body copy — use `#5B6C82` there. This trips people up.
- **No gold, ever.**
- **No purple, ever** — generic AI/SaaS cliché.
- **No gradient meshes on navy** — flat is cleaner and more authoritative. The one sanctioned gradient is the deck/cover background, a straight vertical `#101F36` → `#0C1729`.
- **Cool undertones throughout** — warm off-whites and beiges are out.
- **No hardcoded hexes in components.** Use the tokens. Hardcoded colours are how a palette drifts back after it's been fixed.

---

## Typography

The platform uses **Archivo** throughout. It is licensed under the SIL Open
Font Licence 1.1 — free for web and commercial use, nothing to buy, no
licence to track.

**Load from Google Fonts.** The variable font is the right choice on the web.

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&display=swap" />
```

If self-hosting is preferred, static cuts are in `Brand/fonts/` of the
knowledge base. Note that those are named for Windows/Office (`Archivo
ExtraBold` is its own family so Word will list it) — on the web you want the
variable font and numeric weights.

**Fallback stack:**
```css
font-family: 'Archivo', 'Segoe UI', Helvetica, Arial, sans-serif;
```

**Proxima Nova has been removed.** It is a commercial typeface, serving it as
a webfont requires a webfont licence distinct from a desktop one, and it isn't
the brand typeface. Delete the `.woff2` files from `public/fonts/`.

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

- **Hero headings (h1):** `700`, tight tracking (`letter-spacing: -0.02em`), navy.
- **Section headings (h2):** `600`, slight negative tracking (`-0.01em`).
- **Subheadings (h3):** `600`, normal tracking.
- **Body copy:** `400`, `1.6` line height, `--text-base`.
- **Data tables:** `400`, or `600` for headers, `--text-sm`, tighter line height (`1.3`).
- **Labels and badges:** `600`, uppercase, `--text-xs`, tracked out (`letter-spacing: 0.08em`).
- **Weight 800 is for the logo only** — and the logo is artwork, not live text, so in practice you never set it. Don't use 800 or 900 for headings; too heavy for this register.
- **Never use decorative italics** for headings. Italics only for citations, legal text, or emphasis within body copy.

---

## Logo

The logo exists and is finished. Do not redesign it, redraw it, or set the
wordmark as live text.

**The mark** is a five-segment arc — the Commons benches and a swingometer in
one shape. The two right-hand segments are brand blue and read as seats won.
It is deliberately abstract: it belongs to a political business without being
a picture of a ballot paper.

**The wordmark** is "Political Solutions" in Archivo ExtraBold, with the
strapline "UK POLITICAL OPERATIONS PLATFORM" tracked to finish flush with the
right edge of the wordmark.

### Files

All artwork has its text **converted to vector paths**, so it renders
identically everywhere and cannot substitute to the wrong font. This matters:
the original SVGs specified a font family that almost nothing has, and the
wordmark was silently falling back to a default sans on any machine that
opened them.

| Use | File |
|---|---|
| Marketing site header | `ps-lockup-light-outlined.svg` |
| Portal header, dark backgrounds | `ps-lockup-dark-outlined.svg` |
| Anywhere under ~200px wide | `ps-lockup-notag-light-outlined.svg` / `-dark-` |
| Mark alone (compact UI, app icon) | `ps-mark-primary.svg` / `ps-mark-reversed.svg` |
| Favicon | `favicon.svg`, with PNG fallbacks |
| Social preview | `og-image.png` (1200×630) |

### Rules

- **Set width or height, never both.** The full lockup is 4.5:1, the
  no-strapline version 8.1:1. Setting both stretches it.
- **Below about 200px wide, use the no-strapline version.** The strapline is
  tracked to the wordmark's width, so at small sizes it renders under 6pt and
  becomes a grey smear. Dropping it is better than shipping illegible type.
- **Clear space:** at least the height of the arc on all sides.
- **Minimum size:** 24px for the mark alone. Below that the segment gaps close up.
- **Don't** add effects, gradients, outlines or drop shadows. Don't recolour
  outside the palette. Don't stretch. Don't re-space the lockup.
- **Don't** put "Ltd" anywhere near it — that belongs in the footer and on invoices.
- There is **no monogram and no gold accent.** Both were in the old spec; neither exists.

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

/* CTA — brand blue, used for the single most important action per page */
.btn-cta {
  background: var(--color-cta);
  color: #FFFFFF;
  /* Same padding, font as primary */
}
.btn-cta:hover { background: var(--color-cta-hover); }
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
.badge-neutral   { background: #E1E7EE; color: #5B6C82; }
.badge-info      { background: #D6E9F8; color: #005FA3; }
/* Portal variants use slightly brighter fills on dark bg */
```

### Navigation

**Marketing site nav:**
- White or off-white background, full width.
- Logo left, links right, single CTA button at far right.
- Links: `--text-sm`, `600`, navy, no underlines, no hover underlines — use colour shift only.
- Sticky on scroll; add a `1px` bottom border `rgba(0,0,0,0.08)` on scroll.
- Logo sizing: set the height (`clamp(28px, 3vw, 36px)`), let width follow.

**Portal sidebar:**
- Dark background (`--portal-bg`).
- Logo top-left — use `ps-lockup-notag-dark-outlined.svg`, or the mark alone if the sidebar collapses.
- Nav groups with uppercase section labels (`--text-xs`, `600`, muted).
- Active state: left border `3px solid var(--portal-cta)` + slightly lighter background.
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
- **Alert and status banners** — stay at the top of the content area, below the page header. Navy or blue for informational; red for errors. No popups.

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

- OG image (`/og-image.png`): `1200×630px`, navy background, reversed lockup, centred. Static file — not dynamically generated per page.
- The JSON-LD organisation logo wants a **square** image (`/logo512.png`), which is a different asset from the social card. Keep them separate — `LOGO_PATH` for schema, `OG_IMAGE_PATH` for social.
- Blog posts get individual OG images and article structured data.
- Portal pages are `noindex` — already handled by `noindexPrefixes` in `seoRoutes.js`. Do not add meta robots tags manually.

### Performance

- All images: WebP format, explicit `width` and `height` attributes, `loading="lazy"` except above-the-fold. **Exception: the logo is SVG** — it's a few KB, scales perfectly, and shouldn't be rasterised.
- Archivo: `display=swap`, loaded from Google Fonts with `preconnect`.
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
| **Hardcoded hex values in components** | How a palette silently drifts back after it's been fixed |
| **The wordmark set as live text** | It substitutes to the wrong font and nobody notices. Use the outlined SVG. |
| **`#8DA0B8` as body text on white** | It's a dark-background colour. Use `#5B6C82`. |

---

## Implementation Notes for Claude Code / Codex

- All CSS variables go in `:root {}` in `src/index.css` — this is the existing pattern, do not break it.
- The codebase uses **pure CSS only** — no Tailwind, no CSS-in-JS. This rule does not change.
- Archivo loads from Google Fonts in `index.html`. There are no self-hosted font files; `public/fonts/` should be empty.
- The portal uses a dark theme — CSS variables for portal should be scoped under a `.portal-layout` class or `[data-theme="dark"]` attribute set on `PortalLayout.jsx`.
- Do not touch `src/context/PermissionsContext.jsx` or `src/lib/permissionsApi.js` during any visual refresh work.
- `paul@politicalsolutions.uk` always has full admin access — this must remain true regardless of any changes to portal UI.
- Component changes should be made to shared components in `src/components/` first, then verified on individual pages.
- Any changes to `PortalLayout.jsx` (sidebar nav, header) must be tested with both admin and non-admin user states.
- Brand assets live in `src/assets/brand/` (SVG) and `public/` (favicons, OG card). The masters are in the `Brand/` folder of Paul's knowledge base — regenerate from there, don't edit the copies in the repo.
