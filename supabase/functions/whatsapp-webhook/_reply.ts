// Bot reply templates for the WhatsApp channel (Phase 12).
//
// Templates-first (agreed): the LLM only EXTRACTS booking fields; the bot's
// wording is deterministic, so it can never hallucinate availability, a zone, or
// an opening hour. A later phase can swap this module for free-form generation
// without touching the extraction/validation/availability logic that decides
// WHICH reply to send — this file only maps a decision to words.
//
// Language: the app stores locale per-device (localStorage), not per-restaurant,
// so there's no restaurant language in the database to read. Instead the reply
// follows the GUEST's language, detected from their message — correct for a
// guest-facing bot regardless of staff settings. English + Hebrew for now,
// matching the app's supported locales.

export type Lang = 'en' | 'he'

/** Detect the guest's language from their text. Any Hebrew letter => Hebrew. */
export function detectLang(text: string): Lang {
  return /[֐-׿]/.test(text) ? 'he' : 'en'
}

/** The decisions the flow can turn into a reply. */
export type ReplyKind =
  | 'askName'
  | 'askParty'
  | 'askDateTime'
  | 'askZone'
  | 'unavailable'
  | 'duplicate'
  | 'confirmPrompt'
  | 'received'
  | 'error'

/** Values interpolated into a template. */
export interface ReplyParams {
  name?: string
  partySize?: number
  /** Human-readable date/time already formatted for display. */
  when?: string
  zone?: string
}

type Template = (p: ReplyParams) => string

const TEMPLATES: Record<Lang, Record<ReplyKind, Template>> = {
  en: {
    askName: () => 'Happy to help with a booking! What name should it be under?',
    askParty: (p) => `Thanks${p.name ? ' ' + p.name : ''}. How many people?`,
    askDateTime: () => 'Great — what date and time would you like?',
    askZone: () => 'Any seating area preference?',
    unavailable: (p) =>
      `Sorry, we don't have a table${p.zone ? ' in ' + p.zone : ''}${
        p.when ? ' at ' + p.when : ''
      }. Would another time work?`,
    duplicate: (p) =>
      `Looks like there's already a booking under ${p.name ?? 'that name'}${
        p.when ? ' around ' + p.when : ''
      }. Is this a separate booking? Reply YES to add it.`,
    confirmPrompt: (p) =>
      `Please confirm: a table for ${p.partySize}${p.zone ? ' in ' + p.zone : ''}${
        p.when ? ' on ' + p.when : ''
      }${p.name ? ' under ' + p.name : ''}. Reply YES to send this request.`,
    received: (p) =>
      `Thanks${p.name ? ' ' + p.name : ''}! Your request${
        p.when ? ' for ' + p.when : ''
      } is in — the restaurant will confirm shortly. We'll be in touch.`,
    error: () => 'Sorry, something went wrong on our side. Please try again in a moment.',
  },
  he: {
    askName: () => 'נשמח לעזור בהזמנה! על שם מי לרשום?',
    askParty: (p) => `תודה${p.name ? ' ' + p.name : ''}. כמה סועדים?`,
    askDateTime: () => 'מעולה — לאיזה תאריך ושעה?',
    askZone: () => 'יש העדפה לאזור ישיבה?',
    unavailable: (p) =>
      `מצטערים, אין לנו שולחן פנוי${p.zone ? ' ב' + p.zone : ''}${
        p.when ? ' ב' + p.when : ''
      }. אולי שעה אחרת מתאימה?`,
    duplicate: (p) =>
      `נראה שכבר קיימת הזמנה על שם ${p.name ?? 'זה'}${
        p.when ? ' בסביבות ' + p.when : ''
      }. זו הזמנה נפרדת? השב/י כן כדי להוסיף אותה.`,
    confirmPrompt: (p) =>
      `לאישור: שולחן ל־${p.partySize}${p.zone ? ' ב' + p.zone : ''}${
        p.when ? ' ב' + p.when : ''
      }${p.name ? ' על שם ' + p.name : ''}. השב/י כן כדי לשלוח את הבקשה.`,
    received: (p) =>
      `תודה${p.name ? ' ' + p.name : ''}! הבקשה${
        p.when ? ' ל' + p.when : ''
      } התקבלה — המסעדה תאשר בקרוב. נחזור אליך.`,
    error: () => 'מצטערים, משהו השתבש אצלנו. נסו שוב בעוד רגע.',
  },
}

/** Render a reply in the guest's language. Unknown lang falls back to English. */
export function reply(lang: Lang, kind: ReplyKind, params: ReplyParams = {}): string {
  const set = TEMPLATES[lang] ?? TEMPLATES.en
  return set[kind](params)
}

/**
 * True when the guest's message is an affirmative confirmation. The Hebrew
 * alternation deliberately omits `\b` — JS word boundaries are ASCII-only, so
 * `\b` never matches after a Hebrew letter and would drop "כן".
 */
export function isAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase()
  return (
    /^(yes|yep|yeah|yup|ok|okay|sure|confirm|y)\b/.test(t) ||
    /^(כן|בסדר|אישור|מאשר|מאשרת)/.test(t)
  )
}
