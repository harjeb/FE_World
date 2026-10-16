// Fallback for the status bar before the first GET_STATE arrives: the seeded account's start, an
// arena day on the personal calendar (docs/00 §2). Pages only render after login, so the server's
// values normally replace these immediately.
export const WORLD = {
  day: 209,
  isArenaDay: true,
  nextArenaDay: 239,
  gold: 13_120,
  bexp: 340,
  rank: { place: 169, change: 0 },
  agent: { online: false, activity: '待命' },
};
