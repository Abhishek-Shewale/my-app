// app/layout.jsx
import "./globals.css"; // optional — create if you want global styles
export const metadata = {
  title: "WhatsApp Dashboard",
  description: "Monthly WhatsApp analytics dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head />
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <main className="">{children}</main>
      </body>
    </html>
  );
}
