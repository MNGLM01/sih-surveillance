/** Where a piece of data on screen actually came from. Every non-trivial
 * value carries one of these so the UI never implies a backend capability
 * that doesn't exist (spec §1, §39). Lives in its own file so both
 * `domain.ts` and `extended.ts` can depend on it without a circular import. */
export type DataSource = 'live' | 'demo' | 'planned' | 'not_connected'
