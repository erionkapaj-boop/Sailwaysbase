import { Suspense } from "react";
import HomeEntry from "./HomeEntry";
import { container } from "../../lib/platform/theme";

// Home layout (owner, 16/10/2026, after a reference image): helm, name, tagline, a search-style field that opens the
// request flow, and one quiet link to experiences.
//
// Suspense here, not inside HomeEntry itself: HomeEntry reads ?welcome=1
// (see its own comment) via useSearchParams, which the app router requires
// a boundary around.
export default function LandingPage() {
  return (
    <div style={{ position: "relative" }}>
    <div className="sf-home-wrap" style={{ ...container, maxWidth: 940, paddingLeft: 28, paddingRight: 28 }}>
      {/* Only the first step is centred; the wizard starts at the top so the
          question and the action fit on screen without scrolling. */}
      <style
        dangerouslySetInnerHTML={{
          __html: ".sf-home-wrap:has([data-sf-wizard]) { max-width: 680px !important; padding-left: 20px !important; padding-right: 20px !important; } .sf-home:has([data-sf-wizard]) { min-height: 0 !important; justify-content: flex-start !important; padding: 0 !important; }",
        }}
      />
      <div
        className="sf-home"
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "clamp(28px, 6vh, 64px) 0 48px",
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
