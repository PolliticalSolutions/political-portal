const DEFAULT_SWING = {
  conservative: 0,
  labour: 0,
  reform: 0,
};

const PARTY_SWING_KEYS = {
  conservative: new Set(["conservative", "con"]),
  labour: new Set(["labour", "lab", "labour co-operative", "labour and co-operative"]),
  reform: new Set(["reform uk", "reform"]),
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalisePartyName(partyName) {
  const normalised = (partyName || "").toString().trim().toLowerCase();
  if (!normalised) return "Other";
  if (PARTY_SWING_KEYS.conservative.has(normalised)) return "Conservative";
  if (PARTY_SWING_KEYS.labour.has(normalised)) return "Labour";
  if (PARTY_SWING_KEYS.reform.has(normalised)) return "Reform UK";
  if (normalised === "lib dem" || normalised === "liberal democrat" || normalised === "liberal democrats") {
    return "Liberal Democrat";
  }
  if (normalised === "green party" || normalised === "green") return "Green";
  if (normalised === "sinn fein" || normalised === "sinn féin") return "Sinn Féin";
  if (normalised === "speaker") return "Speaker";
  return partyName;
}

function getSwingDeltaForParty(partyName, swing = DEFAULT_SWING) {
  const normalised = (partyName || "").toString().trim().toLowerCase();
  if (PARTY_SWING_KEYS.conservative.has(normalised)) return Number(swing.conservative || 0);
  if (PARTY_SWING_KEYS.labour.has(normalised)) return Number(swing.labour || 0);
  if (PARTY_SWING_KEYS.reform.has(normalised)) return Number(swing.reform || 0);
  return 0;
}

function groupResultsByConstituency(rows = []) {
  const grouped = new Map();

  rows.forEach((row) => {
    const constituency = row.constituencies || {};
    const key = constituency.id || row.constituency_id;
    if (!key) return;

    if (!grouped.has(key)) {
      grouped.set(key, {
        constituencyId: key,
        onsCode: constituency.ons_code || "",
        constituencyName: constituency.name || "Unknown constituency",
        rows: [],
      });
    }

    grouped.get(key).rows.push(row);
  });

  return Array.from(grouped.values());
}

function withAdjustedShares(rows, swing) {
  const withRawAdjusted = rows.map((row) => {
    const partyName = normalisePartyName(row.parties?.short_name || row.parties?.name || "Other");
    const baseShare = Number(row.vote_share || 0);
    const adjustedShare = clamp(baseShare + getSwingDeltaForParty(partyName, swing), 0, 100);

    return {
      partyName,
      baseShare,
      adjustedShare,
      votes: Number(row.votes || 0),
      isWinner: Boolean(row.is_winner),
      majority: row.majority == null ? null : Number(row.majority),
    };
  });

  const total = withRawAdjusted.reduce((sum, row) => sum + row.adjustedShare, 0);
  if (total <= 0) return withRawAdjusted;

  return withRawAdjusted.map((row) => ({
    ...row,
    adjustedShare: (row.adjustedShare / total) * 100,
  }));
}

function sortByAdjustedShare(rows = []) {
  return [...rows].sort((a, b) => {
    if (b.adjustedShare !== a.adjustedShare) return b.adjustedShare - a.adjustedShare;
    if (b.baseShare !== a.baseShare) return b.baseShare - a.baseShare;
    return b.votes - a.votes;
  });
}

function toSeatTotals(seats = []) {
  const totals = new Map();

  seats.forEach((seat) => {
    const key = seat.projectedWinner;
    totals.set(key, (totals.get(key) || 0) + 1);
  });

  return Array.from(totals.entries())
    .map(([party, seatsWon]) => ({ party, seats: seatsWon }))
    .sort((a, b) => b.seats - a.seats || a.party.localeCompare(b.party));
}

export function projectNationalScenario(rows = [], swing = DEFAULT_SWING) {
  const grouped = groupResultsByConstituency(rows);

  if (!grouped.length) {
    return {
      seats: [],
      projectedSeatTotals: [],
      changedSeats: [],
      summary: {
        totalSeats: 0,
        changedHands: 0,
        conservativeProjected: 0,
        labourProjected: 0,
        reformProjected: 0,
      },
    };
  }

  const seats = grouped
    .map((seat) => {
      const adjustedRows = sortByAdjustedShare(withAdjustedShares(seat.rows, swing));
      const baselineWinner = adjustedRows.find((row) => row.isWinner) || adjustedRows[0];
      const projectedWinner = adjustedRows[0];
      const runnerUp = adjustedRows[1] || null;
      const projectedMajority = runnerUp
        ? Number((projectedWinner.adjustedShare - runnerUp.adjustedShare).toFixed(1))
        : Number(projectedWinner.adjustedShare.toFixed(1));

      return {
        constituencyId: seat.constituencyId,
        onsCode: seat.onsCode,
        constituencyName: seat.constituencyName,
        baselineWinner: baselineWinner?.partyName || "Other",
        projectedWinner: projectedWinner?.partyName || "Other",
        changedHands: (baselineWinner?.partyName || "Other") !== (projectedWinner?.partyName || "Other"),
        projectedMajority,
        topTwo: adjustedRows.slice(0, 2).map((row) => ({
          partyName: row.partyName,
          adjustedShare: Number(row.adjustedShare.toFixed(1)),
          baseShare: Number(row.baseShare.toFixed(1)),
        })),
      };
    })
    .sort((a, b) => {
      if (a.changedHands !== b.changedHands) return Number(b.changedHands) - Number(a.changedHands);
      return a.projectedMajority - b.projectedMajority;
    });

  const projectedSeatTotals = toSeatTotals(seats);
  const changedSeats = seats.filter((seat) => seat.changedHands);
  const lookupTotal = (party) => projectedSeatTotals.find((entry) => entry.party === party)?.seats || 0;

  return {
    seats,
    projectedSeatTotals,
    changedSeats,
    summary: {
      totalSeats: seats.length,
      changedHands: changedSeats.length,
      conservativeProjected: lookupTotal("Conservative"),
      labourProjected: lookupTotal("Labour"),
      reformProjected: lookupTotal("Reform UK"),
    },
  };
}
