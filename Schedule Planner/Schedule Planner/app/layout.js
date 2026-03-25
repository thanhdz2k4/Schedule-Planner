import "./globals.css";

export const metadata = {
  title: "Schedule Planner",
  description: "Personal schedule planner built with Next.js",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
