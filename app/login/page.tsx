import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход · Пазарен план" };

const ERRORS: Record<string, string> = {
  link: "Линкът за вход е невалиден или изтекъл. Поискай нов.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="page justify-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Пазарен план</h1>
        <p className="opacity-80">
          Казваш целта и бюджета си — получаваш 7-дневно меню, което отговаря на калориите и протеина ти, и списък с
          реални продукти от eBag.bg, готов за количката.
        </p>
      </div>
      <LoginForm initialError={error ? (ERRORS[error] ?? ERRORS.link) : undefined} />
      <p className="text-xs opacity-60">Без парола: изпращаме ти линк и код за вход по имейл.</p>
    </main>
  );
}
