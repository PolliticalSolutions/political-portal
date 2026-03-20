const VAT_RATE = 0.2;

export function calculateAssociationSubscriptionExVatPence(constituencyCount) {
  const count = Math.max(1, Number(constituencyCount) || 1);
  const pounds = 500 + Math.max(0, count - 1) * 250;
  return pounds * 100;
}

export function calculateVatPence(amountExVatPence, vatRate = VAT_RATE) {
  const amount = Math.max(0, Number(amountExVatPence) || 0);
  return Math.round(amount * vatRate);
}

export function calculateAssociationSubscriptionPricing(constituencyCount) {
  const amountExVatPence = calculateAssociationSubscriptionExVatPence(constituencyCount);
  const vatPence = calculateVatPence(amountExVatPence);
  const amountIncVatPence = amountExVatPence + vatPence;

  return {
    constituencyCount: Math.max(1, Number(constituencyCount) || 1),
    amountExVatPence,
    vatPence,
    amountIncVatPence,
    vatRate: VAT_RATE,
  };
}

export function formatPenceToPounds(amountPence) {
  return (Math.max(0, Number(amountPence) || 0) / 100).toFixed(2);
}

