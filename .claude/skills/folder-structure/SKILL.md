---
name: folder-structure
description: How to organize files in this project under /src (components, features, hooks, pages, stores, services, types, utils, assets), with no large files. Use when creating new files or deciding where code belongs.
---

Always organize code under `/src`:

```
/src
  /components   reusable UI building blocks
  /features     feature-based modules
  /hooks        shared hooks
  /pages        routed pages
  /stores       Zustand stores
  /services     data / API / engine logic
  /types        shared TypeScript types
  /utils        pure utilities
  /assets       static assets
```

Feature-based architecture. No large files.
