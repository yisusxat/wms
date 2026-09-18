import './globals.css';

export const metadata = {
  title: 'WMS',
  description: 'Warehouse Management System',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
