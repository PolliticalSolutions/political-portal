// Hand-rolled month-grid calendar. No new packages.
// Takes a list of sessions (already filtered upstream), renders them as
// pills inside day cells. Pill click navigates to session detail.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SESSION_TYPE_COLOURS } from "../../lib/campaignConfig.js";

const DAY_NAMES_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}
function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Returns a 6-row × 7-col grid of Date objects starting from the
// Monday of the week containing the 1st of `monthStart`.
function buildMonthGrid(monthStart) {
  const firstDay = monthStart.getDay(); // 0=Sun, 1=Mon, ...
  // Calculate days to subtract so we start from Monday.
  const offsetFromMonday = (firstDay + 6) % 7; // Sun=6, Mon=0, Tue=1, ...
  const start = new Date(monthStart);
  start.setDate(start.getDate() - offsetFromMonday);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export default function SessionCalendar({ sessions }) {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));

  const sessionsByDate = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      const key = s.session_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [sessions]);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const monthLabel = viewMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="campaigns-calendar">
      <header className="campaigns-calendar__header">
        <div className="campaigns-calendar__nav">
          <button type="button" onClick={() => setViewMonth((m) => addMonths(m, -1))} aria-label="Previous month">‹</button>
          <button type="button" onClick={() => setViewMonth(startOfMonth(today))}>Today</button>
          <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} aria-label="Next month">›</button>
        </div>
        <h2 className="campaigns-calendar__month">{monthLabel}</h2>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--portal-text-muted)" }}>
          {sessions.length} session{sessions.length === 1 ? "" : "s"} in view
        </span>
      </header>

      <div className="campaigns-calendar__grid-header">
        {DAY_NAMES_MON_FIRST.map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="campaigns-calendar__grid">
        {grid.map((date) => {
          const inMonth = date.getMonth() === viewMonth.getMonth();
          const isToday = sameDay(date, today);
          const dateKey = isoDate(date);
          const dayList = sessionsByDate.get(dateKey) || [];
          return (
            <div
              key={dateKey}
              className={`campaigns-calendar__cell${inMonth ? "" : " is-out"}${isToday ? " is-today" : ""}`}
            >
              <div className="campaigns-calendar__cell-date">{date.getDate()}</div>
              <ul className="campaigns-calendar__cell-list">
                {dayList.slice(0, 3).map((s) => {
                  const primary = Array.isArray(s.session_types) && s.session_types[0];
                  const colour = SESSION_TYPE_COLOURS[primary] || "var(--portal-text-muted)";
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="campaigns-calendar__pill"
                        style={{ borderLeftColor: colour }}
                        onClick={() => navigate(`/portal/campaigns/${s.id}`)}
                        title={s.title}
                      >
                        <span className="campaigns-calendar__pill-time">{(s.start_time || "").slice(0, 5)}</span>
                        <span className="campaigns-calendar__pill-title">{s.title}</span>
                      </button>
                    </li>
                  );
                })}
                {dayList.length > 3 && (
                  <li className="campaigns-calendar__more">+{dayList.length - 3} more</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
