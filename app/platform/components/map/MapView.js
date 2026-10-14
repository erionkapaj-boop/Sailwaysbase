"use client";
import dynamic from "next/dynamic";
import { colors, radius } from "../../../../lib/platform/theme";

// Ο κοινός χάρτης της εφαρμογής (docs/MAP_PLAN.md). Φορτώνει τη βιβλιοθήκη μόνο
// όταν εμφανιστεί (δεν βαραίνει τις υπόλοιπες σελίδες). Η διεπαφή βρίσκεται στο
// MapViewInner· εδώ μόνο το «κέλυφος» που φαίνεται όσο φορτώνει.
const Inner = dynamic(() => import("./MapViewInner"), {
  ssr: false,
  loading: () => <div aria-hidden="true" style={{ height: "100%", background: "#E4ECEF" }} />,
});

export default function MapView({ height = 360, ...props }) {
  return (
    <div
      data-map-frame
      style={{ position: "relative", height, borderRadius: radius.lg, overflow: "hidden", border: `1px solid ${colors.border}`, background: "#E4ECEF" }}
    >
      <Inner {...props} />
    </div>
  );
}
