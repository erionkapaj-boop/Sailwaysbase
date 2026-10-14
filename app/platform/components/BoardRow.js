"use client";
import { colors, radius, fontSans } from "../../../lib/platform/theme";

// Γραμμή αιτήματος του δημόσιου πίνακα: μοτίβο καταλόγου (σταθερή στήλη
// ημερομηνίας αντί φωτογραφίας, τίτλος και λεπτομέρειες στη μέση, στοιχεία
// σε ζεύγη ετικέτα/τιμή, ενέργεια δεξιά). Σε κινητό στοιβάζεται.
export const BOARD_CSS = `
.bd-row { display: grid; grid-template-columns: 76px minmax(0,1fr) 230px 150px; gap: 8px 24px; align-items: center;
  background: ${colors.card}; border: 1px solid ${colors.border}; border-radius: ${radius.lg}px; padding: 18px 22px; margin-bottom: 12px;
  box-shadow: 0 1px 2px rgba(22,40,60,0.03); transition: box-shadow .2s ease, border-color .2s ease; }
.bd-row:hover { box-shadow: 0 2px 4px rgba(22,40,60,0.04), 0 10px 24px rgba(22,40,60,0.06); }
.bd-date { width: 76px; height: 76px; border-radius: ${radius.lg}px; background: ${colors.seaGlass}; display: flex; flex-direction: column;
  align-items: center; justify-content: center; font-family: ${fontSans}; }
.bd-date b { font-size: 26px; font-weight: 600; line-height: 1; letter-spacing: -0.02em; }
.bd-date span { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: ${colors.inkSoft}; margin-top: 5px; }
.bd-main { min-width: 0; }
.bd-leave { height: 44px !important; min-height: 44px; padding: 0 18px !important; align-self: flex-start; flex-shrink: 0; text-decoration: none; }
.bd-title { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
.bd-route { margin: 4px 0 0; font-size: 15px; }
.bd-meta { margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: ${colors.inkSoft}; }
.bd-meta span { display: inline-flex; align-items: center; gap: 6px; }
.bd-facts { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 13px; }
.bd-facts dt { color: ${colors.inkSoft}; }
.bd-facts dd { margin: 0; font-weight: 500; text-align: right; }
.bd-act { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.bd-act button { width: 100%; min-height: 44px; }
.bd-note { grid-column: 2 / 5; margin: 0; font-size: 14px; white-space: pre-wrap; color: ${colors.ink}; border-top: 1px solid ${colors.border}; padding-top: 12px; }
.bd-extra { grid-column: 1 / -1; }
@media (max-width: 860px) {
  .bd-row { grid-template-columns: 64px minmax(0,1fr); padding: 16px; gap: 14px 16px; align-items: start; }
  .bd-date { width: 64px; height: 64px; }
  .bd-date b { font-size: 22px; }
  .bd-note { order: 3; border-top: none; padding-top: 0; }
  .bd-facts { order: 4; grid-column: 1 / -1; border-top: 1px solid ${colors.border}; padding-top: 12px; }
  .bd-act { order: 5; grid-column: 1 / -1; }
  .bd-extra { order: 6; }
  .bd-note { grid-column: 1 / -1; }
}
`;

const ICON = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
const PATHS = {
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5a3 3 0 0 1 0 6M18 14.8c1.7.7 3 2.4 3 5.2" /></>,
  boat: <><path d="M3 15h18l-2.2 4H5.2L3 15Z" /><path d="M12 3v12M12 4l6 9h-6" /></>,
  bed: <><path d="M3 18V7M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5" /><circle cx="7" cy="11" r="1.6" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" /><circle cx="12" cy="10" r="2.4" /></>,
  route: <><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16" /></>,
  euro: <><path d="M17.5 6.5A6 6 0 1 0 17.5 17.5M4 10h9M4 14h9" /></>,
};
export function Icon({ name }) {
  return <svg {...ICON}>{PATHS[name]}</svg>;
}

// date: "YYYY-MM-DD" της έναρξης· monthShort: όνομα μήνα στη γλώσσα της σελίδας.
export default function BoardRow({ day, month, title, route, meta = [], facts = [], note, action, extra }) {
  return (
    <div className="bd-row">
      <div className="bd-date" aria-hidden="true">
        <b>{day}</b>
        <span>{month}</span>
      </div>
      <div className="bd-main">
        <h3 className="bd-title">{title}</h3>
        {route && <p className="bd-route">{route}</p>}
        {meta.length > 0 && (
          <div className="bd-meta">
            {meta.map((m) => (
              <span key={m.text}>
                <Icon name={m.icon} />
                {m.text}
              </span>
            ))}
          </div>
        )}
      </div>
      <dl className="bd-facts">
        {facts.map((x) => (
          <div key={x.label} style={{ display: "contents" }}>
            <dt>{x.label}</dt>
            <dd>{x.value}</dd>
          </div>
        ))}
      </dl>
      <div className="bd-act">{action}</div>
      {note && (
        <p data-user-text className="bd-note">
          {note}
        </p>
      )}
      {extra && <div className="bd-extra">{extra}</div>}
    </div>
  );
}
