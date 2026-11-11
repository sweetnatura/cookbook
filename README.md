# The Sweet Natura Cookbook

Public recipe collection for the Instagram CTA "Comment COOKBOOK".

- **Source of truth:** Notion database "Sweet Natura | Recipe Library". Nobody edits this repo to add recipes.
- **What gets published:** rows with Status `Aprobada` or `Publicada`. After a successful deploy, `Aprobada` becomes `Publicada`.
- **When:** every hour (GitHub Actions), on every push, or right away with Actions → "Build and publish cookbook" → Run workflow.
- **If a build fails:** the previous version stays online and GitHub emails the repo owner.

## Ingredients and steps format (Notion)

Ingredients, one per line: `quantity | ingredient`. A line starting with `## ` starts a group (e.g. `## Base`). Lines without `|` have no quantity (e.g. `Sweetener, to taste`).

Steps, one per line, in order.

Optional facts appear only when filled: Servings, Prep time, Cook or chill time, Extra facts (`Label | value` per line).

## Setup (once)

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Secrets: `NOTION_TOKEN` (internal integration shared only with the Recipe Library) and `NOTION_DATABASE_ID`.
3. Variables: `COOKBOOK_PREVIEW` = `true` until launch is approved, then `false`.
