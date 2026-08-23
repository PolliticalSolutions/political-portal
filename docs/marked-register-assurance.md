# Marked-register assurance contract

Marked-register acceptance has two independent parts. Passing one does not
imply that the other has passed.

## 1. Source fidelity

This establishes that the output faithfully represents the supplied register:

- polling-district boundaries are supported by repeated printed page headers;
- elector numbers are extracted as text and retain permitted suffixes;
- duplicates are measured and removed only on the district-plus-elector key;
- aggregate row, district, page-header, and duplicate diagnostics reproduce;
- any visual review is performed locally on the private source and temporary
  renders are deleted after review.

The existing automated quality gate principally addresses this part of the
contract. A syntactically valid, repeatedly printed district code can pass the
gate even when another system uses a different geography version or key.

## 2. Destination compatibility

This establishes that every output key is accepted by the intended downstream
system. It requires the destination owner's versioned reference data and
documented matching rules. It cannot be inferred from a PDF header, district
name, neighbouring code, roll-number pattern, public website, or prior job.

Until the authoritative reference is available, record destination
compatibility as **not assessed**. Do not describe a source-fidelity pass as a
VoteSource/CCHQ compatibility pass, and do not invent or silently substitute a
replacement district code.

## Incident evidence checklist

For a disputed output, preserve the following in a private, ignored location:

1. SHA-256, byte size, and page count for every source PDF.
2. SHA-256 and byte size for the exact delivered workbook.
3. Production batch and job identifiers, timestamps, and safe runtime hashes.
4. The original per-chunk artefacts needed to replay the deployed resolver.
5. An aggregate-only provenance report containing codes, page numbers, counts,
   and boundary evidence—but no elector numbers, names, addresses, or OCR text.
6. The source-control commit used for the replay and the current deployed-code
   hash, clearly distinguishing them when production has since changed.

## Release wording while compatibility is unverified

Use this internal status:

> Source fidelity checked. Destination compatibility not assessed because the
> authoritative, versioned destination geography and matching rules are not
> available.

This is a documentation and review status, not an automated release decision.
Any production gate or mapping change must wait for the authoritative reference
and its versioning and matching contract.

## Aggregate provenance replay

`infra/upload-api/local_trial/district_provenance_audit.py` reproduces the
versioned `corroborated-header-v1` boundary policy from private per-chunk
artefacts. Always supply `--resolver-commit` with the exact source commit whose
output is under review. The report includes source labels, job identifiers,
input filenames, file hashes, and aggregate diagnostics, so it is operational
evidence: write it only to an ignored private location and do not commit it.

The utility is diagnostic rather than a current-production oracle. Its recorded
commit must match the artefacts being reproduced, and a report from an older
commit must not be presented as validation of later resolver changes.
