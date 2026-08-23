# Task 03: Build the isolated public shell

Follow `00-shared-rules.md`.

## Prerequisite

The user must have approved `docs/public-site-copy/01-homepage-and-shell.md`. If approval is not explicit in the current task, stop and ask.

## Objective

Create a route-scoped public-site shell and apply the 2026 identity to its navigation, footer, typography, and base tokens without changing protected routes.

## Work

- Establish an explicit public-route boundary for only the routes listed in `README.md`. Preserve every route path, redirect, and behaviour.
- Ensure excluded auth, portal, and campaign routes retain their existing shell and styling.
- Use the authoritative outlined SVG lockups. Never rebuild the wordmark as live text, stretch it, recolour it, or add effects.
- Apply Archivo to the public shell only. Use the Brand source and verify the selected web-loading method; if the available files cannot render reliably, ask before using an external font service.
- Apply the 2026 public palette: navy `#101F36`, deep navy `#0C1729`, blue `#0087DC`, dark blue `#005FA3`, off-white `#F5F7FA`, slate `#5B6C82`, muted blue-grey `#8DA0B8`, hairline `#E1E7EE`.
- Blue is the public CTA accent. Green remains semantic success only.
- Implement the approved navigation and footer copy. Keep the client-login destination unchanged.
- Keep public CSS scoped. Do not modify portal selectors or `--portal-*` behaviour.

## Verification

- Pass 1: targeted component tests, route tests, asset-load checks, and `npm run build`.
- Pass 2: fresh browser review of the homepage plus one product and one legal page at desktop/mobile; separately confirm login, portal entry, and campaign routes have no code or styling regression.

