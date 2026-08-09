// src/utils/datetime.ts
function isValidDateTime(iso) {
  return !!iso && !Number.isNaN(new Date(iso).getTime());
}

// src/utils/reservationValidation.ts
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateReservation(draft) {
  const errors = {};
  if (!draft.guestName.trim()) {
    errors.guestName = "Guest name is required.";
  }
  if (!Number.isFinite(draft.partySize) || draft.partySize <= 0) {
    errors.partySize = "Party size must be at least 1.";
  }
  if (!isValidDateTime(draft.dateTime)) {
    errors.dateTime = "Choose a valid date and time.";
  }
  if (!Number.isFinite(draft.estimatedDuration) || draft.estimatedDuration <= 0) {
    errors.estimatedDuration = "Duration must be a positive number of minutes.";
  }
  if (!draft.phone.trim()) {
    errors.phone = "Phone is required.";
  }
  if (!draft.preferredZoneId) {
    errors.preferredZoneId = "Zone is required.";
  }
  const email = draft.email.trim();
  if (email && !EMAIL_RE.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}
function isValidDraft(errors) {
  return Object.keys(errors).length === 0;
}

// src/utils/reservations.ts
function findDuplicate(list, candidate, ignoreId) {
  const t = new Date(candidate.dateTime).getTime();
  if (Number.isNaN(t)) return void 0;
  const WINDOW_MS = 90 * 60 * 1e3;
  const name = candidate.guestName.trim().toLowerCase();
  return list.find((r) => {
    if (r.id === ignoreId) return false;
    if (r.guestName.trim().toLowerCase() !== name) return false;
    if (r.partySize !== candidate.partySize) return false;
    const rt = new Date(r.dateTime).getTime();
    return !Number.isNaN(rt) && Math.abs(rt - t) <= WINDOW_MS;
  });
}
export {
  findDuplicate,
  isValidDraft,
  validateReservation
};
