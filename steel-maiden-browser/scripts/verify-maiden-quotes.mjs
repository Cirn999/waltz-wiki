import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { isMaidenQuotes, quoteCategories } from "../app/maidenQuotes.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = async file => JSON.parse(await fs.readFile(path.join(root, "public/data", file), "utf8"));
const maidens = (await read("maidens.json")).rows;
const index = await read("maiden-quotes-index.json");
const storyCatalog = await read("story-catalog.json");
assert.deepEqual(index.cards, maidens.map(row => row.id).sort((a,b) => a-b));
const records = new Map();
const coverage = Object.fromEntries(quoteCategories.map(({id}) => [id,0]));
let storyCount = 0;
for (const maiden of maidens) {
  const record = await read("maiden-quotes/" + maiden.id + ".json");
  assert.ok(isMaidenQuotes(record, maiden.id), String(maiden.id));
  assert.equal(record.modelId, maiden.modelId);
  assert.ok(index.sources[record.modelId].path.endsWith(".zh.dc"));
  assert.ok(!JSON.stringify(record).includes("#VOICE#"));
  for (const {id} of quoteCategories) {
    coverage[id] += Number(record.groups[id].length > 0);
    for (const group of record.groups[id]) {
      assert.equal(new Set(group.lines.map(line => line.text)).size, group.lines.length);
      assert.equal(new Set(group.lines.map(line => line.id)).size, group.lines.length);
      assert.ok(group.lines.every(line => line.text.trim()));
    }
  }
  if (record.recruitmentStory) {
    storyCount++;
    assert.equal(record.recruitmentStory.scriptId, index.recruitmentStories[maiden.id]);
    assert.equal(new Set(record.recruitmentStory.lines.map(line=>line.id)).size, record.recruitmentStory.lines.length);
    const source = await read("stories/" + (-20000 - record.recruitmentStory.scriptId) + ".json");
    assert.equal(record.recruitmentStory.lines.length, source.frames.filter(frame=>frame.text.trim()).length);
    for (const line of record.recruitmentStory.lines) {
      const frame = source.frames.find(frame=>frame.id.endsWith(":" + line.id));
      assert.ok(frame, line.id);
      assert.equal(line.text, frame.text.trim());
      assert.equal(line.head, frame.head);
      assert.equal(line.side, frame.side);
      assert.equal(!!line.player, !!frame.player);
      assert.equal(line.kind, frame.kind);
      if (line.head !== null) {
        const character = record.recruitmentStory.characters[line.head];
        assert.deepEqual(character, storyCatalog.characters[line.head]);
        // Two scripts deliberately hide an unknown speaker's identity (native model 0).
        assert.ok(character.avatar || character.image || character.modelId === 0, "Known speaker has a native avatar");
        for (const asset of [character.avatar, character.image].filter(Boolean)) {
          await fs.access(path.join(root,"public",asset));
        }
      }
    }
  }
  records.set(maiden.id, record);
}
assert.deepEqual(coverage, index.coverage);
assert.equal(storyCount, 19);
for (const [id, scriptId, count, start, end] of [
  [9879, 20760, 45, "夏威夷", "放心交给我"],
  [9838, 20761, 45, "", "夏日休假"],
]) {
  const story = records.get(id).recruitmentStory;
  assert.equal(story.scriptId, scriptId);
  assert.equal(story.lines.length, count);
  assert.ok(story.lines[0].text.includes(start));
  assert.ok(story.lines.at(-1).text.includes(end));
  assert.ok(story.lines.some(line=>line.kind==="narration"));
  assert.ok(new Set(story.lines.map(line=>line.speaker)).size > 2);
}
const bison = records.get(6242);
assert.ok(bison.groups.recruit[0].lines[0].text.includes("野牛II"));
assert.equal(bison.groups.touch[0].lines.length, 7);
assert.ok(bison.groups.honor[0].lines[0].text.includes("天堂"));
assert.deepEqual(bison.groups.battle.map(group=>group.tag), [1011,1012,1016,1015,1018,1019,1020,1002]);
assert.equal(records.get(8001).groups.honor.length, 0);
assert.equal(records.get(9879).groups.touch.length, 0);
assert.ok(records.get(6278).groups.touch.some(group=>group.tag===1034));
assert.equal(isMaidenQuotes(null, 6242), false);
assert.equal(isMaidenQuotes(bison, 9879), false);
assert.equal(isMaidenQuotes({...bison, groups:{}},6242), false);
console.log(JSON.stringify({ok:true,cards:maidens.length,coverage,storyCount}));
