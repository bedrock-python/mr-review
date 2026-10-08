# Review pipeline

The review pipeline is a five-stage flow that takes you from raw diff to posted comments.

```
PICK → BRIEF → DISPATCH → POLISH → POST
```

## PICK — select what to review

Open an MR from the host browser. The diff viewer shows all changed files.

- Click any file to expand it
- Pin specific lines to draw the AI's attention to them
- Deselect files you don't want included in the review

## BRIEF — configure the prompt

Before dispatching to the AI, tune the review brief. Everything is saved as you type.

- **Review intent** — one of the four built-in presets (thorough, security, style,
  performance) or a preset you saved. **View instructions** shows the text the preset puts at
  the top of the prompt. **Save as preset…** stores the current intent under a name — with
  its instructions, which you can rewrite, and optionally this brief's settings (focus areas,
  output, context toggles, exclude patterns, the advanced options), applied whenever the
  preset is picked. Saved presets can be edited or deleted here and under **Settings →
  Review presets**; a brief whose preset was deleted falls back to its built-in one and says
  so.
- **Focus areas** — a checklist the model must go through explicitly: pick common ones
  (error handling, concurrency, test coverage…) or add your own.
- **Output** — the language for comment bodies (empty: the language of the code and the MR),
  a minimum severity, and a maximum number of comments. The model is asked to respect both
  limits, and they are enforced again when its answer is stored: lower-severity comments are
  dropped and, past the cap, only the most severe are kept. The dispatch and import results
  say how many were filtered out.
- **Context** — the diff, the MR description, full file contents, tests next to the changed
  files, code the changed files import, commit history, and project context files (one path
  per line; empty auto-detects `CLAUDE.md`, `CONTRIBUTING.md`, `README.md` and the like).
- **Custom instructions** — free text appended to the instructions.
- **Advanced** — shows how many changed files are excluded even while collapsed:
  - *Path filters* — include and exclude glob patterns over changed-file paths, as in
    `.gitignore`: `*.snap` or `docs` match at any depth, a directory pattern covers
    everything in it, `src/generated` or `src/**/*.py` are paths from the repository root,
    and `\` escapes a glob character. Your patterns are case-sensitive; the default excludes
    — lockfiles, minified bundles, source maps, generated and vendored code, binary assets —
    are not. Each excluded file is listed with the pattern that excluded it, and **Review
    anyway** takes one back in (it adds `!/path`, escaped, to the exclude patterns), even
    from an excluded directory. Excluded files are left out of the diff and of every context
    lookup. If the patterns leave none of the changed files, the Brief says so and Dispatch
    stays disabled.
  - *Number diff lines* (on by default) — each diff line carries its line number in the new
    file and the model is told to anchor comments to those numbers, so far fewer comments
    land on the wrong line.
  - *Show the previous iteration's comments* (on by default) — from the second iteration on,
    the comments kept last time are listed as already reported, so the model does not
    repeat them unless they are still unresolved.
  - *Prompt budget* — the prompt's size cap in characters (600 000 by default, sized for a
    ~200k-token model). The instructions take at most a quarter of it, so the diff always
    keeps most of the room; after the diff come the MR description, previous comments,
    project context, full files, tests, related code and commit history. What does not fit
    is cut, with a marker in the prompt saying so.

**Preview prompt** builds the exact prompt the model would get and breaks it down: the
characters each part takes, roughly how many tokens (characters ÷ 4 — an estimate, not a
tokenizer count), which files were cut short, left out for the budget or skipped as binary,
and how many changed files the path filters excluded. The preview is plain text. Editing the
brief afterwards marks it **Out of date** rather than rebuilding it on every keystroke —
**Refresh** builds it again. **Copy** puts it on the clipboard, also on a plain-http address
where the browser's clipboard API is unavailable.

**Dispatch** saves the brief first and moves on only once it is saved; if saving fails, you
stay on the Brief and the error says why.

## DISPATCH — run the review

Pick a provider and a model — one from the provider's list, or any model id typed into the
model field (Enter takes it). The generation settings below show only what that model
accepts:

- **Reasoning** — an effort level (`low` … `max`) on models that reason by effort, with
  **Default** keeping the model's own; a thinking budget on older Claude models; an On/Off
  switch where reasoning is optional; nothing on models that do not reason.
- **Temperature** — unset means the model's default. It is hidden for models that reject it
  and greyed out while reasoning is on, because thinking models do not take one.
- **Advanced** — the output limit (empty uses a default sized for the model and the reasoning
  depth), **Structured output**, and a system prompt that replaces the built-in one.

The model and settings are remembered per provider, so switching providers brings back what
you last used with each. See [AI providers](ai-providers.md#dispatch-settings) for what each
model accepts and how the settings are fitted to it.

Click **Generate**. The request streams back via SSE — each comment appears as soon as the AI
finishes writing it, while the rest of the answer is still arriving.

The AI produces structured comments, each anchored to a specific file and line. With
structured output on, the model can only answer in the review's JSON shape. Without it, models
do not always answer in exactly the requested format, so the answer is read leniently:
reasoning blocks are skipped, JSON is found inside markdown fences or prose, wrapper objects
and one comment per line are understood, common formatting slips are repaired, and alternative
field names and severity words are mapped. Comments split over several code blocks are merged,
and an example the model quotes in prose never outweighs its actual answer. An answer counts as
cut off when the provider reports it stopped at its output limit, as well as when it stops
mid-JSON.

Running a review again replaces the iteration's comments only with a complete, readable
answer. If the new answer can't be read, is empty, or was cut off at the model's output
limit — or the run fails, is stopped, or you close the page — your existing comments stay
exactly as they were, and the screen says that nothing from the run was saved; its output is
still there to view or fix in **Copy & paste** mode. On an iteration without comments, the
comments the model completed are saved instead (marked as truncated when it ran out of
tokens), and an answer that can't be read at all is kept as a single general comment.

The raw answer the comments came from is stored with the iteration, so you can always look at
exactly what the model said and have it parsed again. While a run is streaming, the
Copy & paste / Run in app switch is locked so that it can't cut the run short.

## POLISH — edit comments

Decide what gets posted. Every comment is either **kept** (it will be posted) or
**dismissed** (it stays in the review but is not posted). Three views show the same
comments:

- **List** (default) — a triage list built for the keyboard
- **Diff + pins** — the full diff with a marker on every commented line and an editor beside it
- **Thread** — the comments as a conversation, grouped by file

The toolbar sums up what will be posted: kept comments per severity, then how many are kept
and how many dismissed.

### Triage from the keyboard

In the List view one comment is focused at a time — it is outlined and scrolled into view.
The keys do nothing while you type in a text field.

| Key | Action |
|---|---|
| `j` / `↓` | Next comment |
| `k` / `↑` | Previous comment |
| `a` | Keep and move to the next comment |
| `d` | Dismiss and move to the next comment |
| `e` | Edit |
| `1` `2` `3` `4` | Severity: critical, major, minor, suggestion |
| `c` | Show or hide the code around the comment |
| `n` | New comment |
| `/` | Search |
| `u` | Undo the last change |
| `⌘/Ctrl` + `↵` | Save the edit |
| `Esc` | Cancel the edit |
| `?` | Show this list |

### Filter, group, act in bulk

- **Filter** by severity, by status (all, kept, dismissed), by file, and by text in the body
  or the file path. Each severity chip counts the comments that match the other filters.
- **Group by file** collapses the list into one section per file (general notes first),
  each with its comment count. Without grouping the list is ordered by severity, then file
  and line.
- **Keep**, **Dismiss** and **Set severity** act on the comments on screen — those the
  filters let through, minus any in collapsed groups — in a single request.

Every change shows a toast with **Undo**, which puts the previous values back; `u` does the
same for the last change.

### Edit, re-anchor, add, delete

- **Edit** opens an editor in the card with **Write** and **Preview** tabs (Markdown).
  Saving sends only the fields you changed, so a bulk action taken while the editor was
  open is not undone by the save. Moving to another card, pressing `Esc`, switching view or
  continuing to Post with unsaved changes asks whether to save, discard or keep editing;
  the **Cancel** button discards without asking.
- **Anchor** — pick another file from the diff and a line, or make it a general comment.
  Leave the line empty to comment on the file as a whole. A comment without a line, or on
  a line that is not part of the diff, cannot be placed inline by the host and is posted as
  a general note; the card says so.
- **Code context** — an anchored comment can show the diff three lines either side of its
  line.
- **New comment** adds one by hand, general or anchored; **Delete** removes a comment for
  good (Undo restores it). Once an iteration has been posted it can no longer gain or lose
  comments, though they can still be edited.

### Saving

Changes appear at once and are saved in the background. Changes made within a quarter of
a second of each other — a bulk action, a burst of keystrokes — go to the server as one
request, and requests for a review are sent one at a time. If the server refuses a change,
only that change is rolled back and an error is shown. **Continue to post** waits for
pending changes to be saved first.

Leaving Polish another way — the stage bar, another iteration or another review — saves
an open draft that has valid changes rather than dropping it; the usual **Undo** toast
follows. Closing or reloading the tab while a draft has changes or saves are still pending
asks the browser to confirm.

## POST — publish to the MR

Click **Post to MR**. Approved comments are submitted as inline review comments on the merge request, on whichever host it came from.
