export const SCORING_MODELS = {
  vulnerability: {
    key: "vulnerability",
    title: "Conservative Seat Vulnerability",
    version: "v1.0",
    description:
      "Ranks the exposure of Conservative-held seats by combining majority pressure, opposition threat, and structural constituency risk factors.",
    scoreRange: "0 to 10",
    components: [
      {
        key: "majorityExposure",
        label: "Majority exposure",
        weight: 0.35,
        description: "Smaller majorities increase the seat’s underlying vulnerability.",
        signalKeys: ["conservative_majority_pct", "challenger_gap"],
      },
      {
        key: "labourThreat",
        label: "Labour threat",
        weight: 0.25,
        description: "Captures the scale of Labour’s current competitive pressure.",
        signalKeys: ["challenger_gap", "anti_incumbent_pressure"],
      },
      {
        key: "reformThreat",
        label: "Reform threat",
        weight: 0.2,
        description: "Captures pressure from Reform UK in right-of-centre contests.",
        signalKeys: ["reform_vote_share", "fragmentation_pressure"],
      },
      {
        key: "libDemThreat",
        label: "Liberal Democrat threat",
        weight: 0.1,
        description: "Captures exposure in southern and suburban Con–Lib Dem contests.",
        signalKeys: ["challenger_gap"],
      },
      {
        key: "structuralFactors",
        label: "Structural factors",
        weight: 0.1,
        description: "Demographic and recent local trend indicators that amplify seat fragility.",
        signalKeys: ["demographic_headwinds", "conservative_vote_share_change"],
      },
    ],
    weights: {
      majorityExposure: 0.35,
      labourThreat: 0.25,
      reformThreat: 0.2,
      libDemThreat: 0.1,
      structuralFactors: 0.1,
    },
    explanationText:
      "Higher scores indicate a seat that should be treated as materially more difficult to defend under current conditions.",
    interpretation:
      "Use this score to rank defensive priority, not as a seat forecast in isolation. It is best read alongside local intelligence and current candidate context.",
    signalKeys: [
      "conservative_majority_pct",
      "challenger_gap",
      "conservative_vote_share_change",
      "demographic_headwinds",
      "anti_incumbent_pressure",
      "reform_vote_share",
      "fragmentation_pressure",
    ],
  },
  reformThreat: {
    key: "reformThreat",
    title: "Reform UK Threat Index",
    version: "v1.0",
    description:
      "Ranks Conservative seats by the strength of the Reform UK threat, combining vote share, swing, majority exposure, and local conditions.",
    scoreRange: "0 to 10",
    components: [
      {
        key: "reformVoteShare",
        label: "Reform 2024 vote share",
        weight: 0.3,
        description: "Higher Reform vote share indicates a larger existing electoral base.",
        signalKeys: ["reform_vote_share"],
      },
      {
        key: "conReformSwing",
        label: "Conservative to Reform swing",
        weight: 0.25,
        description: "Measures how sharply the seat moved towards Reform between elections.",
        signalKeys: ["con_reform_swing"],
      },
      {
        key: "majorityExposure",
        label: "Conservative majority exposure",
        weight: 0.2,
        description: "Smaller Conservative majorities increase the chance of disruption or overtaking pressure.",
        signalKeys: ["conservative_majority_pct", "fragmentation_pressure"],
      },
      {
        key: "localBaseStrength",
        label: "Local Reform base strength",
        weight: 0.15,
        description: "Council or local-ground evidence that Reform has meaningful organisational or protest traction.",
        signalKeys: ["local_reform_presence", "local_government_instability"],
      },
      {
        key: "demographicAlignment",
        label: "Demographic alignment",
        weight: 0.1,
        description: "Structural seat features that make Reform messages more likely to land.",
        signalKeys: ["demographic_headwinds"],
      },
    ],
    weights: {
      reformVoteShare: 0.3,
      conReformSwing: 0.25,
      majorityExposure: 0.2,
      localBaseStrength: 0.15,
      demographicAlignment: 0.1,
    },
    explanationText:
      "Higher scores indicate a more credible Reform threat to Conservative stability in that seat, whether through direct challenge or right-of-centre vote fragmentation.",
    interpretation:
      "Use this view to identify where Reform is most strategically destabilising. It is a prioritisation tool for defensive planning, not a projection of exact vote share.",
    signalKeys: [
      "reform_vote_share",
      "con_reform_swing",
      "conservative_majority_pct",
      "local_reform_presence",
      "local_government_instability",
      "demographic_headwinds",
      "fragmentation_pressure",
    ],
  },
  byElectionRisk: {
    key: "byElectionRisk",
    title: "By-Election Risk Model",
    version: "v1.0",
    description:
      "Highlights seats with elevated near-term by-election risk using political instability, local disruption, and majority pressure signals.",
    scoreRange: "0 to 10",
    components: [
      {
        key: "majorityFactor",
        label: "Majority factor",
        weight: 0.35,
        description: "Tighter seats create a higher operational consequence if a contest is triggered.",
        signalKeys: ["conservative_majority_pct", "challenger_gap"],
      },
      {
        key: "councilInstabilityFactor",
        label: "Council instability",
        weight: 0.25,
        description: "Captures whether local authority politics signal a seat under unusual local strain.",
        signalKeys: ["local_government_instability"],
      },
      {
        key: "defectionRiskFactor",
        label: "Defection and member movement",
        weight: 0.2,
        description: "Captures signals of parliamentary or local political instability around the sitting member.",
        signalKeys: ["mp_instability", "alert_pressure"],
      },
      {
        key: "pollingTrendFactor",
        label: "Polling and trend pressure",
        weight: 0.2,
        description: "Captures broader deterioration that could accelerate a trigger event or local crisis.",
        signalKeys: ["anti_incumbent_pressure", "turnout_volatility", "fragmentation_pressure"],
      },
    ],
    weights: {
      majorityFactor: 0.35,
      councilInstabilityFactor: 0.25,
      defectionRiskFactor: 0.2,
      pollingTrendFactor: 0.2,
    },
    explanationText:
      "Higher scores indicate a seat where a by-election scenario deserves closer contingency planning and live monitoring.",
    interpretation:
      "This model is a watchlist tool rather than a trigger predictor. It should be read as operational risk triage, not as a claim that a by-election is imminent.",
    signalKeys: [
      "conservative_majority_pct",
      "challenger_gap",
      "local_government_instability",
      "mp_instability",
      "alert_pressure",
      "anti_incumbent_pressure",
      "turnout_volatility",
      "fragmentation_pressure",
    ],
  },
};

export function getScoringModel(modelKey) {
  return SCORING_MODELS[modelKey] ?? null;
}
