INSERT INTO data_sources (name, publisher, source_type, description, website_url)
VALUES
  (
    'House of Commons Library constituency results',
    'UK Parliament',
    'official',
    'General election constituency result reference data used for Westminster seat analysis.',
    'https://commonslibrary.parliament.uk/'
  ),
  (
    'ONS census and electorate reference data',
    'Office for National Statistics',
    'official',
    'Demographic and electorate reference datasets used in constituency intelligence outputs.',
    'https://www.ons.gov.uk/'
  ),
  (
    'Local authority political control returns',
    'Local authorities',
    'official',
    'Authority composition, control, and election updates used in local government intelligence.',
    'https://www.gov.uk/find-local-council'
  )
ON CONFLICT DO NOTHING;

INSERT INTO scoring_model_versions (
  model_key,
  version_label,
  display_name,
  status,
  summary,
  methodology_notes,
  released_at
)
VALUES
  (
    'vulnerability',
    'v1.0',
    'Conservative Seat Vulnerability',
    'active',
    'Composite seat vulnerability model covering majority exposure, opposition threat, and local pressure factors.',
    'Initial production baseline for demo and analyst review.',
    timezone('utc', now())
  ),
  (
    'reformThreat',
    'v1.0',
    'Reform UK Threat Index',
    'active',
    'Composite threat model for Conservative seats most exposed to Reform UK gains or vote splitting pressure.',
    'Initial production baseline for demo and analyst review.',
    timezone('utc', now())
  ),
  (
    'byElectionRisk',
    'v1.0',
    'By-Election Risk Model',
    'active',
    'Composite near-term instability model highlighting seats with elevated by-election trigger risk.',
    'Initial production baseline for demo and analyst review.',
    timezone('utc', now())
  )
ON CONFLICT (model_key, version_label) DO NOTHING;
