function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseShares(rows) {
  const total = rows.reduce((sum, row) => sum + row.projectedShare, 0);
  if (total <= 0) {
    return rows.map((row) => ({ ...row, projectedShare: 0 }));
  }

  return rows.map((row) => ({
    ...row,
    projectedShare: (row.projectedShare / total) * 100,
  }));
}

function redistributeDelta(rows, excludedPartyIds, delta) {
  if (!delta) return rows;

  const eligibleRows = rows.filter(
    (row) => !excludedPartyIds.includes(row.partyId) && row.projectedShare > 0
  );
  const eligibleTotal = eligibleRows.reduce((sum, row) => sum + row.projectedShare, 0);

  if (eligibleTotal <= 0) return rows;

  return rows.map((row) => {
    if (excludedPartyIds.includes(row.partyId) || row.projectedShare <= 0) return row;

    const shareOfPool = row.projectedShare / eligibleTotal;
    return {
      ...row,
      projectedShare: Math.max(row.projectedShare - delta * shareOfPool, 0),
    };
  });
}

function determineMajorityBand(majority) {
  if (majority < 1000) return "Knife-edge";
  if (majority < 3000) return "Tight";
  if (majority < 7500) return "Manageable";
  return "Comfortable";
}

export function getScenarioAssumptions() {
  return [
    "Applies a uniform national swing adjustment to the Conservative vote share.",
    "Applies Reform change separately and redistributes the offset proportionally across other parties.",
    "Scales total votes using a simplified turnout multiplier based on the latest general election in this seat.",
    "This is a planning tool for scenario testing, not a constituency-level forecast model.",
  ];
}

export function simulateConstituencyScenario({
  rows,
  nationalSwingToConservative = 0,
  reformVoteChange = 0,
  turnoutChange = 0,
}) {
  const generalElectionRows = (rows ?? [])
    .filter((row) => row?.elections?.election_type === "general")
    .sort((a, b) => (b.elections?.election_date ?? "").localeCompare(a.elections?.election_date ?? ""));

  if (!generalElectionRows.length) {
    return {
      available: false,
      reason: "No general election result data available for scenario testing.",
      assumptions: getScenarioAssumptions(),
    };
  }

  const latestElectionId = generalElectionRows[0].election_id;
  const baselineRows = generalElectionRows
    .filter((row) => row.election_id === latestElectionId)
    .map((row) => ({
      partyId: row.parties?.id ?? row.party_id ?? row.parties?.short_name ?? row.parties?.name,
      partyName: row.parties?.short_name || row.parties?.name || "Unknown party",
      colourHex: row.parties?.colour_hex ?? null,
      baselineVotes: toNumber(row.votes),
      baselineShare: toNumber(row.vote_share),
      projectedShare: toNumber(row.vote_share),
    }))
    .filter((row) => row.partyId);

  if (!baselineRows.length) {
    return {
      available: false,
      reason: "Latest election rows could not be normalised into a scenario baseline.",
      assumptions: getScenarioAssumptions(),
    };
  }

  const conservativeRow = baselineRows.find((row) => /con/i.test(row.partyName));
  const reformRow = baselineRows.find((row) => /reform/i.test(row.partyName));
  const conservativeId = conservativeRow?.partyId;
  const reformId = reformRow?.partyId;

  let projectedRows = baselineRows.map((row) => ({ ...row }));

  const conDelta = clamp(toNumber(nationalSwingToConservative), -25, 25);
  if (conservativeId) {
    projectedRows = projectedRows.map((row) =>
      row.partyId === conservativeId
        ? { ...row, projectedShare: clamp(row.projectedShare + conDelta, 0, 100) }
        : row
    );
    projectedRows = redistributeDelta(projectedRows, [conservativeId], conDelta);
  }

  const reformDelta = clamp(toNumber(reformVoteChange), -20, 20);
  if (reformId) {
    projectedRows = projectedRows.map((row) =>
      row.partyId === reformId
        ? { ...row, projectedShare: clamp(row.projectedShare + reformDelta, 0, 100) }
        : row
    );
    projectedRows = redistributeDelta(projectedRows, [reformId], reformDelta);
  }

  projectedRows = normaliseShares(projectedRows);

  const baselineTotalVotes = baselineRows.reduce((sum, row) => sum + row.baselineVotes, 0);
  const turnoutMultiplier = 1 + clamp(toNumber(turnoutChange), -30, 30) / 100;
  const projectedTotalVotes = Math.max(Math.round(baselineTotalVotes * turnoutMultiplier), 0);

  projectedRows = projectedRows
    .map((row) => ({
      ...row,
      projectedVotes: Math.round((row.projectedShare / 100) * projectedTotalVotes),
    }))
    .sort((a, b) => b.projectedVotes - a.projectedVotes);

  const winner = projectedRows[0] ?? null;
  const runnerUp = projectedRows[1] ?? null;
  const projectedMajority = winner && runnerUp ? winner.projectedVotes - runnerUp.projectedVotes : 0;

  return {
    available: true,
    electionName: generalElectionRows[0].elections?.name || "Latest general election baseline",
    projectedWinner: winner?.partyName || "Unavailable",
    projectedWinnerColour: winner?.colourHex ?? null,
    projectedMajority,
    projectedMajorityBand: determineMajorityBand(projectedMajority),
    turnoutMultiplier,
    projectedTotalVotes,
    assumptions: getScenarioAssumptions(),
    projectedRows,
  };
}
