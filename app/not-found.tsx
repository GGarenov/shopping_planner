import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page justify-center">
      <h1 className="text-2xl font-bold">Няма такава страница</h1>
      <p className="opacity-80">Може линкът да е стар или планът да е изтрит.</p>
      <Link href="/" className="btn-primary">
        Към началото
      </Link>
    </main>
  );
}
