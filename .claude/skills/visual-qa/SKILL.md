---
name: visual-qa
description: Review implemented interfaces visually and systematically for layout problems, spacing inconsistencies, typography issues, responsiveness, interaction states, and design-system violations.
---

# Visual QA

## Goal

Never consider a UI implementation finished immediately after writing the code.

Inspect the actual rendered result.

## Review

Check:

### Layout
- Alignment
- Spacing
- Widths
- Heights
- Visual balance
- Responsive behavior

### Typography
- Font sizes
- Weight
- Line height
- Hierarchy
- Overflow

### Components
- Buttons
- Inputs
- Labels
- Icons
- Cards

### States
- Default
- Hover
- Focus
- Disabled
- Loading
- Error
- Success

### Responsive
Check mobile, tablet/iPad and desktop.

## Process

After implementation:

1. Run the application.
2. Inspect the rendered UI.
3. Identify visual problems.
4. Fix them.
5. Inspect again.
6. Repeat until the UI meets the quality bar.

Do not rely only on source code inspection.

## Quality bar

Ask:

"Would this look acceptable in a polished commercial SaaS product?"

If not, improve it.