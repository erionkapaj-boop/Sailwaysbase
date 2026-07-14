export const metadata = {
  title: "Sailways | Βάση Αλίμου",
  description: "Σύστημα οργάνωσης εργασιών βάσης",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#0B2239",
};

export default function RootLayout({ children }) {
  return (
    <html lang="el">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
