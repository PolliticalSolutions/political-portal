# Analytics Engine — Build Notes

## What was built

### New pages (3)
- **`/portal/constituency/vulnerability`** — `VulnerabilityDashboard.jsx`
  Ranked table of all 121 Conservative 2024 seats by composite vulnerability score.
  Filters by level (Critical/High/Medium/Low) and primary threat (Labour/Reform/Lib Dem).
  Threat bars for each party. Links to constituency detail.

- **`/portal/constituency/reform-threat`** — `ReformThreatIndex.jsx`
  Top 50 Conservative seats ranked by Reform UK threat score.
  Shows Reform 2024 share, Con→Reform swing, Con majority, national context panel.

- **`/portal/alerts`** — `AlertsPage.jsx`
  Alert subscription management. Subscribe by email, choose alert types, view/remove existing.
  Stores to `alert_subscriptions` Supabase table.
  **Note:** Email delivery requires a backend service (Resend/SendGrid/AWS SES) — UI and DB layer only.

### New navigation group (PortalLayout)
- Analytics nav group with: Vulnerability, Reform Threat, My Alerts

### ConstituencyDetail.jsx enhancements (6 features)

**Feature 1 — Marginality badge in header**
- Shows colour-coded classification pill + score (e.g., "Ultra Marginal · 8.4/10")
- Colours: Ultra Marginal=red, Highly Marginal=orange, Marginal=amber, Likely=blue, Safe=green
- Fetches from `marginality_scores` table (null-safe if table doesn't exist)

**Feature 2 — Electorate Trend (Election History tab)**
- `ElectorateTrendPanel`: SVG sparkline of electorate size across all general elections
- Shows total change since earliest election, average annual growth, classification

**Feature 3 — By-election Risk badge in header**
- Colour-coded pill for Medium/High/Very High risk only (Low hidden to avoid noise)
- Fetches from `by_election_risk` table

**Feature 4 — Vulnerability badge in header**
- Colour-coded pill for Medium/High/Critical only
- Shows primary threat on MP Profile tab

**Feature 6 — Swing Timeline (Election History tab)**
- `SwingTimelinePanel`: SVG line chart of first-place vote share across all general elections
- Dots coloured by winning party hex; year labels; party legend

**Feature 8 — Local–National Alignment (Local Councils tab)**
- `LocalNationalAlignmentPanel`: shows whether local dominant party matches Westminster winner
- Aligned = green panel; Divergent = orange panel with interpretation text

**Feature 9 — MP Profile tab**
- New "MP Profile" tab in constituency detail
- Shows: elected MP, party, majority, vote share, estimated years in Parliament
- Seat intelligence summary: marginality/risk/vulnerability scores in one view
- External links: TheyWorkForYou, Parliament.uk, Electoral Calculus
- **Note:** TheyWorkForYou API key needed for rebellion rate / voting record. Register at
  https://www.theyworkforyou.com/api/key and set `VITE_TWFY_API_KEY` in environment.

**Feature 10 — Subscribe to Alerts button**
- Subscribe button wired via `addAlertSubscription()` in constituencyApi.js
- Stored in `alert_subscriptions` Supabase table

### ConstituencyIndex.jsx enhancements (Features 1, 3, 4)
- **Marginality filter**: select by classification (Safe/Likely/Marginal/Highly/Ultra Marginal)
- **Marginality column**: coloured classification in constituency table
- Analytics data loads non-blocking after main data, gracefully degrades if tables absent

### New API functions (constituencyApi.js)
14 new functions added:
- `getMarginalityScore(id)` — single constituency score
- `getAllMarginalityScores()` — all scores for index filter
- `getElectorateTrend(id)` — electorate over time
- `getSwingTimeline(id)` — winner vote share history
- `getByElectionRisk(id)` — single constituency risk
- `getHighRiskByElectionSeats()` — top 10 High/Very High seats
- `getVulnerabilityScore(id)` — single Con seat vulnerability
- `getAllVulnerabilityScores()` — all vulnerability scores
- `getReformThreatIndex()` — top 50 Reform threat records
- `getRegionalCorrelations(region)` — demographic correlations by region
- `getAlertSubscriptions(email)` — user's subscriptions
- `addAlertSubscription(...)` — add subscription
- `removeAlertSubscription(id)` — soft-delete subscription

### Python calculation scripts (4 new)
- `scripts/calculate_marginality.py` — Feature 1 scores for all 650 seats
- `scripts/calculate_by_election_risk.py` — Feature 3 risk scores for all 650 seats
- `scripts/calculate_vulnerability.py` — Feature 4 scores for 121 Con seats
- `scripts/calculate_reform_threat.py` — Feature 5 top 50 Reform threat seats
- `scripts/calculate_correlations.py` — Feature 7 Pearson correlations by region

---

## DDL — run in Supabase SQL Editor

Run each block individually:

### marginality_scores (Feature 1)
```sql
CREATE TABLE IF NOT EXISTS public.marginality_scores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_id       uuid REFERENCES constituencies(id),
  marginality_score     numeric(4,2),
  majority_pct          numeric(5,2),
  swing_deviation       numeric(5,2),
  historical_volatility numeric(5,2),
  demographic_factor    numeric(5,2),
  classification        varchar(20),
  calculated_at         timestamptz DEFAULT now()
);
ALTER TABLE public.marginality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON public.marginality_scores FOR SELECT TO anon USING (true);
```

### by_election_risk (Feature 3)
```sql
CREATE TABLE IF NOT EXISTS public.by_election_risk (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_id            uuid REFERENCES constituencies(id),
  risk_score                 numeric(4,2),
  risk_level                 varchar(20),
  majority_factor            numeric(4,2),
  council_instability_factor numeric(4,2),
  defection_risk_factor      numeric(4,2),
  polling_trend_factor       numeric(4,2),
  risk_summary               text,
  calculated_at              timestamptz DEFAULT now()
);
ALTER TABLE public.by_election_risk ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON public.by_election_risk FOR SELECT TO anon USING (true);
```

### vulnerability_scores (Feature 4)
```sql
CREATE TABLE IF NOT EXISTS public.vulnerability_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_id     uuid REFERENCES constituencies(id),
  candidate_id        uuid REFERENCES candidates(id),
  vulnerability_score numeric(4,2),
  vulnerability_level varchar(20),
  primary_threat      varchar(50),
  labour_threat       numeric(4,2),
  reform_threat       numeric(4,2),
  libdem_threat       numeric(4,2),
  calculated_at       timestamptz DEFAULT now()
);
ALTER TABLE public.vulnerability_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON public.vulnerability_scores FOR SELECT TO anon USING (true);
```

### reform_threat_index (Feature 5)
```sql
CREATE TABLE IF NOT EXISTS public.reform_threat_index (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_id         uuid REFERENCES constituencies(id),
  threat_score            numeric(4,2),
  threat_rank             int,
  con_ruk_swing           numeric(5,2),
  ruk_2024_share          numeric(5,2),
  con_majority            numeric(5,2),
  council_reform_strength numeric(4,2),
  demographic_alignment   numeric(4,2),
  calculated_at           timestamptz DEFAULT now()
);
ALTER TABLE public.reform_threat_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON public.reform_threat_index FOR SELECT TO anon USING (true);
```

### demographic_correlations (Feature 7)
```sql
CREATE TABLE IF NOT EXISTS public.demographic_correlations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region                  varchar(50),
  demographic_variable    varchar(100),
  party_id                uuid REFERENCES parties(id),
  correlation_coefficient numeric(6,4),
  sample_size             int,
  calculated_at           timestamptz DEFAULT now()
);
ALTER TABLE public.demographic_correlations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON public.demographic_correlations FOR SELECT TO anon USING (true);
```

### alert_subscriptions (Feature 10)
```sql
CREATE TABLE IF NOT EXISTS public.alert_subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email           varchar(255) NOT NULL,
  constituency_id      uuid REFERENCES constituencies(id),
  local_authority_id   uuid,
  alert_types          jsonb,
  is_active            boolean DEFAULT true,
  created_at           timestamptz DEFAULT now()
);
ALTER TABLE public.alert_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select" ON public.alert_subscriptions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert" ON public.alert_subscriptions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update" ON public.alert_subscriptions FOR UPDATE TO anon USING (true);
```

---

## Scripts to run (in order)

After all DDL is in place:

```bash
python scripts/calculate_marginality.py
python scripts/calculate_by_election_risk.py
python scripts/calculate_vulnerability.py
python scripts/calculate_reform_threat.py
python scripts/calculate_correlations.py
```

Each script is safe to re-run (deletes and reinserts). Each prints score distribution and top results.

---

## External APIs needing keys

| Feature | API | Key env var | How to get |
|---------|-----|-------------|------------|
| Feature 9 (MP Profile) | TheyWorkForYou | `VITE_TWFY_API_KEY` | https://www.theyworkforyou.com/api/key |
| Feature 10 (Email delivery) | Resend / SendGrid / SES | Service-specific | Connect serverless function to alert_subscriptions table |

---

## Feature summary vs spec

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Marginality Index | ✅ Built | DDL + script + header badge + index filter |
| 2 | Voter Registration Trends | ✅ Built | SVG sparkline in Election History tab, no new DB needed |
| 3 | By-Election Predictor | ✅ Built | DDL + script + header badge + index high-risk alerts |
| 4 | Candidate Vulnerability | ✅ Built | DDL + script + header badge + standalone dashboard |
| 5 | Reform UK Threat Index | ✅ Built | DDL + script + standalone page |
| 6 | Historical Swing Visualisation | ✅ Built | SVG winner-share timeline in Election History tab |
| 7 | Demographic Correlation Engine | ✅ Built | DDL + script (correlations by region); display panel ready in Demographics tab once data is loaded |
| 8 | Local–National Alignment | ✅ Built | Alignment panel in Local Councils tab, no new DB |
| 9 | MP Profile Pages | ✅ Built | New tab; TheyWorkForYou key needed for full data |
| 10 | Alert Subscription System | ✅ Built | DDL + subscribe/unsubscribe + My Alerts page; email delivery needs backend |

---

## Branch
`analytics-engine` — do NOT merge to main
