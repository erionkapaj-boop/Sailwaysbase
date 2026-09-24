import { Suspense } from "react";
import HomeEntry from "./HomeEntry";
import { container } from "../../lib/platform/theme";

// No tagline by design (brief §4): better nothing than a line that doesn't
// earn its place. The first screen is the CTA and one quiet secondary link.
//
// Suspense here, not inside HomeEntry itself: HomeEntry reads ?welcome=1
// (see its own comment) via useSearchParams, which the app router requires
// a boundary around.
export default function LandingPage() {
  return (
    <div style={{ ...container, maxWidth: 680 }}>
      <div
        style={{
          minHeight: "58vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px 0",
        }}
      >
        <Suspense fallback={null}>
          <HomeEntry />
        </Suspense>
      </div>
    </div>
  );
}
