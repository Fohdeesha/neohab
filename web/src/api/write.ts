// openHAB has no upsert: create answers 500 when it exists and update answers 404 when it does not, so try the
// other verb
export async function writeWithFallback(first: () => Promise<unknown>, second: () => Promise<unknown>): Promise<void> {
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
