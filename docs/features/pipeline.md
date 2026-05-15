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

Review the generated comments one by one:

- **Keep** — mark a comment for posting as-is
- **Edit** — rewrite the comment text inline
- **Dismiss** — remove a comment you don't want to post

## POST — publish to the MR

Click **Post to MR**. Approved comments are submitted as inline review comments on the MR in GitLab or GitHub.
