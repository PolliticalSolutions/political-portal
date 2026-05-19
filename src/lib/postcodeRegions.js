// UK postcode area → region mapping. Used for volunteer regional assignment
// when no association preference is supplied. Region values match the
// values stored in public.associations.region.
//
// Coverage: all 124 UK postcode areas (E, EC, N, NW, … BT).
// Cross-boundary tiebreakers — committed once, do not re-debate:
//   MK → South East   (officially South East per ONS)
//   CH → North West   (Cheshire dominant; Welsh portion small)
//   SY → Wales        (mid-Wales footprint dominant; Shropshire portion small)
//   PE → East of England (Cambs/Lincs split; East of England dominant)
//   DN → Yorkshire and the Humber (small Lincs overlap)
//   CA → North West   (Cumbria is North West per ONS)

export const POSTCODE_AREA_TO_REGION = {
  // London
  E: "London", EC: "London", N: "London", NW: "London",
  SE: "London", SW: "London", W: "London", WC: "London",
  BR: "London", CR: "London", DA: "London", EN: "London",
  HA: "London", IG: "London", KT: "London", RM: "London",
  TW: "London", UB: "London",

  // South East
  BN: "South East", CT: "South East", GU: "South East", ME: "South East",
  OX: "South East", PO: "South East", RG: "South East", RH: "South East",
  SL: "South East", SO: "South East", TN: "South East", MK: "South East",

  // South West
  BA: "South West", BH: "South West", BS: "South West", DT: "South West",
  EX: "South West", GL: "South West", PL: "South West", SN: "South West",
  SP: "South West", TA: "South West", TQ: "South West", TR: "South West",

  // East of England
  AL: "East of England", CB: "East of England", CM: "East of England",
  CO: "East of England", HP: "East of England", IP: "East of England",
  LU: "East of England", NR: "East of England", PE: "East of England",
  SG: "East of England", SS: "East of England", WD: "East of England",

  // West Midlands
  B: "West Midlands", CV: "West Midlands", DY: "West Midlands",
  HR: "West Midlands", ST: "West Midlands", TF: "West Midlands",
  WR: "West Midlands", WS: "West Midlands", WV: "West Midlands",

  // East Midlands
  DE: "East Midlands", LE: "East Midlands", LN: "East Midlands",
  NG: "East Midlands", NN: "East Midlands",

  // Yorkshire and the Humber
  BD: "Yorkshire and the Humber", DN: "Yorkshire and the Humber",
  HD: "Yorkshire and the Humber", HG: "Yorkshire and the Humber",
  HU: "Yorkshire and the Humber", HX: "Yorkshire and the Humber",
  LS: "Yorkshire and the Humber", S: "Yorkshire and the Humber",
  WF: "Yorkshire and the Humber", YO: "Yorkshire and the Humber",

  // North West
  BB: "North West", BL: "North West", CA: "North West", CH: "North West",
  CW: "North West", FY: "North West", L: "North West", LA: "North West",
  M: "North West", OL: "North West", PR: "North West", SK: "North West",
  WA: "North West", WN: "North West",

  // North East
  DH: "North East", DL: "North East", NE: "North East",
  SR: "North East", TS: "North East",

  // Scotland
  AB: "Scotland", DD: "Scotland", DG: "Scotland", EH: "Scotland",
  FK: "Scotland", G: "Scotland", HS: "Scotland", IV: "Scotland",
  KA: "Scotland", KW: "Scotland", KY: "Scotland", ML: "Scotland",
  PA: "Scotland", PH: "Scotland", TD: "Scotland", ZE: "Scotland",

  // Wales
  CF: "Wales", LD: "Wales", LL: "Wales", NP: "Wales", SA: "Wales", SY: "Wales",

  // Northern Ireland
  BT: "Northern Ireland",
};

/**
 * Extract the alpha area prefix from a UK postcode and look up its region.
 * Returns null for unrecognised areas (Lambda treats this as `pending_region`).
 *
 * @param {string|null|undefined} postcode
 * @returns {string|null}
 */
export function getRegionFromPostcode(postcode) {
  if (!postcode) return null;
  const match = String(postcode).trim().toUpperCase().match(/^([A-Z]{1,2})\d/);
  if (!match) return null;
  return POSTCODE_AREA_TO_REGION[match[1]] || null;
}

/**
 * Extract just the area prefix (no region lookup). Used for the
 * volunteers.postcode_area column.
 *
 * @param {string|null|undefined} postcode
 * @returns {string|null}
 */
export function getPostcodeArea(postcode) {
  if (!postcode) return null;
  const match = String(postcode).trim().toUpperCase().match(/^([A-Z]{1,2})\d/);
  return match ? match[1] : null;
}
