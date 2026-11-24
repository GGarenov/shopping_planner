// Before the E2E run: the test project must have the reference data the planner needs (npm run seed against it),
// and no accounts left over from an interrupted run.
import { admin, deleteTestAccounts } from "./support";

export default async function globalSetup() {
  const db = admin();
  for (const [table, min] of [
    ["recipes", 28],
    ["products", 1000],
  ] as const) {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`E2E: cannot read ${table} on the test project (are the migrations applied?): ${error.message}`);
    if ((count ?? 0) < min)
      throw new Error(`E2E: the test project has ${count ?? 0} ${table}. Seed it first (see README → End-to-end tests).`);
  }
  await deleteTestAccounts();
}
