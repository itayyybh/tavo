---
name: accessibility
description: Improve web accessibility using semantic HTML, keyboard navigation, focus management, labels, contrast, and accessible interaction patterns.
---

# Accessibility

## Goal

Make the interface usable by people with different abilities and input methods.

## Requirements

Use:

- Semantic HTML
- Proper form labels
- Accessible buttons
- Keyboard navigation
- Visible focus states
- Appropriate ARIA only when necessary
- Sufficient color contrast
- Clear error messages
- Logical tab order

## Forms

Every input should have:

- A clear label
- Appropriate input type
- Useful autocomplete attributes where applicable
- Clear validation feedback

Do not rely on placeholder text as the only label.

## Keyboard

Users must be able to:

- Navigate inputs with Tab
- Submit forms with Enter
- Navigate interactive controls logically
- See where focus is

## Errors

Errors should:

- Be understandable
- Be associated with the relevant field
- Not rely only on color

## Important

Accessibility improvements must not make the interface visually cluttered.