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
  | 'askSmoking'
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
    askSmoking: () => 'Sure — smoking or non-smoking?',
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
    askSmoking: () => 'בטח — מעשנים או לא מעשנים?',
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

/** The engine's locale-free reason descriptor for an unavailable slot. */
export interface Reason {
  key: string
  params?: Record<string, string | number>
}

type ReasonParams = Record<string, string | number>

/**
 * Specific guest-facing messages for the CONFIGURED booking limits — party size
 * and time — so the bot states the actual rule ("latest booking is 20:30",
 * "largest party is 20") instead of a vague "no table". Keyed by the engine's
 * booking-rule code (reason.key = `rules.<code>`). Physical no-fit reasons
 * (reason.<x>) aren't listed and fall back to the generic unavailable message.
 */
const RULE_MESSAGES: Record<Lang, Record<string, (p: ReasonParams) => string>> = {
  en: {
    partyTooLarge: (p) => `Sorry, the largest party we can book is ${p.max}.`,
    partyTooSmall: (p) => `Bookings are for at least ${p.min} guest(s).`,
    afterLatest: (p) => `Our latest booking time is ${p.time}. Could you come earlier?`,
    afterClosing: (p) => `We close at ${p.time} that day. Would an earlier time work?`,
    afterLastSeating: (p) => `Our last seating is at ${p.time}. Something earlier?`,
    beforeOpening: (p) => `We open at ${p.from} that day. Would a later time work?`,
    closedDay: () => "We're closed that day. Would another day work?",
    noSameDay: () => "We can't take same-day bookings — please pick another day.",
    tooSoon: (p) => `Bookings need at least ${p.minutes} minutes' notice.`,
    closed: () => 'Bookings are closed right now.',
    closedUntil: (p) => `Bookings are closed until ${p.until}.`,
    blockedDate: () => "That date isn't available for bookings.",
    zoneClosed: (p) => `${p.zone} is closed for bookings — would another area work?`,
  },
  he: {
    partyTooLarge: (p) => `מצטערים, גודל הקבוצה המרבי להזמנה הוא ${p.max}.`,
    partyTooSmall: (p) => `ההזמנה היא לפחות ל־${p.min} סועדים.`,
    afterLatest: (p) => `שעת ההזמנה האחרונה שלנו היא ${p.time}. אפשר מוקדם יותר?`,
    afterClosing: (p) => `אנחנו סוגרים ב־${p.time} ביום זה. אולי שעה מוקדמת יותר?`,
    afterLastSeating: (p) => `ההושבה האחרונה שלנו ב־${p.time}. משהו מוקדם יותר?`,
    beforeOpening: (p) => `אנחנו נפתחים ב־${p.from} ביום זה. אולי שעה מאוחרת יותר?`,
    closedDay: () => 'אנחנו סגורים ביום זה. אולי יום אחר?',
    noSameDay: () => 'לא ניתן להזמין לאותו יום — בחרו יום אחר.',
    tooSoon: (p) => `יש להזמין לפחות ${p.minutes} דקות מראש.`,
    closed: () => 'ההזמנות סגורות כרגע.',
    closedUntil: (p) => `ההזמנות סגורות עד ${p.until}.`,
    blockedDate: () => 'התאריך הזה אינו זמין להזמנות.',
    zoneClosed: (p) => `${p.zone} סגור להזמנות — אולי אזור אחר?`,
  },
}

/**
 * Message for an unavailable slot. When the engine rejected on a configured
 * booking rule (party size / time), state that specific limit; otherwise fall
 * back to the generic "no table, try another time".
 */
export function unavailableReply(
  lang: Lang,
  reason: Reason | undefined,
  params: ReplyParams = {},
): string {
  if (reason?.key?.startsWith('rules.')) {
    const code = reason.key.slice('rules.'.length)
    const set = RULE_MESSAGES[lang] ?? RULE_MESSAGES.en
    const msg = set[code]
    if (msg) return msg(reason.params ?? {})
  }
  return reply(lang, 'unavailable', params)
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
