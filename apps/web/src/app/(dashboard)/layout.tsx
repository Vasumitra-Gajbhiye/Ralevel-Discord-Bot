import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="dashboard-shell">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}
