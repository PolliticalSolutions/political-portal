# Blog framing copy specification

**Status:** `APPROVED BY USER — 2026-08-19`

This document specifies copy only for `/blog` and `/blog/:slug`. It does not authorise changes to
application code, styling, routes, article files, article metadata, publication status, comments,
structured data, sitemap behaviour or social assets.

The blog is framed as evidence of Political Solutions' operational expertise and working approach.
It is not a news feed, a current-affairs publication or a generic thought-leadership channel.

## 1. Page roles and action hierarchy

| Route or state | Page job | Primary action |
|---|---|---|
| `/blog` with published posts | Introduce the briefing collection and help campaign professionals find practical operational material. | **Discuss your campaign** → `/enquire?service=election-support` |
| `/blog` with no published posts | State clearly that the public collection is empty without exposing drafts or review workflow. | **Discuss your campaign** → `/enquire?service=election-support` |
| `/blog/:slug` for a published post | Present the article and its source metadata without changing the published material. | **Discuss your campaign** → `/enquire?service=election-support` |
| `/blog/:slug` for a missing or unpublished post | Avoid confirming whether a draft exists and return the visitor to the public collection. | **View all campaign briefings** → `/blog` |

The bottom action connects the operational material to Political Solutions' lead campaign-management
and consultancy offer. It must remain a single action rather than a row of product promotions.

## 2. `/blog` exact copy

### Introduction

**Eyebrow**

> Political Solutions briefings

**Heading**

> Campaign operations, from evidence to delivery

**Lead**

> Political Solutions publishes practical briefings on campaign planning, constituency evidence, data handling and delivery.

**Supporting copy**

> Each briefing focuses on a defined operational problem, the decisions campaign teams need to make and the controls that keep work on track.

### Published collection

**Section heading**

> Campaign briefings

**Introductory copy**

> Browse briefings on campaign management, constituency evidence, marked-register work and operational delivery.

### Article-card copy and metadata

Use the following template for each published post. Values in braces come from the existing post
metadata and must not be editorially rewritten by the index.

**Date line**

> Published {D MMM YYYY}

The date value is `publishDate` when present and otherwise `date`, formatted with the existing
British date formatter. For example: `Published 25 Feb 2026`.

**Title link**

> {title}

Destination: `/blog/{slug}`

**Summary**

> {description}

**Taxonomy label, shown only when tags exist**

> Topics

Display every value from `tags` without renaming, merging or adding a category. The current schema
does not define categories, topic landing pages or filters.

Do not add a generic `Read more` link. The article title is the descriptive link to the post.

### Empty collection

Show this state only when the loader returns no published posts.

**Heading**

> No campaign briefings are published yet

**Body**

> There are no published briefings to show.

The page-level related action below remains available. Do not mention drafts, approvals, automation
or a publication date.

### Related action

**Heading**

> Bring the next campaign decision into focus

**Body**

> Tell Political Solutions about the campaign, constituencies or operational challenge you are working on.

**Primary action**

> Discuss your campaign

Destination: `/enquire?service=election-support`

## 3. `/blog/:slug` exact template copy

### Published article

**Collection link**

> All campaign briefings

Destination: `/blog`

**Content-type label**

> Campaign briefing

**Publication metadata**

> Published {D MMM YYYY}

> By {author}

Use `publishDate` when present and otherwise `date`. Use the existing `author` value, including the
loader's `Political Solutions` default when a post does not supply one.

**Heading**

> {title}

**Standfirst**

> {description}

**Taxonomy label, shown only when tags exist**

> Topics

Display the existing `tags` values unchanged.

**Article body**

Render the existing Markdown or MDX content unchanged. Do not rewrite, add to or remove headings,
paragraphs, lists, citations or links inside a published article.

### Original-publication notice

Show this block only when the existing `canonical` field is non-empty.

**Label**

> Original publication

**Link**

> View the original article

Destination: the exact existing `canonical` URL.

### Optional discussion block

This block remains conditional on the existing Giscus configuration. Absence of the block is not an
empty or error state.

**Heading**

> Discussion

**Privacy helper**

> Discussion is provided through GitHub Discussions. GitHub may use cookies or local storage to remember your preferences.

### Related action

**Heading**

> Apply this briefing to your campaign

**Body**

> Discuss the campaign job, data requirement or delivery challenge you need to resolve.

**Primary action**

> Discuss your campaign

Destination: `/enquire?service=election-support`

### Missing or unpublished article

Use the same public state for an unknown slug and a post that is not published. Do not reveal draft
titles, metadata, review status or whether a matching file exists.

**Heading**

> Briefing unavailable

**Body**

> This briefing does not exist or has not been published.

**Action**

> View all campaign briefings

Destination: `/blog`

Invalid frontmatter is a build-time content error in the current loader, not a recoverable public
page state. Do not mask it with generic runtime copy.

## 4. SEO defaults

### Blog index

**Title value in `seoRoutes.js`**

> Campaign operations briefings

**Rendered title**

> Campaign operations briefings | Political Solutions

**Meta description, 151 characters**

> Practical briefings on campaign planning, constituency evidence, marked-register work and operational delivery for Conservative campaign professionals.

**Canonical URL**

> https://politicalsolutions.uk/blog

The Open Graph and Twitter title and description should use the same approved index values.

### Published article

| SEO value | Approved source |
|---|---|
| Title value | Existing frontmatter `title` |
| Rendered title | `{title} | Political Solutions` |
| Meta, Open Graph and Twitter description | Existing frontmatter `description` |
| Canonical and Open Graph URL | Existing non-empty `canonical`; otherwise `https://politicalsolutions.uk/blog/{slug}` |
| Publication state | Indexable when `draft` is false |
| Structured-data headline | Existing frontmatter `title` |
| Structured-data publication date | Existing `publishDate`; otherwise existing `date` |
| Structured-data author | Existing `author`, including the loader default |

This mapping preserves article titles, descriptions, authors, dates and canonical URLs. Task 10 does
not approve new per-article social copy or imagery.

### RSS channel

**Channel title**

> Political Solutions campaign briefings

**Channel description**

> Practical briefings on campaign planning, constituency evidence, marked-register work and operational delivery.

**Channel link**

> https://politicalsolutions.uk/blog

RSS items continue to use each published post's existing title, effective date, description and
canonical URL or self-canonical fallback. Drafts remain excluded.

### Missing or unpublished article

**Title value**

> Briefing unavailable

**Rendered title**

> Briefing unavailable | Political Solutions

**Meta description**

> This Political Solutions campaign briefing is unavailable or has not been published.

Missing and unpublished article routes must remain `noindex`. Draft previews remain a development-only
facility and must not be added to the public index, prerender routes, RSS output or sitemap.

## 5. Published-content preservation record

The following inventory records the repository state reviewed for this copy task. Approval of this
document must not alter any value in the table or any article body.

| File | Title | Effective date | Author | Tags | Publication status | Canonical |
|---|---|---|---|---|---|---|
| `content/blog/2026-02-25-campaign-data-operations-baseline.md` | Building a campaign data operations baseline | 2026-02-25 | Political Solutions | `campaigning`, `data` | Published (`draft: false`) | Self-canonical; field is empty |
| `content/blog/2026-02-20-reducing-field-team-friction-better-handoffs.md` | Reducing field-team friction with better handoffs | 2026-02-20 | Political Solutions | `operations`, `field` | Published (`draft: false`) | Self-canonical; field is empty |
| `content/blog/2026-02-24-draft-post.md` | Internal draft: volunteer rota quality checks | 2026-02-24 | Political Solutions | `operations`, `volunteers` | Unpublished (`draft: true`) | Field is empty |

No article body, title, description, author, date, tag, canonical field, slug, filename, Markdown or
publication flag is changed by this task.

## 6. Evidence and decisions

| Evidence reviewed | Established fact | Copy decision |
|---|---|---|
| `src/blog/frontmatter.js` | Title, description and date are required. Author, tags, canonical URL, publish date and review fields are supported; the author defaults to Political Solutions. | Use only supported metadata. Do not invent categories, reading times or author biographies. |
| `src/blog/blogLoader.js`; `src/blog/postDates.js`; `src/blog/formatBlogDate.js` | Posts are loaded from `content/blog/*.md` and `*.mdx`, sorted by effective date, and filtered by `draft`; dates render in `en-GB` format. | Label the effective date as `Published` and keep unpublished posts out of public collection copy. |
| `src/App.jsx`; `src/publicSite/publicRoutes.js` | The public routes are `/blog` and `/blog/:slug`. | Keep every proposed destination within the verified route set. |
| `src/pages/BlogIndexPage.jsx`; `src/pages/BlogPostPage.jsx`; `src/blog/Comments.jsx` | The current pages already expose title, description, date, author, tags, canonical notice, a conditional discussion block and a related enquiry action. | Clarify the labels and align the action with the consultancy-led proposition without changing article content. |
| `src/seo/seoRoutes.js`; `src/seo/RouteSeo.jsx`; `src/seo/Seo.jsx` | Route SEO appends the Political Solutions suffix; article SEO uses frontmatter and preserves a canonical override; missing and draft routes can be noindexed. | Specify the exact index and unavailable-state defaults and preserve the article field mapping. |
| `scripts/blog-content.mjs`; `scripts/blog-routes.mjs`; `scripts/prerender-routes.mjs`; `scripts/generate-sitemap.mjs`; `scripts/generate-rss.mjs` | Only published posts are included in generated public routes, the sitemap and the RSS feed. RSS currently has separate channel framing copy. | Do not expose drafts in index, prerender or discovery copy. Replace the generic RSS channel framing with the approved briefing language. |
| The three files under `content/blog/` | Two posts are published and one is a draft. Current tags are values, not a separate category model. | Use `Topics` as the visible taxonomy label and preserve all values. |
| `docs/blog-automation.md`; `docs/blog-review-checklist.md` | New automated material is review-gated and expected to solve a concrete working problem for campaign professionals. | Frame the collection around specific operational problems and useful decisions, not publishing cadence or commentary. |
| `PRODUCT.md`; `docs/public-site-copy/01-homepage-and-shell.md`; `02-product-pages.md`; `03-conversion-pages.md` | Political Solutions leads with data-led campaign management and consultancy, supported by distinct data capabilities. | Connect the blog to campaign work and use the approved `Discuss your campaign` action. |

## 7. Removed or rejected framing

| Wording or approach | Decision and reason |
|---|---|
| `UK Campaign Operations Blog` | Replace. It describes a publishing category but does not communicate the collection's role as operational evidence. |
| `Latest operational guidance` | Replace. `Latest` creates a news-feed expectation and becomes stale when publication is deliberately review-gated. |
| `Published notes from the Political Solutions team` | Replace. The current author schema names Political Solutions and does not establish a multi-author team. |
| `Ready to talk campaign delivery?` | Replace. It narrows the current offer to delivery and does not reflect campaign management, strategy, data or constituency work. |
| `Request a briefing` → `/enquire?service=platform-briefing` | Replace on blog pages with the already approved campaign-support action. The blog framing supports the lead consultancy proposition rather than a generic platform briefing. |
| News, updates, insights, thought leadership, trends, hot takes | Reject. These phrases position the collection as a news or generic commentary feed. |
| Latest articles, newest stories, stay informed | Reject. They imply recency is the primary value. |
| Expert, leading, definitive, essential, proven | Reject as self-awarded authority or unsupported outcome language. The articles should demonstrate expertise through useful material. |
| Categories or category filters | Do not add. The current frontmatter and loader define tags only. |
| Reading-time estimates | Do not add. The loader does not calculate or store them. |
| Rewriting internal article links to fit the new CTA | Do not do this in Task 10 or Task 11. Article Markdown is protected by this task. |

## 8. Verification record

### Pass 1: targeted source and schema comparison

Compared every proposed dynamic value and route with the frontmatter parser, blog loader, effective-date
logic, British date formatter, public routes, current index and article components, conditional Giscus
component, SEO route resolver, prerender route generator, sitemap and RSS generators and all three repository
posts. Confirmed that the proposal preserves published content and status, uses only supported metadata,
keeps drafts private, and points both conversion actions to an existing approved enquiry preset.

The first sandboxed test attempt could not load `vite.config.js` because the restricted process was
denied access to a parent directory. The same targeted suite was rerun with the required filesystem
permission and passed: 7 test files and 24 tests.

### Pass 2: independent editorial review

Reread the task and this document from the approval gate upward without relying on the first comparison.
Checked the exact copy for institutional authority, scannability, British English, metadata clarity and
the banned news, startup and generic thought-leadership language. Confirmed that the index introduces
the collection without a recency promise, the article template distinguishes content type, publication
date, author and topics, and the single related action supports the current consultancy-led proposition.

The independent loader and SEO rerun passed: 2 included test files and 10 tests. The repository's
default Vitest include pattern does not run `scripts/generate-rss.test.js`, so RSS was checked directly
against the generator: both published posts were present, the draft was absent and the separate current
channel framing was identified for replacement. Static checks found no prohibited public-name variant,
American spelling or unapproved em dash in the proposed copy; the required draft-status phrase is the
only em dash usage.

## 9. Unresolved questions

No unresolved factual question blocks approval.

1. Should the optional GitHub Discussions surface remain enabled on published articles? Existing
   conditional behaviour is preserved. The proposed `Discussion` heading and privacy helper apply only
   when it is enabled, so this editorial decision does not block approval of the remaining framing.

## 10. Approval gate

**Status:** `APPROVED BY USER — 2026-08-19`

The user approved this copy on 19 August 2026. Task 11 may implement the approved blog-page copy,
styles, metadata labels, empty states and related actions. Approval does not authorise changes to
article files, comments configuration, routes, publication status, sitemap policy or application
behaviour outside the Task 11 scope.
