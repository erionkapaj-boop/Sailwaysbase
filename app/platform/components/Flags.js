"use client";
import { useId } from "react";

// Σημαίες ως SVG, όχι emoji: τα emoji σημαιών δεν εμφανίζονται στα Windows
// (βγαίνουν ως γράμματα «GR») και το DESIGN.md δεν επιτρέπει emoji. Ίδιες
// διαστάσεις (3:2), ίδιο λεπτό περίγραμμα, ίδια στρογγυλεμένη γωνία.
// Νέα γλώσσα = μία νέα σημαία εδώ και το όνομά της στο `flag` του LANGUAGES.

const frame = { display: "block", borderRadius: 3, boxShadow: "0 0 0 1px rgba(22,40,60,0.18)", flexShrink: 0 };

function Greece({ width, height }) {
  return (
    <svg viewBox="0 0 27 18" width={width} height={height} style={frame} aria-hidden="true" focusable="false">
      <rect width="27" height="18" fill="#fff" />
      {[0, 4, 8, 12, 16].map((y) => (
        <rect key={y} y={y} width="27" height="2" fill="#0D5EAF" />
      ))}
      <rect width="10" height="10" fill="#0D5EAF" />
      <rect x="4" width="2" height="10" fill="#fff" />
      <rect y="4" width="10" height="2" fill="#fff" />
    </svg>
  );
}

function GreatBritain({ width, height }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 60 40" width={width} height={height} style={frame} aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <clipPath id={`${id}a`}>
        <rect width="60" height="40" />
      </clipPath>
      <clipPath id={`${id}b`}>
        <path d="M30,20 h30 v20 z v20 h-30 z h-30 v-20 z v-20 h30 z" />
      </clipPath>
      <g clipPath={`url(#${id}a)`}>
        <rect width="60" height="40" fill="#012169" />
        <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
        <path d="M0,0 L60,40 M60,0 L0,40" clipPath={`url(#${id}b)`} stroke="#C8102E" strokeWidth="5" />
        <path d="M30,0 v40 M0,20 h60" stroke="#fff" strokeWidth="13" />
        <path d="M30,0 v40 M0,20 h60" stroke="#C8102E" strokeWidth="8" />
      </g>
    </svg>
  );
}

const FLAGS = { gr: Greece, gb: GreatBritain };

export default function Flag({ name, width = 22 }) {
  const Component = FLAGS[name];
  if (!Component) return null;
  return <Component width={width} height={Math.round((width * 2) / 3)} />;
}
