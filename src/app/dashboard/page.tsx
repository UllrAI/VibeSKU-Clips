import { redirect } from "next/navigation";

/** The dashboard has one primary job: make one clip. */
export default function DashboardPage() {
  redirect("/dashboard/works");
}
