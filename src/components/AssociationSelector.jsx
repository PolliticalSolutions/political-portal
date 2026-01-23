import { useMemo, useState } from "react";
import associations from "../data/associations.json";

const emptySelection = {
  association: "",
  constituency: "",
  constituencyCount: 0,
};

export default function AssociationSelector({ value = emptySelection, onChange }) {
  const [associationFilter, setAssociationFilter] = useState("");
  const [constituencyFilter, setConstituencyFilter] = useState("");

  const associationOptions = useMemo(
    () => Object.keys(associations.byAssociation ?? {}).sort(),
    []
  );
  const constituencyOptions = useMemo(
    () => Object.keys(associations.byConstituency ?? {}).sort(),
    []
  );

  const normalizedAssociationFilter = associationFilter.trim().toLowerCase();
  const filteredAssociationMatches = normalizedAssociationFilter
    ? associationOptions.filter((association) =>
        association.toLowerCase().includes(normalizedAssociationFilter)
      )
    : associationOptions;

  const associationMatches =
    value.association && !filteredAssociationMatches.includes(value.association)
      ? [value.association, ...filteredAssociationMatches]
      : filteredAssociationMatches;

  const normalizedConstituencyFilter = constituencyFilter.trim().toLowerCase();
  const filteredConstituencyMatches = normalizedConstituencyFilter
    ? constituencyOptions.filter((constituency) =>
        constituency.toLowerCase().includes(normalizedConstituencyFilter)
      )
    : constituencyOptions;

  const constituencyMatches =
    value.constituency && !filteredConstituencyMatches.includes(value.constituency)
      ? [value.constituency, ...filteredConstituencyMatches]
      : filteredConstituencyMatches;

  const resolveConstituencyCount = (association) =>
    (associations.byAssociation[association] ?? []).length;

  const handleAssociationChange = (event) => {
    const association = event.target.value;
    const constituencyCount = association ? resolveConstituencyCount(association) : 0;
    onChange?.({
      association,
      constituency: "",
      constituencyCount,
    });
  };

  const handleConstituencyChange = (event) => {
    const constituency = event.target.value;
    const association = associations.byConstituency[constituency] ?? "";
    const constituencyCount = association ? resolveConstituencyCount(association) : 0;
    onChange?.({
      association,
      constituency,
      constituencyCount,
    });
  };

  return (
    <div className="association-selector">
      <div className="field">
        <label htmlFor="association-filter" className="muted" style={{ fontWeight: 600 }}>
          Filter associations
        </label>
        <div className="filter-row">
          <input
            id="association-filter"
            className="input"
            placeholder="Filter associations..."
            value={associationFilter}
            onChange={(event) => setAssociationFilter(event.target.value)}
            aria-label="Filter associations"
          />
          <button
            type="button"
            className="button ghost"
            onClick={() => setAssociationFilter("")}
            aria-label="Clear association filter"
          >
            Clear
          </button>
        </div>
        <label htmlFor="association-select" className="muted" style={{ fontWeight: 600 }}>
          Association/Federation
        </label>
        <select
          id="association-select"
          className="input"
          value={value.association}
          onChange={handleAssociationChange}
        >
          <option value="">Select an association/federation</option>
          {associationMatches.map((association) => (
            <option key={association} value={association}>
              {association}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="constituency-filter" className="muted" style={{ fontWeight: 600 }}>
          Filter constituencies
        </label>
        <div className="filter-row">
          <input
            id="constituency-filter"
            className="input"
            placeholder="Filter constituencies..."
            value={constituencyFilter}
            onChange={(event) => setConstituencyFilter(event.target.value)}
            aria-label="Filter constituencies"
          />
          <button
            type="button"
            className="button ghost"
            onClick={() => setConstituencyFilter("")}
            aria-label="Clear constituency filter"
          >
            Clear
          </button>
        </div>
        <label htmlFor="constituency-select" className="muted" style={{ fontWeight: 600 }}>
          Constituency
        </label>
        <select
          id="constituency-select"
          className="input"
          value={value.constituency}
          onChange={handleConstituencyChange}
        >
          <option value="">Select a constituency</option>
          {constituencyMatches.map((constituency) => (
            <option key={constituency} value={constituency}>
              {constituency}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
