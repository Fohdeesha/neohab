/**
 * Creating or replacing a stored component, when what is already there is not known for certain.
 *
 * openHAB has no upsert: a create for an existing uid answers 500, an update of a missing one
 * answers 404, and either can happen legitimately - another administrator's tab, or a restore from
 * the version history, adds and removes components behind this one's back. Rather than lose the
 * write, whichever verb was not tried first is tried second.
 *
 * The FIRST failure is what gets reported. The fallback's error only ever describes the symptom of
 * the first one ("cannot update, it is not there"), which is not the problem the user has.
 */
export async function writeWithFallback(
  first: () => Promise<unknown>,
  second: () => Promise<unknown>
): Promise<void> {
  try {
    await first()
  } catch (err) {
    try {
      await second()
    } catch {
      throw err
    }
  }
}
