import "./globals.css";
import { Be_Vietnam_Pro, Lora } from "next/font/google";

const bodyFont = Be_Vietnam_Pro({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const headingFont = Lora({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});

export const metadata = {
  title: "Schedule Planner",
  description: "Personal schedule planner built with Next.js",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className={`${bodyFont.variable} ${headingFont.variable}`}>{children}</body>
    </html>
  );
}
