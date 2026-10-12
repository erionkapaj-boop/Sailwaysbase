"use client";

// Άνοιγμα και κλείσιμο με ομαλή κίνηση ύψους και διαφάνειας, χωρίς να μετράμε ύψη με κώδικα:
// η γραμμή ύψους 0fr → 1fr κάνει τη δουλειά. Το κλειστό περιεχόμενο δεν πατιέται και δεν
// διαβάζεται από τον αναγνώστη οθόνης (visibility, με καθυστέρηση ώστε να προλάβει η κίνηση).
// Η κίνηση σβήνει μόνη της για όσους έχουν ζητήσει «λιγότερη κίνηση» (βλ. PlatformShell).
export default function Collapse({ open, children, ms = 260 }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        visibility: open ? "visible" : "hidden",
        transition: `grid-template-rows ${ms}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ms - 60}ms ease, visibility 0s linear ${
          open ? "0s" : `${ms}ms`
        }`,
      }}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}
