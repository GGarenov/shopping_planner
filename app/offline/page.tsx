import { OfflineContent } from "./OfflineContent";

export const dynamic = "force-static";

/** Static (precached by the service worker), so the language is picked on the client from the `lang` cookie. */
export default function OfflinePage() {
  return (
    <main className="page justify-center text-center">
      <OfflineContent />
    </main>
  );
}
