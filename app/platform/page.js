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
      {/* Κεντραρισμένο μόνο το πρώτο σκαλοπάτι· ο οδηγός ξεκινά από πάνω, ώστε
          η ερώτηση και η ενέργεια να χωράνε στην οθόνη χωρίς κύλιση. */}
      <style
        dangerouslySetInnerHTML={{
          __html: ".sf-home:has([data-sf-wizard]) { min-height: 0 !important; justify-content: flex-start !important; padding: 0 !important; }",
        }}
      />
      <div
        className="sf-home"
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
