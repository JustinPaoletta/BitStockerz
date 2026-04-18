# Release Process

This repository uses a manual changelog + release branch workflow.

## Standards

- Use Semantic Versioning.
- Create Git tags as `vX.Y.Z`.
- Keep the root `package.json` and `CHANGELOG.md` aligned to the repo release version.
- Treat `CHANGELOG.md` as the source of truth for GitHub Release notes.
- Cut release branches as `release/vX.Y.Z` from `main`.

## Scope Rules

- The root `package.json` is the release anchor for the repository as a whole.
- `apps/api/package.json` can keep its own internal versioning unless you explicitly choose to synchronize it with repo releases later.
- If a release only affects one part of the monorepo, call that out clearly in the changelog section.

## Pre-Release Checks

For API-impacting releases, run:

```bash
npm --prefix apps/api run build
npm --prefix apps/api run lint
npm --prefix apps/api run test
npm --prefix apps/api run test:e2e
```

For docs-heavy releases, also verify the roadmap, MVP, API inventory, and schema docs stay consistent with the release notes.

## Release Checklist

1. Update your local copy of `main`.
2. Review `CHANGELOG.md` and confirm `## [Unreleased]` accurately describes the release scope.
3. Choose the next version using SemVer.
4. Create the release branch:

   ```bash
   git checkout main
   git pull --ff-only
   git checkout -b release/vX.Y.Z
   ```

5. Bump the root repository version without creating a tag yet:

   ```bash
   npm version --no-git-tag-version X.Y.Z
   ```

6. Move the release notes from `## [Unreleased]` into a dated section like `## [X.Y.Z] - YYYY-MM-DD`, then leave a fresh empty `Unreleased` section at the top.
7. Run the relevant pre-release checks for the scope of the release.
8. Commit the release branch changes:

   ```bash
   git add package.json package-lock.json CHANGELOG.md README.md RELEASE.md docs apps/api
   git commit -m "chore(release): prepare vX.Y.Z"
   ```

9. Open a pull request from `release/vX.Y.Z` into `main` and merge it after review.
10. Tag the merge commit and push the tag:

   ```bash
   git checkout main
   git pull --ff-only
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

11. Publish the GitHub Release from the matching changelog section.
12. Continue adding new work under `## [Unreleased]` for the next cycle.
