import assert from "node:assert/strict";

// The labels stay stable; membership must come from the decoded client tags.
const definitions = [
  ["P-30", "兽耳", 861],
  ["P-31", "黑色头发", 862],
  ["P-32", "戴眼镜", 863],
];

export function createHuntTraitsIndex(report) {
  assert.equal(report.tasks?.length, definitions.length, "expected all three hunting tasks");
  const index = new Map();
  for (const [taskName, label, tag] of definitions) {
    const tasks = report.tasks.filter((task) => task.task === taskName);
    assert.equal(tasks.length, 1, `missing/duplicate hunting task ${taskName}`);
    const task = tasks[0];
    assert.equal(task.label, label);
    assert.equal(task.capsule_tag_id, tag, `${taskName}: wrong client capsule tag; regenerate hunting rosters`);
    assert.equal(task.minimum, 6, `${taskName}: expected at least six qualifying maidens`);
    assert.ok(task.description?.includes(label) && task.task_description?.endsWith(task.description), `${taskName}: mismatched achievement/formation description`);
    assert.equal(task.roster.length, task.qualifying_count);
    assert.ok(task.roster.length >= task.minimum);
    const seen = new Set();
    for (const card of task.roster) {
      const id = Number(card.card_id);
      assert.ok(Number.isSafeInteger(id) && id > 0 && !seen.has(id), `${taskName}: invalid/duplicate maiden ${id}`);
      seen.add(id);
      if (!index.has(id)) index.set(id, []);
      index.get(id).push({ task: taskName, name: label, tagId: tag });
    }
  }
  return index;
}

export function applyHuntTraits(data, report) {
  const index = createHuntTraitsIndex(report);
  const knownIds = new Set(data.rows.map((row) => row.id));
  for (const id of index.keys()) assert.ok(knownIds.has(id), `unknown hunting maiden ${id}`);
  for (const row of data.rows) row.huntTraits = index.get(row.id) ?? [];
  data.facets.huntTraits = definitions.map(([task, name]) => `${task} ${name}`);
}
