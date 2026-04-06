export const metadata = {
  title: "Control Notarial — Alonso y Cía",
  description: "Sistema de control notarial",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: "'Source Sans 3', sans-serif", background: "#faf9f7" }}>{children}</body>
    </html>
  );
}
