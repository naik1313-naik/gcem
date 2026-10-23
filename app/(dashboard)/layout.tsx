import { ConsoleHeader } from "@/components/console/console-header";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const demoMode = isDemoMode();

  return (
    <div className="windsage-app">
      <ConsoleHeader
        name={user.name}
        email={user.email}
        role={user.role}
        demoMode={demoMode}
        canImport={user.role === "Admin"}
      />
      <main className="view">{children}</main>
    </div>
  );
}
