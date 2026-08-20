# Task 11: Build the public blog experience

Follow `00-shared-rules.md`.

## Prerequisite

`docs/public-site-copy/04-blog-framing.md` must have explicit user approval. Otherwise stop and ask.

## Objective

Apply the approved public identity and framing copy to `/blog` and `/blog/:slug` without changing published article content or publication logic.

## Requirements

- Improve index hierarchy, article readability, metadata, navigation, code/quote/list/table styling, and meaningful next actions.
- Preserve markdown rendering, sanitisation behaviour, frontmatter, dates, authors, canonical URLs, feeds, comments, and draft filtering.
- Do not impose the homepage's dossier treatment on long-form reading where it harms legibility.
- Keep line length, focus behaviour, heading order, image alt text, and mobile typography accessible.

## Verification

- Pass 1: blog loader/rendering tests, RSS/SEO tests where relevant, representative markdown fixtures, and `npm run build`.
- Pass 2: independent desktop/mobile browser review of the index plus representative short, long, image-containing, list, quote, table, and code articles.

