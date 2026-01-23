import associations from "../data/associations.json";

export const SELECTED_AREA_STORAGE_KEY = "PS_SELECTED_AREA_V1";

const resolveStoredAreaId = (payload) => {
  if (!payload) return "";
  if (payload.areaId) return payload.areaId;
  if (payload.constituency) return payload.constituency;
  if (payload.association) return payload.association;
  return "";
};

const isValidAreaId = (areaId) =>
  Boolean(areaId && (associations.byAssociation?.[areaId] || associations.byConstituency?.[areaId]));

export const readAssociationSelection = () => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SELECTED_AREA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const areaId = resolveStoredAreaId(parsed);
    if (!isValidAreaId(areaId)) {
      sessionStorage.removeItem(SELECTED_AREA_STORAGE_KEY);
      return null;
    }
    return { ...parsed, areaId };
  } catch (error) {
    return null;
  }
};

export const saveAssociationSelection = (selection) => {
  if (typeof sessionStorage === "undefined") return;
  if (!selection) return;
  const areaId = selection.constituency || selection.association || "";
  if (!areaId || !isValidAreaId(areaId)) {
    sessionStorage.removeItem(SELECTED_AREA_STORAGE_KEY);
    return;
  }
  const payload = {
    areaId,
    areaName: areaId,
    association: selection.association || "",
    constituency: selection.constituency || "",
    constituencyCount: Number.isFinite(selection.constituencyCount) ? selection.constituencyCount : 0,
  };
  sessionStorage.setItem(SELECTED_AREA_STORAGE_KEY, JSON.stringify(payload));
};
