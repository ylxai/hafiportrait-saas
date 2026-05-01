---
name: git-workflow
description: Git workflow - commits, branches, and pull requests
license: MIT
compatibility: opencode
---

# Git Workflow

## Branch Strategy
- main: Production code
- develop: Development code
- feature/*: New features
- bugfix/*: Bug fixes
- hotfix/*: Production fixes

## Creating a Feature
```bash
git checkout -b feature/my-feature
# Make changes
git add .
git commit -m "Add my feature"
git push -u origin feature/my-feature
```

## Commit Messages
- Use conventional commits:
  - feat: New feature
  - fix: Bug fix
  - docs: Documentation
  - refactor: Code refactor
  - test: Tests

## Before Commit
- Run `npm run lint && npm run build`
- Check for secrets
- Ensure no .env committed

## Merging
- Create PR on GitHub
- Wait for review
- Squash and merge