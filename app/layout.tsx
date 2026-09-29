import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next.js + Dynatrace OpenTelemetry sample",
  description:
    "Sample Next.js app on Azure App Service exporting OpenTelemetry traces to Dynatrace via instrumentation.ts",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
