// src/utils/geometry.ts
function aabb(center, size) {
  return {
    x: center.x - size.x / 2,
    y: center.y - size.y / 2,
    width: size.x,
    height: size.y
  };
}

// src/utils/zones.ts
function zoneAllowsRelocation(zone) {
  if (!zone) return false;
  return zone.allowTableRelocation ?? zone.smoking != null;
}

// src/utils/capacity.ts
function seatsForTable(table, type) {
  if (!type) return 0;
  return table.mergedGroupId ? type.connectedCapacity : type.soloCapacity;
}
function typeOf(table, types) {
  return types.find((t) => t.id === table.typeId);
}
function hypotheticalMergeCapacity(tables, types) {
  if (tables.length < 2) return 0;
  const sum = tables.reduce(
    (total, t) => total + (typeOf(t, types)?.connectedCapacity ?? 0),
    0
  );
  return tables.length >= 3 ? Math.max(0, sum - (tables.length - 1)) : sum;
}

// src/utils/reservations.ts
var TERMINAL_STATUSES = [
  "completed",
  "cancelled",
  "no_show"
];
function isActiveStatus(status) {
  return !TERMINAL_STATUSES.includes(status);
}

// src/services/seating/canSeat.ts
var MINUTE = 6e4;
function heldTableIds(reservation) {
  return reservation.assignedTableIds ?? [];
}
function windowsCollide(aStart, aEnd, bStart, bEnd, buffer) {
  return aStart < bEnd + buffer && bStart < aEnd + buffer;
}
function busyTableIds(reservation, floor, others) {
  const start = Date.parse(reservation.dateTime);
  const end = start + reservation.estimatedDuration * MINUTE;
  const buffer = floor.config.turnoverBufferMin * MINUTE;
  const busy = /* @__PURE__ */ new Set();
  for (const other of others) {
    if (other.id === reservation.id || !isActiveStatus(other.status)) continue;
    const oStart = Date.parse(other.dateTime);
    const oEnd = oStart + other.estimatedDuration * MINUTE;
    if (!windowsCollide(start, end, oStart, oEnd, buffer)) continue;
    for (const id of heldTableIds(other)) busy.add(id);
  }
  return busy;
}
function hasTimeConflict(reservation, candidate, floor, others) {
  const busy = busyTableIds(reservation, floor, others);
  return candidate.tableIds.some((id) => busy.has(id));
}
function canSeat(reservation, candidate, floor, others = []) {
  const reasons = [];
  if (candidate.seats < reservation.partySize) {
    reasons.push({
      key: "reason.seatsPartyOf",
      params: { seats: candidate.seats, party: reservation.partySize }
    });
  } else if (candidate.kind === "single" && candidate.seats - reservation.partySize > floor.config.maxUnderfill) {
    reasons.push({
      key: "reason.tooLarge",
      params: { seats: candidate.seats, party: reservation.partySize }
    });
  }
  if (hasTimeConflict(reservation, candidate, floor, others)) {
    reasons.push({ key: "reason.bookedAtTime" });
  }
  return { ok: reasons.length === 0, reasons };
}

// src/services/seating/geometry.ts
function tableFootprint(table) {
  return aabb(table.position, table.size);
}
function centerDistance(a, b) {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}
function boundingBoxOf(tables) {
  if (tables.length === 0) return void 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tables) {
    const box = tableFootprint(t);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// src/services/seating/mergeRules.ts
var sameZone = {
  id: "same-zone",
  label: "Members share a zone",
  kind: "membership",
  test: (members, ctx) => {
    if (ctx.config.allowCrossZoneMerge) return true;
    const zoneId = members[0]?.zoneId ?? "";
    return members.every((t) => t.zoneId === zoneId) ? true : "Tables are in different zones";
  }
};
var notForbidden = {
  id: "forbidden-combo",
  label: "Not a forbidden combination",
  kind: "membership",
  test: (members, ctx) => {
    const ids = new Set(members.map((t) => t.id));
    const labels = new Set(members.map((t) => t.label));
    const exactMatch = (combo, set) => combo.length === set.size && combo.every((v) => set.has(v));
    const blocked = ctx.config.forbiddenCombos.some((combo) => exactMatch(combo, ids)) || (ctx.config.forbiddenLabelCombos ?? []).some((combo) => exactMatch(combo, labels));
    return blocked ? "This exact set of tables can\u2019t be merged" : true;
  }
};
var withinMaxSize = {
  id: "max-merge-size",
  label: "Within max merge size",
  kind: "membership",
  test: (members, ctx) => {
    const max = ctx.config.maxMergeSize;
    return max == null || members.length <= max ? true : `A merge can\u2019t exceed ${max} tables`;
  }
};
var stayInZoneBounds = {
  id: "stay-in-zone-bounds",
  label: "Merged group stays inside its zone",
  kind: "placement",
  test: () => true
  // TODO(phase-8): reject when the merged footprint leaves its zone
};
var noObstacleOverlap = {
  id: "no-obstacle-overlap",
  label: "Merged group clears obstacles",
  kind: "placement",
  test: () => true
  // TODO(phase-8): reject when the footprint covers a wall/object/path
};
var noTableOverlap = {
  id: "no-table-overlap",
  label: "Merged group clears other tables",
  kind: "placement",
  test: () => true
  // TODO(phase-8): reject when the footprint overlaps a non-member table
};
var MERGE_RULES = [
  sameZone,
  notForbidden,
  withinMaxSize,
  stayInZoneBounds,
  noObstacleOverlap,
  noTableOverlap
];
function evaluateMerge(members, ctx, kind = "membership") {
  if (members.length < 2) {
    return {
      ok: false,
      failedRuleId: "min-members",
      reason: "A merge needs at least two tables"
    };
  }
  for (const rule of MERGE_RULES) {
    if (rule.kind !== kind) continue;
    const result = rule.test(members, ctx);
    if (result !== true) {
      return { ok: false, failedRuleId: rule.id, reason: result };
    }
  }
  return { ok: true };
}

// src/services/seating/candidates.ts
function comboKey(ids) {
  return [...ids].sort().join("+");
}
function singleCandidates(floor) {
  return floor.tables.filter((t) => t.status === "available").map((t) => ({
    kind: "single",
    tableIds: [t.id],
    tables: [t],
    seats: seatsForTable(
      t,
      floor.tableTypes.find((ty) => ty.id === t.typeId)
    ),
    zoneId: t.zoneId
  }));
}
function mergeCandidates(reservation, floor) {
  const available = floor.tables.filter((t) => t.status === "available");
  const maxSize = floor.config.merge.maxMergeSize ?? Infinity;
  const ctx = {
    zones: floor.zones,
    obstacles: floor.obstacles,
    tableTypes: floor.tableTypes,
    allTables: floor.tables,
    config: floor.config.merge
  };
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const capOf = (t) => floor.tableTypes.find((ty) => ty.id === t.typeId)?.connectedCapacity ?? 0;
  const seeds = [...available].sort((a, b) => capOf(b) - capOf(a));
  for (const seed of seeds) {
    const pool = available.filter((t) => t.id !== seed.id).filter((t) => floor.config.merge.allowCrossZoneMerge || t.zoneId === seed.zoneId).sort((a, b) => centerDistance(seed, a) - centerDistance(seed, b));
    let members = [seed];
    for (const cand of pool) {
      if (members.length >= maxSize) break;
      const trial = [...members, cand];
      if (!evaluateMerge(trial, ctx).ok) continue;
      members = trial;
      const seats = hypotheticalMergeCapacity(members, floor.tableTypes);
      if (seats >= reservation.partySize) {
        const key = comboKey(members.map((t) => t.id));
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            kind: "merge",
            tableIds: [...members.map((t) => t.id)].sort(),
            tables: members,
            seats,
            zoneId: seed.zoneId
          });
        }
        break;
      }
    }
  }
  if (floor.config.merge.lastResortGatherZone !== false) {
    const satisfiedZones = new Set(
      out.filter((c) => c.seats >= reservation.partySize).map((c) => c.zoneId)
    );
    out.push(...gatherFromZone(reservation, floor, ctx, available, seen, satisfiedZones));
  }
  return out;
}
function gatherFromZone(reservation, floor, ctx, available, seen, skipZones) {
  const maxSize = floor.config.merge.maxMergeSize ?? Infinity;
  const capOf = (t) => floor.tableTypes.find((ty) => ty.id === t.typeId)?.connectedCapacity ?? 0;
  const zoneIds = new Set(available.map((t) => t.zoneId));
  const out = [];
  for (const zoneId of zoneIds) {
    if (skipZones.has(zoneId)) continue;
    const pool = available.filter((t) => t.zoneId === zoneId).sort((a, b) => capOf(b) - capOf(a));
    let members = [];
    for (const cand of pool) {
      if (members.length >= maxSize) break;
      const trial = [...members, cand];
      if (trial.length >= 2 && !evaluateMerge(trial, ctx).ok) continue;
      members = trial;
      if (members.length < 2) continue;
      const seats = hypotheticalMergeCapacity(members, floor.tableTypes);
      if (seats >= reservation.partySize) {
        const key = comboKey(members.map((t) => t.id));
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            kind: "merge",
            tableIds: [...members.map((t) => t.id)].sort(),
            tables: members,
            seats,
            zoneId
          });
        }
        break;
      }
    }
  }
  return out;
}
function largePartyRestrictions(reservation, floor) {
  const rules = floor.config.merge.largePartyRules ?? [];
  const active = rules.filter((r) => reservation.partySize >= r.minPartySize);
  if (active.length === 0) return [];
  const zoneByName = new Map(floor.zones.map((z) => [z.name, z]));
  const out = [];
  for (const rule of active) {
    const zone = zoneByName.get(rule.zoneName);
    if (!zone) continue;
    const byLabel = new Map(
      floor.tables.filter((t) => t.zoneId === zone.id).map((t) => [t.label, t])
    );
    const allowedKeys = /* @__PURE__ */ new Set();
    const injected = [];
    for (const combo of rule.allowedCombos) {
      const tables = combo.map((label) => byLabel.get(label)).filter((t) => !!t);
      if (tables.length !== combo.length) continue;
      allowedKeys.add(comboKey(tables.map((t) => t.id)));
      if (tables.every((t) => t.status === "available")) {
        injected.push({
          kind: "merge",
          tableIds: [...tables.map((t) => t.id)].sort(),
          tables,
          seats: hypotheticalMergeCapacity(tables, floor.tableTypes),
          zoneId: zone.id
        });
      }
    }
    out.push({ zoneId: zone.id, allowedKeys, injected });
  }
  return out;
}
function preferredComboInjections(reservation, floor) {
  const combos = (floor.config.merge.preferredCombos ?? []).filter(
    (c) => reservation.partySize >= c.minPartySize
  );
  if (combos.length === 0) return [];
  const zoneByName = new Map(floor.zones.map((z) => [z.name, z]));
  const out = [];
  for (const rule of combos) {
    const zone = zoneByName.get(rule.zoneName);
    if (!zone) continue;
    const byLabel = new Map(
      floor.tables.filter((t) => t.zoneId === zone.id).map((t) => [t.label, t])
    );
    const tables = rule.combo.map((label) => byLabel.get(label)).filter((t) => !!t);
    if (tables.length !== rule.combo.length || tables.length < 2) continue;
    if (!tables.every((t) => t.status === "available")) continue;
    out.push({
      kind: "merge",
      tableIds: [...tables.map((t) => t.id)].sort(),
      tables,
      seats: hypotheticalMergeCapacity(tables, floor.tableTypes),
      zoneId: zone.id
    });
  }
  return out;
}
function generateCandidates(reservation, floor, others = []) {
  let result = [
    ...singleCandidates(floor),
    ...mergeCandidates(reservation, floor)
  ];
  for (const cand of preferredComboInjections(reservation, floor)) {
    if (!result.some((c) => comboKey(c.tableIds) === comboKey(cand.tableIds))) {
      result.push(cand);
    }
  }
  const restrictions = largePartyRestrictions(reservation, floor);
  if (restrictions.length > 0) {
    const byZone = new Map(restrictions.map((r) => [r.zoneId, r]));
    result = result.filter((c) => {
      const r = byZone.get(c.zoneId);
      return !r || r.allowedKeys.has(comboKey(c.tableIds));
    });
    const seen = new Set(result.map((c) => comboKey(c.tableIds)));
    for (const r of restrictions) {
      for (const cand of r.injected) {
        const key = comboKey(cand.tableIds);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(cand);
        }
      }
    }
  }
  const zoneById = new Map(floor.zones.map((z) => [z.id, z]));
  const donorOk = (zoneId) => zoneAllowsRelocation(zoneById.get(zoneId));
  const preferredId = reservation.preferredZoneId;
  const bringAllowed = !!preferredId && donorOk(preferredId);
  const withBrings = bringAllowed ? [
    ...withBringOptions(reservation, result, donorOk),
    ...bringToMergeCandidates(reservation, floor, others, donorOk)
  ] : result;
  return dedupeCandidates(restrictToPreferredZone(reservation, withBrings));
}
function dedupeCandidates(candidates) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const c of candidates) {
    const key = `${comboKey(c.tableIds)}|${c.relocateToZoneId ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}
function bringToMergeCandidates(reservation, floor, others, donorOk) {
  const preferred = reservation.preferredZoneId;
  if (!preferred) return [];
  const busy = busyTableIds(reservation, floor, others);
  const free = floor.tables.filter((t) => t.status === "available" && !busy.has(t.id));
  const inZone = free.filter((t) => t.zoneId === preferred);
  const otherZone = free.filter((t) => t.zoneId !== preferred && donorOk(t.zoneId));
  if (inZone.length === 0 || otherZone.length === 0) return [];
  const typeOf2 = (t) => floor.tableTypes.find((ty) => ty.id === t.typeId);
  const connectedOf = (t) => typeOf2(t)?.connectedCapacity ?? 0;
  const soloOf = (t) => typeOf2(t)?.soloCapacity ?? 0;
  const usageOf = (id) => others.filter((o) => isActiveStatus(o.status) && o.assignedTableIds?.includes(id)).length;
  const donors = [...otherZone].sort(
    (a, b) => usageOf(a.id) - usageOf(b.id) || connectedOf(a) - connectedOf(b)
  );
  const ctx = {
    zones: floor.zones,
    obstacles: floor.obstacles,
    tableTypes: floor.tableTypes,
    allTables: floor.tables,
    config: { ...floor.config.merge, allowCrossZoneMerge: true }
  };
  const maxSize = floor.config.merge.maxMergeSize ?? Infinity;
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const anchor of inZone) {
    if (soloOf(anchor) >= reservation.partySize) continue;
    let members = [anchor];
    for (const donor of donors) {
      if (members.length >= maxSize) break;
      const trial = [...members, donor];
      if (!evaluateMerge(trial, ctx).ok) continue;
      members = trial;
      const seats = hypotheticalMergeCapacity(members, floor.tableTypes);
      if (seats >= reservation.partySize) {
        const key = comboKey(members.map((t) => t.id));
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            kind: "merge",
            tableIds: [...members.map((t) => t.id)].sort(),
            tables: members,
            seats,
            zoneId: preferred,
            relocateToZoneId: preferred
          });
        }
        break;
      }
    }
  }
  return out;
}
function restrictToPreferredZone(reservation, candidates) {
  const preferred = reservation.preferredZoneId;
  if (!preferred) return candidates;
  return candidates.filter(
    (c) => c.zoneId === preferred || c.relocateToZoneId === preferred
  );
}
function withBringOptions(reservation, candidates, donorOk) {
  const preferred = reservation.preferredZoneId;
  if (!preferred) return candidates;
  const brings = candidates.filter((c) => c.kind === "single" && c.zoneId !== preferred && donorOk(c.zoneId)).map((c) => ({ ...c, relocateToZoneId: preferred }));
  return [...candidates, ...brings];
}

// src/services/seating/score.ts
function span(candidate) {
  const box = boundingBoxOf(candidate.tables);
  return box ? Math.hypot(box.width, box.height) : 0;
}
function scoreCandidate(reservation, candidate, floor) {
  const { weights, merge } = floor.config;
  const reasons = [];
  let score = 0;
  const waste = candidate.seats - reservation.partySize;
  score += weights.capacityFit / (1 + Math.max(0, waste));
  if (waste === 0) reasons.push({ key: "reason.exactFit" });
  else
    reasons.push({
      key: "reason.seatsFor",
      params: { seats: candidate.seats, party: reservation.partySize }
    });
  const preferred = reservation.preferredZoneId;
  if (preferred && candidate.zoneId === preferred) {
    score += weights.zoneMatch;
    reasons.push({ key: "reason.preferredZone" });
  } else if (preferred && candidate.relocateToZoneId === preferred) {
    score += weights.zoneMatch * 0.6;
    reasons.push({ key: "reason.bringToPreferredZone" });
  }
  const requestedLabels = reservation.parsedRequest?.tableLabels ?? [];
  const matchesRequestedTable = !!reservation.preferredTableId && candidate.tableIds.includes(reservation.preferredTableId) || requestedLabels.length > 0 && candidate.tables.some((table) => requestedLabels.includes(table.label));
  if (matchesRequestedTable) {
    score += weights.preferredTable;
    reasons.push({ key: "reason.requestedTable" });
  }
  const requestedShape = reservation.parsedRequest?.shape;
  if (requestedShape && candidate.tables.some(
    (table) => floor.tableTypes.find((ty) => ty.id === table.typeId)?.shape === requestedShape
  )) {
    score += weights.requestedShape;
    reasons.push({ key: "reason.requestedShape", params: { shape: requestedShape } });
  }
  if (candidate.kind === "single") {
    score += weights.singleTable;
    reasons.push({ key: "reason.singleTable" });
  } else {
    score += merge.proximityWeight * 100 / (100 + span(candidate));
    reasons.push({ key: "reason.mergeOf", params: { count: candidate.tables.length } });
    const preferredCombos = merge.preferredCombos ?? [];
    if (preferredCombos.length > 0) {
      const zoneName = floor.zones.find((z) => z.id === candidate.zoneId)?.name;
      const labels = new Set(candidate.tables.map((t) => t.label));
      const matches = preferredCombos.some(
        (pc) => pc.zoneName === zoneName && reservation.partySize >= pc.minPartySize && pc.combo.length === labels.size && pc.combo.every((l) => labels.has(l))
      );
      if (matches) {
        score += weights.preferredCombo;
        reasons.push({ key: "reason.preferredCombo" });
      }
    }
  }
  return { candidate, score, reasons };
}

// src/services/seating/ruleScorer.ts
var ruleScorer = {
  rank(reservation, candidates, floor) {
    return candidates.map((candidate) => scoreCandidate(reservation, candidate, floor)).sort((a, b) => b.score - a.score);
  }
};

// src/services/seating/suggest.ts
var DEFAULT_SUGGESTION_LIMIT = 5;
function suggestSeating(reservation, floor, others = [], limit = DEFAULT_SUGGESTION_LIMIT, scorer = ruleScorer) {
  const feasible = generateCandidates(reservation, floor, others).filter(
    (candidate) => canSeat(reservation, candidate, floor, others).ok
  );
  return scorer.rank(reservation, feasible, floor).slice(0, limit);
}
function explainNoFit(reservation, floor, others = []) {
  const candidates = generateCandidates(reservation, floor, others);
  if (candidates.length === 0) return { key: "reason.noFreeTables" };
  const bigEnough = candidates.filter((c) => c.seats >= reservation.partySize);
  if (bigEnough.length === 0) {
    const max = Math.max(...candidates.map((c) => c.seats));
    return {
      key: "reason.largestSeats",
      params: {
        max,
        party: reservation.partySize,
        limit: floor.config.merge.maxMergeSize ?? 0
      }
    };
  }
  return { key: "reason.allBooked" };
}

// src/services/availability.ts
function probeReservation(input) {
  return {
    id: "__availability_probe__",
    guestName: "",
    partySize: input.partySize,
    dateTime: input.dateTime,
    estimatedDuration: input.estimatedDuration,
    preferredZoneId: input.zoneId,
    status: "pending",
    source: "phone",
    preferences: input.preferences,
    createdAt: "",
    updatedAt: ""
  };
}
async function checkAvailability(input, floor, others) {
  const probe = probeReservation(input);
  const suggestions = suggestSeating(probe, floor, others, 50);
  const inZone = suggestions.filter(
    (s) => s.candidate.zoneId === input.zoneId && !s.candidate.relocateToZoneId
  );
  if (inZone.length > 0) return { available: true };
  return { available: false, reason: explainNoFit(probe, floor, others) };
}

// src/services/settings/bookingRules.ts
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day2 = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day2}`;
}
function clock(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function evaluateBookingRules(ctx) {
  const { rules, restrictions } = ctx;
  const out = [];
  const at = new Date(ctx.dateTime);
  if (Number.isNaN(at.getTime())) return out;
  const key = dateKey(at);
  const time = clock(at);
  if (!ctx.vip) {
    const closure = restrictions.closure;
    if (closure.active && (closure.until == null || key < closure.until)) {
      out.push({
        field: "dateTime",
        code: closure.until ? "closedUntil" : "closed",
        params: closure.until ? { until: closure.until } : void 0
      });
    }
    for (const b of restrictions.blocks) {
      if (b.date !== key) continue;
      const wholeDay = !b.from || !b.to;
      if (wholeDay || time >= b.from && time <= b.to) {
        out.push({ field: "dateTime", code: "blockedDate" });
        break;
      }
    }
    const weekday = at.getDay();
    for (const r of restrictions.recurring ?? []) {
      if (r.day !== weekday) continue;
      const wholeDay = !r.from || !r.to;
      if (wholeDay || time >= r.from && time <= r.to) {
        out.push({ field: "dateTime", code: "blockedRecurring" });
        break;
      }
    }
  }
  const day2 = ctx.openingHours[at.getDay()];
  if (!day2.open) {
    out.push({ field: "dateTime", code: "closedDay" });
  } else {
    if (time < day2.from) {
      out.push({ field: "dateTime", code: "beforeOpening", params: { from: day2.from } });
    } else if (!rules.allowAfterClosing) {
      if (day2.lastSeating && time > day2.lastSeating) {
        out.push({
          field: "dateTime",
          code: "afterLastSeating",
          params: { time: day2.lastSeating }
        });
      } else if (time > day2.to) {
        out.push({ field: "dateTime", code: "afterClosing", params: { time: day2.to } });
      }
    }
  }
  if (rules.latestBookingTime && time > rules.latestBookingTime) {
    out.push({
      field: "dateTime",
      code: "afterLatest",
      params: { time: rules.latestBookingTime }
    });
  }
  if (ctx.isNew) {
    if (!rules.allowSameDay && key === dateKey(ctx.now)) {
      out.push({ field: "dateTime", code: "noSameDay" });
    }
    const leadMs = at.getTime() - ctx.now.getTime();
    if (leadMs < rules.minAdvanceMinutes * 6e4) {
      out.push({
        field: "dateTime",
        code: "tooSoon",
        params: { minutes: rules.minAdvanceMinutes }
      });
    }
  }
  if (ctx.partySize < rules.minPartySize) {
    out.push({ field: "partySize", code: "partyTooSmall", params: { min: rules.minPartySize } });
  } else if (ctx.partySize > rules.maxPartySize) {
    out.push({ field: "partySize", code: "partyTooLarge", params: { max: rules.maxPartySize } });
  }
  if (ctx.preferredZoneId) {
    const zone = ctx.zones.find((z) => z.id === ctx.preferredZoneId);
    if (zone && zone.bookable === false) {
      out.push({
        field: "preferredZoneId",
        code: "zoneClosed",
        params: { zone: zone.name }
      });
    }
  }
  return out;
}

// src/services/settings/defaults.ts
var day = (open, from) => ({
  open,
  from,
  to: "23:00",
  lastSeating: null
});
var DEFAULT_OPENING_HOURS = [
  day(true, "08:30"),
  // 0 Sun
  day(true, "08:30"),
  // 1 Mon
  day(true, "08:30"),
  // 2 Tue
  day(true, "08:30"),
  // 3 Wed
  day(true, "08:30"),
  // 4 Thu
  day(true, "08:30"),
  // 5 Fri
  day(true, "11:00")
  // 6 Sat
];
var DEFAULT_RESERVATION_RULES = {
  latestBookingTime: null,
  minAdvanceMinutes: 30,
  allowSameDay: true,
  allowAfterClosing: false,
  minPartySize: 1,
  maxPartySize: 20,
  allowSplitParty: false,
  allowAltZoneSuggestions: true
};
var DEFAULT_BOOKING_RESTRICTIONS = {
  blocks: [],
  recurring: [],
  closure: { active: false, until: null }
};

// src/services/supabase/layoutMappers.ts
function zoneFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    size: r.size,
    parentId: r.parent_id ?? void 0,
    smoking: r.smoking ?? void 0,
    allowTableRelocation: r.allow_table_relocation ?? void 0,
    bookable: r.bookable ?? void 0,
    arrangeDir: r.arrange_dir ?? void 0
  };
}
function tableFromRow(r) {
  return {
    id: r.id,
    zoneId: r.zone_id,
    typeId: r.type_id,
    label: r.label,
    position: r.position,
    size: r.size,
    rotation: r.rotation,
    status: r.status,
    mergedGroupId: r.merged_group_id ?? void 0,
    zonePinned: r.zone_pinned ?? void 0
  };
}
function tableTypeFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    shape: r.shape,
    defaultSize: r.default_size,
    clearance: r.clearance,
    soloCapacity: r.solo_capacity,
    connectedCapacity: r.connected_capacity
  };
}
function obstacleFromRow(r) {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label ?? void 0,
    position: r.position,
    size: r.size,
    rotation: r.rotation,
    points: r.points ?? void 0,
    brushWidth: r.brush_width ?? void 0
  };
}
function connectionFromRow(r) {
  return {
    id: r.id,
    tableIds: r.table_ids,
    seats: r.seats ?? void 0,
    clearance: r.clearance ?? void 0
  };
}

// src/services/seating/defaultConfig.ts
var DEFAULT_SEATING_CONFIG = {
  merge: {
    forbiddenCombos: [],
    // 11 + 12 may not merge on their own (only inside a bigger combo like
    // 7+10+11+12, which is a different set and stays allowed).
    forbiddenLabelCombos: [["11", "12"]],
    maxMergeSize: 5,
    allowCrossZoneMerge: false,
    proximityWeight: 1,
    // Inside, a party of 13+ may only take the 7+10+11+12 combo.
    largePartyRules: [
      { zoneName: "Inside", minPartySize: 13, allowedCombos: [["7", "10", "11", "12"]] }
    ],
    lastResortGatherZone: true
  },
  turnoverBufferMin: 15,
  maxUnderfill: 2,
  weights: {
    capacityFit: 10,
    zoneMatch: 6,
    // Deliberately above the sum of the other weights so a REQUESTED table
    // (preferredTableId, or a table parsed from the notes) wins over a tighter
    // fit / preferred zone / combo whenever it's a feasible option. Still soft:
    // an infeasible table (wrong size, occupied, forbidden) is never offered.
    preferredTable: 40,
    requestedShape: 5,
    singleTable: 3,
    preferredCombo: 12
  }
};

// src/services/supabase/mappers.ts
function reservationFromRow(row) {
  return {
    id: row.id,
    guestName: row.guest_name,
    phone: row.phone ?? void 0,
    email: row.email ?? void 0,
    partySize: row.party_size,
    dateTime: row.date_time,
    estimatedDuration: row.estimated_duration,
    preferredZoneId: row.preferred_zone_id ?? void 0,
    preferredTableId: row.preferred_table_id ?? void 0,
    assignedTableIds: row.assigned_table_ids ?? void 0,
    assignmentSource: row.assignment_source ?? void 0,
    occasion: row.occasion ?? void 0,
    status: row.status,
    source: row.source,
    preferences: row.preferences ?? void 0,
    notes: row.notes ?? void 0,
    parsedRequest: row.parsed_request ?? void 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// src/services/seating/availabilityServer.ts
async function evaluateAvailability(input, data) {
  const floor = {
    tables: data.tables.map(tableFromRow),
    tableTypes: data.tableTypes.map(tableTypeFromRow),
    zones: data.zones.map(zoneFromRow),
    obstacles: data.obstacles.map(obstacleFromRow),
    mergedGroups: data.connections.map(connectionFromRow),
    config: hasConfig(data.seating) ? data.seating : DEFAULT_SEATING_CONFIG
  };
  const violation = evaluateBookingRules({
    partySize: input.partySize,
    dateTime: input.dateTime,
    preferredZoneId: input.zoneId,
    openingHours: Array.isArray(data.openingHours) && data.openingHours.length === 7 ? data.openingHours : DEFAULT_OPENING_HOURS,
    rules: { ...DEFAULT_RESERVATION_RULES, ...data.reservationRules ?? {} },
    restrictions: {
      blocks: data.bookingRestrictions?.blocks ?? [],
      recurring: data.bookingRestrictions?.recurring ?? [],
      closure: {
        ...DEFAULT_BOOKING_RESTRICTIONS.closure,
        ...data.bookingRestrictions?.closure ?? {}
      }
    },
    zones: floor.zones,
    now: /* @__PURE__ */ new Date(),
    isNew: true,
    vip: !!input.preferences?.vip
  })[0];
  if (violation) {
    return { available: false, reason: { key: `rules.${violation.code}`, params: violation.params } };
  }
  const others = data.reservations.map(reservationFromRow);
  return checkAvailability(input, floor, others);
}
function hasConfig(value) {
  return !!value && typeof value === "object" && "merge" in value;
}
export {
  evaluateAvailability
};
