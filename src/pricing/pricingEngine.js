function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function calculatePrice({
  constituencies = 0, // Reserved for future rules
  federations = 0,
  federationSupportEnabled,
  vatRate = 0.2,
}) {
  const items = [];
  let exVat = 0;

  const federationCount = Math.max(0, toNumber(federations));

  if (federationSupportEnabled) {
    const setupFee = 500;
    items.push({
      id: "federation-setup",
      label: "Federation setup",
      quantity: 1,
      unitPrice: setupFee,
      total: setupFee,
    });
    exVat += setupFee;

    const perFederation = 250 * federationCount;
    if (federationCount > 0) {
      items.push({
        id: "federation-coverage",
        label: "Federation coverage",
        quantity: federationCount,
        unitPrice: 250,
        total: perFederation,
      });
      exVat += perFederation;
    }
  }

  const vat = Number((exVat * vatRate).toFixed(2));
  const incVat = Number((exVat + vat).toFixed(2));

  return {
    items,
    totals: {
      exVat,
      vat,
      incVat,
    },
  };
}
