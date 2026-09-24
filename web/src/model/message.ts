// a message translated where it is shown, keyed by its English text as t() is. The coverage check reads
// msg() calls the way it reads t() calls, so a key written here cannot go untranslated unnoticed.
export interface Message {
  key: string
  values?: Record<string, string | number>
}

export const msg = (key: string, values?: Record<string, string | number>): Message => ({ key, values })
