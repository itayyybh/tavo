---
name: data-model
description: Data modeling rules for the restaurant domain — never hardcode restaurant logic, everything must be configurable. Models flow Restaurant → Zones → Tables → Merged Tables → Reservations → Rules. Use when designing types, schemas, stores, capacities, or merge/split logic.
---

Never hardcode restaurant logic.

Everything must be configurable per restaurant.

Domain hierarchy:

```
Restaurant
  └─ Zones
       └─ Tables
            └─ Merged Tables
                 └─ Reservations
                      └─ Rules
```

Every restaurant defines its own:

- Zones (Inside, Outside, Smoking, VIP, Bar, …)
- Table types & capacities (solo vs connected capacity)
- Merge / split rules
- Table statuses (Available, Reserved, Occupied, Cleaning, Blocked)
- Seating rules

Never hardcode capacities — read them from configuration.
