import { redirect } from "next/navigation";

/** The dashboard opens on every work, including anything still in progress. */
export default function DashboardPage() {
  redirect("/dashboard/works");
}
