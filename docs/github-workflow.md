# GitHub Workflow

How we use Git and GitHub on this project. If you're new to Git, read this once all the way through, then keep it open as a reference.

---

## The golden rules

1. **Never commit on `main`.** Always create a branch first.
2. **Every change goes through a pull request (PR).** `main` is protected, so direct pushes are rejected anyway.
3. **Start every branch from an up-to-date `main`.** Run `git checkout main && git pull` first.
4. **Keep PRs small.** One issue, one branch, one PR. Small PRs get reviewed faster and rarely conflict.
5. **Never commit `.env`** or any token, password or connection string.
6. **Never force push** (`git push --force`). If Git says no, ask for help instead.

---

## Key ideas

- **`main`** is the real, live code. Production is deployed from it.
- A **branch** is your own copy where you can work without affecting anyone else.
- A **commit** is a saved snapshot of your changes, with a message describing them.
- A **pull request (PR)** asks to merge your branch into `main`. Someone reviews it before it goes in.

---

## The everyday loop

### 1. Pick an issue

Find an issue on GitHub assigned to you, or ask for one. Issues labelled `good first issue` are a good place to start.

### 2. Start from the latest `main`

```bash
git checkout main
git pull
```

### 3. Create your branch

```bash
git checkout -b fix/announce-emoji
```

Branch names use a prefix plus a short description:

| Prefix | Use for |
|--------|---------|
| `feature/` | New functionality, e.g. `feature/todo-command` |
| `fix/` | Bug fixes, e.g. `fix/lock-status` |
| `docs/` | Documentation only, e.g. `docs/setup-typos` |

### 4. Make your changes and commit

```bash
git status                     # see what changed
git diff                       # see exactly what changed
git add path/to/file.js        # stage the files you want to commit
git commit -m "fix: remove emoji from /announce"
```

Commit messages start with a prefix:

- `feat:` for a new feature
- `fix:` for a bug fix
- `refactor:` for a code change that doesn't change behaviour
- `docs:` for documentation

Write what the commit does, not "fix stuff" or "changes". You can make as many commits as you like on your branch.

> Prefer `git add <file>` over `git add .`, so you don't commit files by accident.

### 5. Push your branch

The first time:

```bash
git push -u origin fix/announce-emoji
```

After that, just `git push`.

### 6. Open a pull request

1. Go to the repository on GitHub.
2. Click **Compare & pull request** on the yellow banner. If there's no banner, go to **Pull requests → New pull request** and pick your branch.
3. Fill it in:
   - **Title:** what the PR does, e.g. *Remove emoji from /announce*
   - **Description:** what you changed, why, and how you tested it. Add `Closes #12` (using the issue number) so the issue closes automatically when the PR merges.
4. Click **Create pull request**.

### 7. Review

Someone will review your PR and may leave comments.

- **To make changes:** edit the files on the same branch, commit and `git push` again. The PR updates automatically, so don't open a new one.
- **To reply to a comment:** reply on GitHub. Asking "why?" is fine.

Once approved, the PR is **squash merged**: all your commits become one commit on `main`. The branch on GitHub is deleted automatically.

### 8. Clean up and start again

```bash
git checkout main
git pull
git branch -d fix/announce-emoji
```

Then go back to step 1.

---

## Keeping your branch up to date

If `main` changes while you're working (someone else's PR got merged), bring those changes into your branch:

```bash
git checkout main
git pull
git checkout fix/announce-emoji
git merge main
```

If Git reports a **merge conflict**, it means you and someone else changed the same lines:

1. Open the conflicted files in VS Code. Conflicts are highlighted with **Accept Current / Accept Incoming / Accept Both** buttons.
2. Choose the right version, or combine them by hand, and remove the conflict markers.
3. Then:

   ```bash
   git add path/to/conflicted-file.js
   git commit
   git push
   ```

If you're not sure which version is right, stop and ask. A wrong conflict fix can quietly delete someone's work.

---

## Oops: common mistakes and fixes

### "I made changes on `main` but haven't committed yet"

No problem. Uncommitted changes move with you when you switch branches:

```bash
git checkout -b fix/my-change
```

Then commit as normal.

### "I committed on `main` by mistake (not pushed)"

Move the commit onto a new branch, then reset `main`:

```bash
git branch fix/my-change          # new branch that keeps your commit
git reset --hard origin/main      # put main back to match GitHub
git checkout fix/my-change        # carry on working here
```

### "`git push` was rejected"

- If it mentions **`GH013` / repository rule violations**, you tried to push to `main`. Create a branch and push that instead (see above).
- If it says **"fetch first"** or **"non-fast-forward"**, run `git pull`, then push again.
- If you see **"divergent branches"**, stop and ask for help. Don't try random commands.

### "I want to undo my last commit (not pushed)"

```bash
git reset --soft HEAD~1
```

The commit is removed, but your changes stay in your files.

### "I accidentally committed a secret"

Tell a maintainer **immediately**, even if you've already removed it. Once a secret has been pushed, it must be treated as leaked and replaced, because this repository is public.

---

## Project-specific notes

- **Generated files:** `packages/shared/src/generated/*.json` is regenerated automatically when the bot starts. If you add or change a slash command, these files will change too. Commit them along with your command.
- **Deploying slash commands:** use your own test bot and test server, never the production bot. See [Adding Commands](adding-commands.md).

---

## Cheat sheet

```bash
git checkout main && git pull           # start fresh
git checkout -b feature/thing           # new branch
git status                              # what changed?
git add <file>                          # stage
git commit -m "feat: do the thing"      # commit
git push -u origin feature/thing        # push (first time)
git push                                # push (after that)
# → open a PR on GitHub, address review, it gets merged
git checkout main && git pull           # back to the start
git branch -d feature/thing             # delete the old branch
```

Stuck? Ask in the dev channel on Discord. Paste the exact command you ran and the full error message.
