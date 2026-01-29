1. Read the PRD and progress file.
2. Find the next incomplete highest-priority task and implement it.
3. Run pnpm format
4. Run pnpm lint:fix
5. Run pnpm check:types, fix errors
6. Run pnpm test, fix errors
7. Append progress to progress.txt
8. Update the docs if needed (e.g. README.md or relevant documentation in the `/docs` folder)
9. Update PRD with what was done (check off check boxes or add ✅ before the item that has been done if tasks are not formatted with checkboxes)
10. Commit changes

ONLY WORK ON A SINGLE TASK.

If all PRD tasks are complete, create a PR and output <promise>COMPLETE</promise>

## Rules

- Only work on a single task
- This is production code. Fight entropy. Leave the codebase better than you found it

## Prioritization of tasks

1. Architectural decisions and core abstractions
2. Integration points between modules
3. Unknown unknowns and spike work
4. Standard features and implementation
5. Polish, cleanup, and quick wins

## After completing each task, append to progress.txt

- Task completed and PRD item reference
- Key decisions made and reasoning
- Files changed
- Any blockers or notes for next iteration

Keep entries concise. Sacrifice grammar for the sake of concision. This file helps future iterations skip exploration.

## Status Reporting

Output status tags to report progress to the Ralph UI:

**Before each significant action**, output a status tag:

```
<status>Brief description of current action</status>
```

Examples:

- `<status>Reading PRD and progress files</status>`
- `<status>Implementing user authentication hook</status>`
- `<status>Running type checks</status>`
- `<status>Fixing lint errors in api/routes.ts</status>`
- `<status>Writing tests for validation logic</status>`
- `<status>Committing changes</status>`

## When done

**After completing all work**, output a usage tag with token counts:

```
<usage>INPUT_TOKENS input, OUTPUT_TOKENS output</usage>
```

Example:

- `<usage>15000 input, 8500 output</usage>`
