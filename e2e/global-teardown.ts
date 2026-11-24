// After the E2E run: remove every throwaway account (their profiles, plans and ticks cascade), even if a test failed
// before reaching «delete my account».
import { deleteTestAccounts } from "./support";

export default async function globalTeardown() {
  await deleteTestAccounts();
}
