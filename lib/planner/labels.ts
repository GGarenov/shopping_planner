// UI labels for planner data live in messages/<locale>/plan.json: plan.slot.<slot>, plan.day.<0..6> (short),
// plan.dayLong.<0..6>. Day names saved inside a plan are Bulgarian — show the translated day by its index instead.
export const slotKey = (slot: string) => `slot.${slot}`;
export const dayShortKey = (index: number) => `day.${index % 7}`;
export const dayLongKey = (index: number) => `dayLong.${index % 7}`;
