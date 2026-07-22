import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/Sidebar";
import { ensureSeedAllowlist, isEmailAllowlisted } from "@/lib/access";
import { getEmailFromUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const email = getEmailFromUser(user);
  if (!email || !(await isEmailAllowlisted(email))) {
    redirect("/access-denied");
  }

  await ensureSeedAllowlist();

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}
