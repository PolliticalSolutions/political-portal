# Blog Automation

## Overview

The blog workflow is designed to generate at most one article every three days, keep new articles in review mode by default, and block publication unless source validation, Claude review, human review, and normal build checks all pass.

Core defaults:

- `AUTO_PUBLISH=false`
- `REQUIRE_CLAUDE_REVIEW=true`
- `REQUIRE_HUMAN_REVIEW=true`

The workflow is intentionally conservative. If a required source dossier or Claude credential is missing, the pipeline creates a handoff artifact instead of pretending the step succeeded.

## Repository layout

- `content/blog/`: blog posts consumed by the existing site.
- `content/blog-automation/topics.json`: machine-readable topic backlog.
- `content/blog-automation/research/`: per-topic source dossiers. A topic is only generation-ready when a dossier exists and validates.
- `content/blog-automation/sources/`: machine-readable source metadata per generated draft.
- `content/blog-automation/reviews/`: Claude review artifacts.
- `content/blog-automation/handoffs/`: structured generation or Claude-review handoff files when credentials or research are missing.
- `content/blog-automation/human-reviews/`: recorded human review decisions.

## Scheduling logic

The daily GitHub Action runs `npm run blog:automate`.

The scheduler:

1. Loads published posts from the existing content pipeline.
2. Checks the most recent published date.
3. Exits cleanly if fewer than three days have passed.
4. Selects the highest-priority queued or researching topic with a valid research dossier.
5. Generates a draft, validates it, runs Claude review or creates a handoff artifact, then leaves the post in review mode.
6. Never auto-publishes with the default configuration.

## Topic backlog format

Each topic in `content/blog-automation/topics.json` includes:

- `id`
- `title_seed`
- `slug_seed`
- `category`
- `target_keyword`
- `search_intent`
- `priority`
- `status`
- `notes`
- `source_requirements`
- `evergreen`
- `operational_hook`
- `audience`

Supported statuses:

- `queued`
- `researching`
- `drafted`
- `claude_reviewed`
- `human_review_required`
- `approved`
- `published`
- `failed`
- `skipped`

Add a new topic by appending a new object to `topics.json`. Keep the operational hook concrete. If the topic does not solve a real working problem for a campaign professional, it should not be in the backlog.

## Research and source requirements

The generator does not invent sources. Each topic should have a matching research dossier at `content/blog-automation/research/<topic-id>.json`.

Recommended dossier shape:

```json
{
  "topicId": "legal-register-use-rules",
  "sources": [
    {
      "id": "ec-register-guidance",
      "title": "The electoral register and absent voting lists",
      "publisher": "Electoral Commission",
      "url": "https://www.electoralcommission.org.uk/..."
    }
  ]
}
```

Validation rules:

- No source bundle: hard fail.
- Empty source list: hard fail.
- Malformed source URL: hard fail.
- Placeholder or invented-looking source entry: hard fail.
- Generated draft without inline citations: hard fail.
- Generated draft without a `## Sources` section: hard fail.

Preferred sources, in order:

1. Electoral Commission
2. Parliament and `legislation.gov.uk`
3. ONS
4. Local authority official publications
5. Government department publications
6. Other reputable institutional primary sources

## Content quality gates

The automation step blocks drafts that fail any of the following:

- Under 800 words
- Duplicate title
- Duplicate slug
- Missing required frontmatter
- Fewer than three H2 subheadings
- Missing `## Sources` section
- Missing inline citations in substantive paragraphs
- Definition-style or rhetorical-question opener
- Banned filler such as `In today's fast-paced political landscape`

The generated draft frontmatter includes:

- `title`
- `slug`
- `date`
- `publishDate`
- `description`
- `tags`
- `canonical`
- `reviewStatus`
- `claudeReviewStatus`
- `topicId`
- `sourceCount`
- `sourceBundles`
- `humanReviewRequired`
- `humanApproved`
- `automationManaged`

## Claude review stage

Claude review is implemented against the Anthropic Messages API when `ANTHROPIC_API_KEY` is configured.

Claude is asked to assess:

- factual accuracy
- unsupported claims
- missing or weak citations
- overclaiming or hallucinated phrasing
- tone and register
- structural quality
- publication recommendation: `PASS`, `REVISE`, or `FAIL`

Review output is stored in `content/blog-automation/reviews/<slug>.json`.

If credentials are unavailable, the workflow writes a handoff file to `content/blog-automation/handoffs/<slug>-claude-review.md`. That is a real block. Publication cannot proceed until a genuine Claude review result is recorded.

## Human review workflow

1. Review the generated draft in `content/blog/`.
2. Check the source bundle in `content/blog-automation/sources/`.
3. Review the Claude artifact in `content/blog-automation/reviews/` or the handoff file in `content/blog-automation/handoffs/`.
4. Use the checklist in [blog-review-checklist.md](/c:/Users/pauls/Documents/political-portal/docs/blog-review-checklist.md).
5. Record a decision:

```bash
npm run blog:approve -- --slug <slug> --reviewer "Name" --decision Publish
```

Supported decisions:

- `Publish`
- `Revise`
- `Discard`

This writes `content/blog-automation/human-reviews/<slug>.json` and updates frontmatter review metadata.

## Publishing

Publishing is a separate explicit step:

```bash
npm run blog:publish -- --slug <slug>
```

Publish only succeeds when:

- local validation passes
- Claude review recommendation is `PASS`
- human review decision is `Publish`
- build and test verification are green in normal CI

The publish step flips `draft: false`, sets `publishDate`, and updates the backlog status to `published`.

## GitHub Actions

The scheduled workflow lives at `.github/workflows/blog-automation.yml`.

It runs daily, installs dependencies, executes the scheduler, then opens a PR if draft or artifact files changed. The PR is the review surface. Nothing in the workflow publishes directly.

## Auto-publish later

Auto-publish is intentionally disabled. To allow it later, you would need to:

1. Set `AUTO_PUBLISH=true`.
2. Keep `REQUIRE_CLAUDE_REVIEW=true`.
3. Decide whether `REQUIRE_HUMAN_REVIEW` will stay on or be overridden.
4. Add an explicit publish step to the automation workflow after tests and build pass.

That change should be treated as a policy decision, not a convenience toggle.

## Rollback and disable

To disable the automation safely:

1. Disable `.github/workflows/blog-automation.yml` in GitHub.
2. Leave existing published posts untouched.
3. Remove or archive any pending automation PRs.
4. Keep the backlog and review artifacts for auditability.

## Current limitations

- Claude review requires a real `ANTHROPIC_API_KEY`.
- Article generation also uses Anthropic when credentials are present; without credentials the pipeline creates a generation handoff artifact instead of fabricating a draft.
- Source gathering is dossier-driven. The workflow will not crawl or invent sources from topic titles alone.
