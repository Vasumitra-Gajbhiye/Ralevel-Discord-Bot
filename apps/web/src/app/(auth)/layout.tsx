export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">{children}</div>
    </div>
  );
}
