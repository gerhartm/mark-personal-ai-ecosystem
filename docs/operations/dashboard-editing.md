# Dashboard edits and restore

[Documentation](../README.md) / [Operations](README.md) / Dashboard editing

## Ask for one specific change

> Use the dashboard editor to improve the help text on Sources and imports. Preserve all accepted formats, limits and import behaviour. Publish after checks pass and give me the deployed commit link.

Satoshi delegates the task to a native Hermes worker fixed to **GPT-6 Astra with High reasoning**. There is no fallback model. The worker uses terminal and file tools, skips automatic memory and context files, and has a 100-iteration / 30-minute budget.

A `queued`, `editing` or `checked` result does not confirm a live release. Wait for `deployed`, refresh the site and inspect the requested behaviour. A check-only run can be recorded on a draft Git branch without deployment.

## Publication path

1. Prepare a separate working copy from the current published source.
2. Run the dedicated editor and verify its model requests.
3. Run host-side checks with test-container networking disabled and build the production image.
4. Back up the current database, Compose file and image reference.
5. Commit, push and verify the remote commit before replacing only the dashboard service.
6. Verify health and record the release receipt.

The working copy is not an OS sandbox. Scope instructions prohibit changes outside dashboard work, but terminal and file tools retain the Hermes runtime permissions. The host publication command is restricted and Hermes receives no Docker socket. Do not expand these permissions to bypass a failed check.

## Restore a published version

> Use the dashboard editor to undo the last published dashboard change. Preserve research and saved work. Confirm when the restore is deployed and give me the new commit link.

A restore creates a forward commit using a previously published code version. It does not delete history or restore an old database. Schema compatibility and failures can require operator intervention. Preserve the run ID and failed check instead of repeatedly trying unrelated restores.

## Branch consistency matters

The helper expects the Git branch, remote and release ledger to agree. Do not merge unrelated work directly into `satoshi-dashboard` and assume the next agent edit will work. Coordinate documentation/code integration with the operator and reconcile the accepted release state through the established process.

Implementation: [`dashboard-edit.py`](../../deploy/dashboard-editor/dashboard-edit.py), [`EDITOR.md`](../../deploy/dashboard-editor/EDITOR.md) and [`mark-dashboard-release.py`](../../deploy/dashboard-editor/mark-dashboard-release.py).
