import { redirect } from "next/navigation";

/**
 * My Day is the dashboard now.
 *
 * Leon asked for the two to be one screen: a counsellor was checking a
 * queue here and a set of numbers there, and neither page told them how the
 * month was going. The queue moved to `/dashboard` in full, next to "Your
 * numbers".
 *
 * This route stays as a redirect rather than being deleted. It is in
 * bookmarks, in the notification fallback path, and in the staff handbook,
 * and a 404 for any of those is a worse outcome than one extra hop.
 */
export default function MyDayPage() {
  redirect("/dashboard");
}
