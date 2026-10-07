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

Click **Run review**. The request streams back via SSE — comments appear as the AI generates them.

The AI produces structured comments, each anchored to a specific file and line range.

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
- **Keep**, **Dismiss** and **Set severity** act on every comment the filters let through —
  including those in collapsed groups — in a single request.

Every change shows a toast with **Undo**, which puts the previous values back; `u` does the
same for the last change.

### Edit, re-anchor, add, delete

- **Edit** opens an editor in the card with **Write** and **Preview** tabs (Markdown).
  Moving to another card, switching view or continuing to Post with unsaved changes asks
  whether to save, discard or keep editing.
- **Anchor** — pick another file from the diff and a line, or make it a general comment.
  If the line is not part of the diff, the card says so: the host cannot place it inline,
  so it is posted as a general note.
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

## POST — publish to the MR

Click **Post to MR**. Approved comments are submitted as inline review comments on the merge request, on whichever host it came from.
