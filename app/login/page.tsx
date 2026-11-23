import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход · Пазарен план" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <main className="page justify-center">
      <div className="flex flex-col gap-2">
        <h1 className="sr-only">Пазарен план</h1>
        <Logo size={56} tagline />
        <p className="opacity-80">
          Казваш целта и бюджета си — получаваш 7-дневно меню, което отговаря на калориите и протеина ти, и списък с
          реални продукти от eBag.bg, готов за количката.
        </p>
      </div>
      {deleted && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
          Профилът ти и всички данни към него са изтрити.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
