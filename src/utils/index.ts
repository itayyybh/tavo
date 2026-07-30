export { cn } from './cn'
export { createId } from './id'
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
} from './zones'
export { seatsForTable, groupCapacity, floorTotals } from './capacity'
export type { FloorTotals } from './capacity'
export {
  toDateKey,
  toTimeKey,
  splitDateTime,
  combineDateTime,
  isValidDateTime,
  formatTime,
  formatDate,
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
} from './reservations'
export type { ReservationFilter, ReservationSortKey } from './reservations'
export { validateReservation, isValidDraft } from './reservationValidation'
export type {
  ReservationDraft,
  ReservationErrors,
  ReservationErrorField,
} from './reservationValidation'
