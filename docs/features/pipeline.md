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

Before dispatching to the AI, tune the review brief:

- **Preset** — choose a review focus (e.g. security, performance, style)
- **Context toggles** — include or exclude diff sections, commit messages, PR description
- **Custom instructions** — free-text additions appended to the system prompt

## DISPATCH — run the review

Click **Run review**. The request streams back via SSE — each comment appears as soon as the AI
finishes writing it, while the rest of the answer is still arriving.

The AI produces structured comments, each anchored to a specific file and line. Models do not
always answer in exactly the requested format, so the answer is read leniently: reasoning
blocks are skipped, JSON is found inside markdown fences or prose, wrapper objects and one
comment per line are understood, common formatting slips are repaired, and alternative field
names and severity words are mapped. Comments split over several code blocks are merged,
and an example the model quotes in prose never outweighs its actual answer.

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
