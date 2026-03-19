export const WARWICKSHIRE_COUNTY_COUNCIL = "Warwickshire County Council";

export function isWarwickshireVerified(authority) {
  return authority?.name === WARWICKSHIRE_COUNTY_COUNCIL;
}

export function getCompositionQuality(authority) {
  if (!authority) {
    return {
      status: "missing",
      label: "Composition data not yet available",
      note: "Composition data not yet available",
    };
  }

  if (isWarwickshireVerified(authority)) {
    return {
      status: "verified",
      label: "Manually verified",
      note: "Warwickshire County Council composition has been manually verified.",
    };
  }

  const hasComposition =
    authority.composition &&
    typeof authority.composition === "object" &&
    Object.keys(authority.composition).length > 0;

  if (!hasComposition) {
    return {
      status: "missing",
      label: "Composition data not yet available",
      note: "Composition data not yet available",
    };
  }

  return {
    status: "unverified",
    label: "Unverified — data pending review",
    note:
      "The composition data shown for this authority has been automatically imported and may not reflect the current position. We are in the process of verifying all council data.",
  };
}

