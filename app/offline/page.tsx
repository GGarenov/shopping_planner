export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="page justify-center text-center">
      <h1 className="text-2xl font-bold">Няма връзка с интернет</h1>
      <p className="opacity-80">Провери връзката си и опитай отново.</p>
      {/* Full page load on purpose: retries the network instead of client-side routing. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn-primary">
        Опитай пак
      </a>
    </main>
  );
}
