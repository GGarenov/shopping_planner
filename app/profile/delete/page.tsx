import type { Metadata } from "next";
import Link from "next/link";
import { requireCompleteProfile } from "@/lib/profile/load";
import { DeleteForm } from "./DeleteForm";

export const metadata: Metadata = { title: "Изтриване на профила · Пазарен план" };

export default async function DeletePage() {
  const { user } = await requireCompleteProfile();
  return (
    <main className="page">
      <Link href="/profile" className="btn-ghost -ml-3 self-start">
        ← Назад
      </Link>
      <h1 className="text-2xl font-bold">Изтриване на профила</h1>
      <p>
        Ще изтрием профила <span className="font-semibold break-all">{user.email}</span> и всички данни към него:
      </p>
      <ul className="list-disc pl-6 text-sm">
        <li>данните ти (пол, възраст, ръст, тегло, цели, бюджет, ограничения)</li>
        <li>всички планове и списъци за пазаруване</li>
        <li>връзката с eBag — прекъсваме достъпа и в eBag</li>
      </ul>
      <p className="text-sm opacity-80">Количката и поръчките ти в eBag не се променят. Това не може да се върне.</p>
      <DeleteForm />
    </main>
  );
}
