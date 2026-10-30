import { redirect } from "next/navigation";

// Posts is the app's home; brain's emailed sign-in link lands here.
export default function AppHome() {
  redirect("/app/posts");
}
