export const metadata = {
  title: "Sailways | Βάση Αλίμου",
  description: "Σύστημα οργάνωσης εργασιών βάσης",
};

export default function RootLayout({ children }) {
  return (
    <html lang="el">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
