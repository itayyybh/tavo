export { cn } from './cn'
export { createId } from './id'
export { mixHex } from './color'
export {
  clamp,
  snap,
  snapPoint,
  screenToWorld,
  worldToScreen,
  pointInRect,
  aabb,
  overlapArea,
  OVERLAP_TOLERANCE,
  pathBlocksRect,
  boxBlocked,
} from './geometry'
export {
  zonesById,
  zoneDepth,
  zoneAncestorIds,
  zoneDescendantIds,
  innermostZoneAt,
  deriveZoneParents,
  countTablesByZone,
} from './zones'
export {
  seatsForTable,
  groupCapacity,
  hypotheticalMergeCapacity,
  floorTotals,
} from './capacity'
export type { FloorTotals } from './capacity'
export { zoneSeatCapacity, zoneRemainingSeats, type ZoneRemainingParams } from './zoneCapacity'
export {
  toDateKey,
  toTimeKey,
  splitDateTime,
  combineDateTime,
  isValidDateTime,
  formatTime,
  formatDate,
  formatClock,
  minutesOfDay,
  todayKey,
  tomorrowKey,
  isOnDay,
} from './datetime'
export {
  statusLabel,
  sourceLabel,
  occasionLabel,
  statusTransitions,
  TERMINAL_STATUSES,
  isActiveStatus,
  canTransition,
  matchesQuery,
  filterReservations,
  sortReservations,
  findDuplicate,
  summarizeReservations,
  zoneReservationUsage,
  bucketByTimeSlot,
  isInSlot,
  SLOT_MINUTES,
} from './reservations'
export type {
  ReservationFilter,
  ReservationSortKey,
  ReservationSummaryData,
  TimeSlot,
} from './reservations'
export { validateReservation, isValidDraft } from './reservationValidation'
export type {
  ReservationDraft,
  ReservationErrors,
  ReservationErrorField,
} from './reservationValidation'
