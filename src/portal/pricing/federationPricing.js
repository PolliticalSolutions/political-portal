const VAT_RATE = 0.2;
const BASE_FEE = 500;
const ADDITIONAL_FEE = 250;

const roundTo2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateFederationPricing(count) {
  const safeCount = Math.max(1, Number(count) || 1);
  const netTotal = BASE_FEE + ADDITIONAL_FEE * Math.max(0, safeCount - 1);
  const vatTotal = roundTo2(netTotal * VAT_RATE);
  const grossTotal = roundTo2(netTotal + vatTotal);

  return {
    count: safeCount,
    vatRate: VAT_RATE,
    netTotal,
    vatTotal,
    grossTotal,
    baseFee: BASE_FEE,
    additionalFee: ADDITIONAL_FEE,
  };
}
