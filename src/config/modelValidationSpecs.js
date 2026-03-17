export const MODEL_VALIDATION_ALIASES = {
  reform_threat: "reformThreat",
  by_election_risk: "byElectionRisk",
  scenario_simulator: "scenarioSimulator",
};

export const MODEL_VALIDATION_SPECS = {
  vulnerability: {
    modelKey: "vulnerability",
    aliases: [],
    label: "Conservative Seat Vulnerability",
    targetQuestion: "Which Conservative-held seats were most exposed to loss at the target election cycle?",
    eligibleUniverse: "Conservative-held seats at the baseline general election cycle.",
    predictionType: "ranking",
    primaryUseCase: "Defensive prioritisation and resource allocation across exposed Conservative seats.",
    successMetrics: [
      "Top-decile capture of genuinely exposed or lost seats",
      "Precision at 10, 20, and 50",
      "Recall at operational cut points",
      "Ranking quality across the full seat list",
      "Bucket hit rate for high-risk groups",
    ],
    minimumSignalRequirements: [
      "conservative_majority_pct",
      "challenger_gap",
      "conservative_vote_share_change",
    ],
    optionalSignals: [
      "demographic_headwinds",
      "anti_incumbent_pressure",
      "reform_vote_share",
      "fragmentation_pressure",
    ],
    signalsExcludedFromHistoricalTesting: [],
    historicalBacktestability: "strong",
    knownWeaknesses: [
      "Demographic and anti-incumbent signals are supporting context, not decisive causal evidence.",
      "Tactical voting, incumbency effects, and local candidate strength are not fully modelled.",
      "The model is strongest as a ranking tool, not as a calibrated seat-loss probability.",
    ],
    interpretationGuidance:
      "Read the output as a prioritised exposure ranking. Higher scores indicate seats that deserve more defensive attention, not seats guaranteed to fall.",
    nonClaims: [
      "It does not guarantee defeat in any named seat.",
      "It is not a binary win/lose prophecy.",
      "It should not be presented as a seat forecast in isolation.",
    ],
    recommendedPresentation: "Ranking tool for exposed Conservative-held seats.",
    validationNotes:
      "Historical validation should focus on whether the model surfaces genuinely exposed seats near the top of the ranking rather than whether it predicts every outcome perfectly.",
  },
  reformThreat: {
    modelKey: "reformThreat",
    aliases: ["reform_threat"],
    label: "Reform UK Threat Index",
    targetQuestion:
      "Which Conservative seats are most exposed to Reform-driven right-fragmentation or direct challenge under current conditions?",
    eligibleUniverse: "Current or historical Conservative-held seats where a defensible Reform/right-fragmentation analogue exists.",
    predictionType: "risk_score",
    primaryUseCase: "Current-conditions prioritisation for right-fragmentation monitoring and defensive planning.",
    successMetrics: [
      "Ranking quality among seats with credible Reform-style pressure",
      "Top-ranked capture of seats with meaningful Reform disruption",
      "Signal plausibility and directional consistency under current conditions",
    ],
    minimumSignalRequirements: [
      "reform_vote_share",
      "conservative_majority_pct",
    ],
    optionalSignals: [
      "con_reform_swing",
      "local_reform_presence",
      "local_government_instability",
      "demographic_headwinds",
      "fragmentation_pressure",
    ],
    signalsExcludedFromHistoricalTesting: [
      "reform_vote_share prior to 2024 where no defensible direct analogue exists",
      "con_reform_swing prior to 2024 where party-system structure is not comparable",
    ],
    historicalBacktestability: "partial",
    knownWeaknesses: [
      "Modern Reform dynamics are not cleanly comparable across long historical windows.",
      "Local Reform presence is patchy and unevenly historicised.",
      "The model blends current-conditions judgement with partially backtestable signals.",
    ],
    interpretationGuidance:
      "Use this as a directional threat ranking for current Conservative instability on the right. It is a prioritisation instrument, not a deterministic electoral forecast.",
    nonClaims: [
      "It does not forecast exact Reform vote share.",
      "It does not prove that Reform will overtake in a named seat.",
      "It should not be presented as fully historically validated across all cycles.",
    ],
    recommendedPresentation: "Directional current-conditions assessment with explicit caveats.",
    validationNotes:
      "Historical testing should be treated as partial and caveated. Conceptual signal validity matters here alongside the narrower set of directly backtestable analogue periods.",
  },
  byElectionRisk: {
    modelKey: "byElectionRisk",
    aliases: ["by_election_risk"],
    label: "By-Election Risk Model",
    targetQuestion:
      "Which seats show elevated disruption risk that merits contingency planning for a potential by-election scenario?",
    eligibleUniverse: "Seats with sufficient political, event, and local-government context to support current-intelligence triage.",
    predictionType: "risk_score",
    primaryUseCase: "Operational watchlisting for contingency planning, monitoring, and escalation.",
    successMetrics: [
      "Useful prioritisation of seats requiring live monitoring",
      "Alignment with known event-risk cases where event history exists",
      "Transparent handling of missing event-driven signals",
    ],
    minimumSignalRequirements: [
      "conservative_majority_pct",
      "challenger_gap",
    ],
    optionalSignals: [
      "local_government_instability",
      "mp_instability",
      "alert_pressure",
      "anti_incumbent_pressure",
      "turnout_volatility",
      "fragmentation_pressure",
    ],
    signalsExcludedFromHistoricalTesting: [
      "mp_instability where event history is incomplete",
      "alert_pressure where historical alert records do not exist consistently",
    ],
    historicalBacktestability: "weak",
    knownWeaknesses: [
      "Event-driven signals are patchy historically.",
      "Current-intelligence usefulness is stronger than historical validation quality.",
      "The model is sensitive to missing local and member-level event coverage.",
    ],
    interpretationGuidance:
      "Read this as a live risk watchlist. Higher scores indicate seats that warrant closer monitoring, not seats where a by-election is known or imminent.",
    nonClaims: [
      "It does not predict a resignation date.",
      "It does not guarantee that a by-election will happen.",
      "It should not be described as a high-confidence historical predictor unless event coverage improves materially.",
    ],
    recommendedPresentation: "Current-intelligence risk assessment with explicit caution.",
    validationNotes:
      "Validation should prioritise transparency about weak historical event coverage. Current operational usefulness is acceptable, but historical claims must remain bounded.",
  },
  scenarioSimulator: {
    modelKey: "scenarioSimulator",
    aliases: ["scenario_simulator"],
    label: "Constituency Scenario Simulator",
    targetQuestion:
      "How would simplified national swing, Reform movement, and turnout changes alter the local balance in this constituency under explicit assumptions?",
    eligibleUniverse: "Constituencies with a usable latest general-election baseline.",
    predictionType: "scenario_projection",
    primaryUseCase: "Planning aid for testing directional electoral scenarios and briefing assumptions.",
    successMetrics: [
      "Deterministic and reproducible outputs for the same inputs",
      "Clear assumption disclosure",
      "Operational usefulness as a planning aid rather than a forecast",
    ],
    minimumSignalRequirements: [
      "conservative_vote_share_change",
      "reform_vote_share",
      "turnout_volatility",
    ],
    optionalSignals: [
      "challenger_gap",
      "fragmentation_pressure",
    ],
    signalsExcludedFromHistoricalTesting: [
      "All non-modelled local candidate, tactical, and incumbency effects",
    ],
    historicalBacktestability: "not_applicable",
    knownWeaknesses: [
      "It uses simplified movement assumptions rather than a calibrated forecasting engine.",
      "It does not model tactical voting, candidate quality, or local campaign effects.",
      "It is sensitive to baseline election composition and user-entered assumptions.",
    ],
    interpretationGuidance:
      "Use this as a planning and briefing tool. It helps users stress-test assumptions, not estimate electoral probabilities.",
    nonClaims: [
      "It is not a probabilistic seat forecast.",
      "It is not historically validated in the same way as ranking models.",
      "It does not represent a full constituency-level microsimulation.",
    ],
    recommendedPresentation: "Planning aid with explicit simplification warnings.",
    validationNotes:
      "The correct standard is governance and assumption transparency, not conventional backtesting. Determinism and honest limitation statements matter more than pseudo-accuracy claims.",
  },
};

export function getCanonicalValidationKey(modelKey) {
  return MODEL_VALIDATION_ALIASES[modelKey] ?? modelKey;
}

export function getModelValidationSpec(modelKey) {
  const canonicalKey = getCanonicalValidationKey(modelKey);
  return MODEL_VALIDATION_SPECS[canonicalKey] ?? null;
}
