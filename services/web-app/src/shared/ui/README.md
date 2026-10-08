# shared/ui — tokens, primitives, and how to migrate a screen

The design system has two parts:

- **Tokens** live in `src/app/styles/index.css`. `:root` is the ink theme; `[data-theme="paper"]`
  and `[data-theme="phosphor"]` override it on `<html>`. Derived tokens (the `-fg` variants, role
  aliases, tints, focus ring) are computed per theme.
- **Primitives** are React components in `src/shared/ui/<name>/`, styled by `ui-*` classes in
  `src/shared/ui/styles/*.css` (imported once through `primitives.css`). They sit in the
  `components` cascade layer, so a Tailwind utility or an inline `style` on the same element still
  wins. Import everything from `@shared/ui`.

Severity-specific pieces are domain UI and live with the review entity: `SeverityBadge`,
`SeverityCounts`, `SEVERITY_ORDER`, `SEV_COLOR` (dots, fills), `SEV_TEXT_COLOR` (text) and
`countSeverities` come from `@entities/review`. `features/polish/lib` re-exports the map for old
imports.

Stories for every primitive are in Storybook (`pnpm storybook`), with a theme switcher in the
toolbar.

## Tokens

| Group | Tokens | Rule |
|---|---|---|
| Surfaces | `--bg-0` page · `--bg-1` panels · `--bg-2` controls, raised · `--bg-3` hover fill · `--bg-hover` | |
| Lines | `--border`, `--border-strong` | dividers, cards, panels — subtle on purpose |
| Control outline | `--border-control`, `--border-control-hover` | the edge of a form control (Input, Textarea, Select, Checkbox, Radio, Switch track, SegmentedControl): ≥ 3:1 on bg-0…bg-2 |
| Text | `--fg-0` primary · `--fg-1` body · `--fg-2` secondary/meta, placeholders | all ≥ 4.5:1 on bg-0…bg-3 in every theme |
| Non-text | `--fg-3` | icons, dividers, disabled — **never text** |
| Hues | `--accent`, `--c-critical/major/minor/suggest`, `--c-add/del` | dots, fills, tints only |
| Hue as text | `--accent-fg`, `--c-*-fg` (`--c-critical-fg` …) | any hue used as text or a thin border |
| Roles | `--c-danger`, `--c-warn`, `--c-success`, `--c-info` (+ `-fg`) | aliases of critical, major, add, suggest |
| Tints | `--accent-tint/-line`, `--c-*-tint/-line` | 12% fill, 40% border |
| Focus | `--focus-ring`, `--focus-ring-soft` | the global rule uses them; don't restyle focus |
| Elevation | `--shadow-pop` (menus, tooltips, toasts), `--shadow-dialog`, `--shadow-drawer`, `--overlay` | one scrim for every modal |
| Spacing | `--space-1/2/3/4/5/6/8` = 4/8/12/16/20/24/32 px | |
| Radius | `--radius-1` 3 (badges, kbd) · `--radius-2` 6 (controls) · `--radius-3` 10 (cards, dialogs, popovers) · `--radius-pill`; roles `--radius-badge/-control/-card` | |
| Type | `--fs-eyebrow` 10 · `--fs-meta` 11 · `--fs-control` 12 · `--fs-body` 13 · `--fs-title` 15 · `--fs-page` 20; `--fw-regular/medium/semibold` (400/500/600) | no other sizes or weights |
| Controls | `--control-sm` 24 · `--control-md` 30 · `--control-lg` 36 | |
| Icons | `ICON_SIZE.inline` 14 · `ICON_SIZE.button` 16 | lucide-react only, `aria-hidden="true"` |
| Motion | `--dur-fast` 0.08s · `--dur-base` 0.15s · `--ease-out` | reduced motion is handled globally |

Known exception: on paper the `--accent` fill is 2.35:1 against white. It is accepted where a label sits on it (a primary button, the active stage node): the label is `--accent-ink` at 8.3:1 and carries the control; focus uses `--focus-ring` (5.7:1). Don't use the bare accent fill as the only sign of anything.

Placeholders are fg-2 so they are readable; typed text is fg-0, so the two stay apart. A placeholder that could pass for a value starts with "e.g.".

The one eyebrow (section titles, field labels): mono 10/500, 0.08em, uppercase, `--fg-2` — the
`Eyebrow` component or the `ui-eyebrow` class. Write the text in sentence case; CSS uppercases it.

## Primitives

| Component | Props (besides the native element's) | Notes |
|---|---|---|
| `Button` | `variant` primary·secondary·ghost·danger, `size` sm·md·lg, `icon`, `iconRight`, `isLoading`, `isFullWidth`, `type` (default "button") | loading keeps focus, sets `aria-busy`, ignores clicks. `buttonClassName()` styles a link as a button |
| `IconButton` | `label` (required: name + tooltip), `icon`, `size` sm·md, `variant` ghost·secondary·danger, `isPressed`, `shortcut`, `tooltip` (text or `false`), `tooltipSide` | square, 24/30 px |
| `Tooltip` | `content`, `shortcut`, `side`, `align`, `isDisabled`, one focusable child | Radix; opens on hover and focus; brings its own provider |
| `Kbd` | children | key cap |
| `Field` | `label`, `hint`, `error`, `isRequired`, `id`, `labelAside`, `isLabelHidden` | gives the control inside its id, `aria-describedby`, `aria-invalid`, `required` |
| `Input` | `size` sm·md, `isMono`, `isInvalid`, `leadingIcon`, `trailing` | with an icon/trailing slot the box draws border and focus |
| `Textarea` | `isMono`, `isInvalid` | |
| `Select` | `size`, `isInvalid`, `<option>` children | native select + chevron |
| `Checkbox` / `Switch` | `label`, `description`, `isLabelHidden`, `onCheckedChange`; Checkbox: `isIndeterminate`, `isInvalid` | native input; Switch is `role="switch"` |
| `RadioGroup` + `Radio` | group: `legend`, `value`, `onValueChange`, `name`, `orientation`, `isDisabled`; radio: `value`, `label`, `description` | fieldset + native radios (browser arrow keys) |
| `Badge` | `tone`, `variant` soft·outline, `hasDot`, `isDotPulsing`, `icon` | mono small caps; not interactive |
| `StatusBadge` | `status` neutral·active·success·warning·danger·info, `label`, `isLive` | DRAFT / OPENED are neutral |
| `CountBadge` | `count`, `max` (99), `tone`, `label` (read instead of the number) | |
| `Chip` | `isSelected` + `onSelectedChange` (toggle, `aria-pressed`), `tone`, `hasDot`, `count`, `icon` | filters |
| `Card` | `as`, `padding` none·sm·md·lg, `surface` default·sunken·raised, `isInteractive` | |
| `SelectCardGroup` | `options` [{value, title, description, icon, aside, preview, isDisabled}], `value`, `onValueChange`, `aria-label`/`aria-labelledby`, `minCardWidth` | radio group, one tab stop, arrows move and select |
| `SectionHeader` | `title`, `as` h2·h3·h4·div, `id`, `count`, `countLabel`, `description`, `actions` | eyebrow title |
| `Eyebrow` | `as`, `id` | |
| `Callout` | `tone` neutral·info·warn·danger·success, `title`, children, `actions`, `icon` (`null` = none), `size`, `role` | default role: danger → alert, success → status, others → note |
| `EmptyState` | `title`, `description`, `actions`, `icon`, `size` sm·md, `isFill`, `role` | a status by default |
| `ErrorState` | `title`, `message`, `onRetry`, `retryLabel`, `actions`, `size`, `isFill` | an alert |
| `Skeleton` | `width`, `height`, `radius` badge·control·card·pill·circle, `style` | |
| `Spinner` | `size` sm·md·lg, `tone` accent·muted·current, `label`, `isDecorative` | |
| `StageLoading` | `label` | a stage's whole area while it loads |
| `Toolbar` (+ `ToolbarSpacer`, `ToolbarDivider`) | `size` md (44) · sm (40), `hasBorder` | layout only; with `aria-label` a named group |
| `SegmentedControl` | `options` [{value, label, icon, count, isDisabled, title}], `value`, `onValueChange`, `aria-label`, `size` | radio group with arrow keys |
| `StageFooter` | `summary`, `secondaryActions`, `primaryAction`, `aria-label` | sticky; the next step is never below the fold |
| `Dialog` | `isOpen`, `onClose`, `title`, `description`, `size` sm·md·lg / `width`, `footer`, `hasCloseButton`, `shouldRestoreFocus`, `initialFocusRef` | Radix; focuses the body's first control |
| `Drawer` | `isOpen`, `onClose`, `title`, `headerExtra`, `width` (360), `side`, `initialFocusRef`, `footer` | Radix; content exists only while open |
| `Toaster` | `position` | rendered once in app providers; call `toast()` from sonner as before |

Kept from before: `DiffViewer`/`DiffTable`, `Markdown` (lazy, memoised), `SearchField` (now an
`Input`), `ListMessage`/`ListStatusBar`/`LoadMoreRow`, `InfiniteVirtualList`, `ErrorBoundary`.

## Rules

1. **Text is fg-0, fg-1 or fg-2.** fg-3 only for non-text. A coloured word uses the `-fg`
   variant (`var(--c-major-fg)`, `text-accent-fg`); the base hue is for the dot next to it.
2. **Never remove the focus outline.** No `outline: none` / `outline-none`. A bare input inside a
   bordered box: put `ui-focus-within` on the box (or use `Input` with `leadingIcon`).
3. **Radii, spacing, type and shadows come from tokens.** No new numbers; `borderRadius` takes
   `var(--radius-*)`.
4. **One way to do a thing.** A button is `Button`/`IconButton`; a segmented switch is
   `SegmentedControl`; a modal is `Dialog`; a side panel is `Drawer`; empty/error states are
   `EmptyState`/`ErrorState`; a coloured message box is `Callout`.
5. **Provider colour is identity only** — a dot or an icon tint, never a CTA background or a
   selection ring (selection is `--accent-fg`).
6. **Icons:** lucide-react, 14 inline / 16 in icon buttons, `aria-hidden="true"`; the control
   carries the name. No unicode glyphs or emoji as icons.
7. **Motion:** keep 0.08s hover transitions; anything that loops (pulse, spin) is stopped by the
   global `prefers-reduced-motion` rule — don't fight it with `!important`.

## Migrating a screen (D2)

Legacy → primitive:

| Legacy | Replace with |
|---|---|
| `className="btn"`, `"btn primary"`, `"btn ghost"`, inline-styled `<button>` | `Button` |
| `className="icon-btn"`, `×`/`✕` buttons | `IconButton` |
| `className="field"` + `field-label`, Settings `Field`/`inputCss` | `Field` + `Input`/`Textarea`/`Select` |
| `.chip` used as a toggle | `Chip`; as a label → `Badge` |
| `.sev` + `.dot` | `SeverityBadge` (entities/review) |
| local severity colour maps | `SEV_COLOR` / `SEV_TEXT_COLOR` / `SeverityCounts` |
| `.card`, bordered `div`s | `Card` |
| uppercase mono labels | `SectionHeader` / `Eyebrow` |
| warning/error/info boxes | `Callout` |
| centred "Nothing here" / "Failed to load" | `EmptyState` / `ErrorState` |
| hand-made spinners and skeletons | `Spinner` / `Skeleton` / `StageLoading` |
| button groups acting as tabs or filters | `SegmentedControl` |
| hand-made modals, `PolishDialog` | `Dialog` |
| `SideSheet` | `Drawer` (default width 360) |

Checklist for each screen:

- Keep every test hook: roles and accessible names the tests query, the test ids
  `temperature-value` and `selected-model`, the classes `row-btn active` and `diff-pin-active`,
  `.mono` in "Configured models", `article[aria-current=true]`, `data-virtual-scroll`. If one must
  change, change its test in the same commit and say so.
- Keep the layout widths (rail 56, repos pane 268, MR list 360, nav 628, `REPO_ROW_HEIGHT`) and
  the measured row estimates in step with any row height you change.
- Keep the keyboard: triage keys, Esc/⌘↵ in editors, arrow navigation over `data-row-focus`.
- Copy changes need their test updated.
- Take after-shots in ink, paper and phosphor at 1440 and 1024 and look at them.
- When the last use of a legacy class (`.btn`, `.icon-btn`, `.chip`, `.sev`, `.card`, `.kbd`)
  is gone, delete its rules from `index.css`.
- `features/export-import/**` is being reworked on its own branch: leave it alone.
