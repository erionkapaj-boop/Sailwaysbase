import { Suspense } from "react";
import HomeEntry from "./HomeEntry";
import { container } from "../../lib/platform/theme";

// Home layout (owner, 13/10/2026): logo, name, tagline, one filled CTA, one
// quiet secondary line, and the professional door at the bottom.
//
// Suspense here, not inside HomeEntry itself: HomeEntry reads ?welcome=1
// (see its own comment) via useSearchParams, which the app router requires
// a boundary around.
export default function LandingPage() {
  return (
    <div style={{ position: "relative" }}>
    <div style={{ ...container, maxWidth: 680 }}>
      {/* Only the first step is centred; the wizard starts at the top so the
          question and the action fit on screen without scrolling. */}
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
    </div>
  );
}
