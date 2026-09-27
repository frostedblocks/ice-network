import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ICE Connect Backend",
  description: "Stripe Connect Express for ICE Network personal stores",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
