import { redirect } from "next/navigation";

// Παλιός σύνδεσμος: η εγγραφή επαγγελματία ανοίγει κατευθείαν τη φόρμα.
export default function ProfessionalsPage() {
  redirect("/platform/register?as=professional");
}
