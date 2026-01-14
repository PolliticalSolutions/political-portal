const DEFAULT_VAT_RATE = 0.2;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcLine({ net, vatRate } = {}) {
  const safeNet = toNumber(net, 0);
  const rate = Number.isFinite(vatRate) ? vatRate : DEFAULT_VAT_RATE;
  const netRounded = round2(safeNet);
  const vatAmount = round2(netRounded * rate);
  const gross = round2(netRounded + vatAmount);

  return {
    net: netRounded,
    vatRate: rate,
    vatAmount,
    gross,
  };
}

export function calcTotals(lines = []) {
  const summary = lines.map((line) => calcLine(line));
  let netTotal = 0;
  let vatTotal = 0;
  let grossTotal = 0;

  summary.forEach((line) => {
    netTotal += line.net;
    vatTotal += line.vatAmount;
    grossTotal += line.gross;
  });

  return {
    netTotal: round2(netTotal),
    vatTotal: round2(vatTotal),
    grossTotal: round2(grossTotal),
  };
}
