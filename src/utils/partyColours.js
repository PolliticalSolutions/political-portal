export const PARTY_COLOUR_FALLBACKS = {
  Labour: "#E4003B",
  "Labour Co-operative": "#E4003B",
  Conservative: "#0087DC",
  "Liberal Democrat": "#FAA61A",
  "Liberal Democrats": "#FAA61A",
  "Reform UK": "#12B6CF",
  SNP: "#FDF38E",
  Green: "#00B140",
  "Plaid Cymru": "#005B54",
  DUP: "#D46A4C",
  "Democratic Unionist Party": "#D46A4C",
  "Sinn Féin": "#326760",
  "Sinn Fein": "#326760",
  SDLP: "#006B54",
  "Social Democratic and Labour Party": "#006B54",
  Alliance: "#F6CB2F",
  "Alliance Party": "#F6CB2F",
  "Alliance Party of Northern Ireland": "#F6CB2F",
  UUP: "#48A5EE",
  "Ulster Unionist Party": "#48A5EE",
  TUV: "#0C3A6A",
  "Traditional Unionist Voice": "#0C3A6A",
  Independent: "#64748b",
  "Restore Britain": "#8B5CF6",
  "Restore Britain Reform": "#8B5CF6",
  "Scottish National Party": "#FDF38E",
};

const PARTY_SHORT_NAME_FALLBACKS = {
  Lab: PARTY_COLOUR_FALLBACKS.Labour,
  Con: PARTY_COLOUR_FALLBACKS.Conservative,
  LD: PARTY_COLOUR_FALLBACKS["Liberal Democrat"],
  LibDem: PARTY_COLOUR_FALLBACKS["Liberal Democrat"],
  Reform: PARTY_COLOUR_FALLBACKS["Reform UK"],
  SNP: PARTY_COLOUR_FALLBACKS.SNP,
  Green: PARTY_COLOUR_FALLBACKS.Green,
  PC: PARTY_COLOUR_FALLBACKS["Plaid Cymru"],
  DUP: PARTY_COLOUR_FALLBACKS.DUP,
  SF: PARTY_COLOUR_FALLBACKS["Sinn Féin"],
  SDLP: PARTY_COLOUR_FALLBACKS.SDLP,
  Alliance: PARTY_COLOUR_FALLBACKS.Alliance,
  APNI: PARTY_COLOUR_FALLBACKS.Alliance,
  UUP: PARTY_COLOUR_FALLBACKS.UUP,
  TUV: PARTY_COLOUR_FALLBACKS.TUV,
  Ind: PARTY_COLOUR_FALLBACKS.Independent,
};

export function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function normalizePartyName(name = "") {
  const value = `${name}`.trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (
    lower === "labour co-operative" ||
    lower === "labour co-op" ||
    lower === "labour and co-operative party" ||
    lower === "labour and co-operative" ||
    lower === "labour (co-op)" ||
    lower === "labour (co-operative)"
  ) {
    return "Labour";
  }

  return value;
}

export function resolvePartyColour(partyOrName, fallback = "#94a3b8") {
  if (!partyOrName) {
    return fallback;
  }

  if (typeof partyOrName === "string") {
    const normalizedName = normalizePartyName(partyOrName);
    return PARTY_COLOUR_FALLBACKS[normalizedName] ?? fallback;
  }

  const colourHex = toHexColor(partyOrName.colour_hex);
  if (colourHex) {
    return colourHex;
  }

  const normalizedName = normalizePartyName(partyOrName.name);
  if (normalizedName && PARTY_COLOUR_FALLBACKS[normalizedName]) {
    return PARTY_COLOUR_FALLBACKS[normalizedName];
  }

  const shortName = `${partyOrName.short_name ?? ""}`.trim();
  if (shortName && PARTY_SHORT_NAME_FALLBACKS[shortName]) {
    return PARTY_SHORT_NAME_FALLBACKS[shortName];
  }

  return fallback;
}
