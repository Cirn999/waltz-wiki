import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { clampStoryIndex } from '../app/storyTypes.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = async file => JSON.parse(await fs.readFile(path.join(root, 'public', file), 'utf8'));
const catalog = await read('data/story-catalog.json');
// The native script selects the yellow (before Deadwater) or red commander per line.
assert.equal(catalog.characters[3].modelId, 11301);
assert.equal(catalog.characters[3].avatar, catalog.characters[3].image);
assert.deepEqual(catalog.characters[3].avatarCrop, {x:50,y:0,size:250,sourceWidth:320});
assert.equal(catalog.characters[4].modelId, 11304);
assert.equal(catalog.characters[4].image, '/art/stories/11304.webp');
assert.equal(catalog.characters[4].avatar, '/art/stories/ctx-163.webp');
assert.notEqual(catalog.characters[3].avatar, catalog.characters[4].avatar);
for (const [headId, modelId] of [[7,11308],[8,11309]]) {
  const alice = catalog.characters[headId];
  assert.equal(alice.modelId, modelId);
  assert.equal(alice.name, '艾莉丝·戴高乐');
  assert.equal(alice.image, `/art/stories/${modelId}.webp`);
  assert.equal(alice.avatar, alice.image, 'Alice must use the same outfit as the native scene');
  assert.equal(alice.avatarFromPortrait, true);
  assert.deepEqual(alice.avatarCrop, {x:260,y:0,size:300,sourceWidth:806});
  assert.notEqual(alice.avatar, catalog.characters[4].avatar, 'Never borrow the male commander icon');
}
assert.notEqual(catalog.characters[7].avatar, catalog.characters[8].avatar);
// All story-only NPC models with a borrowed commander icon, including aliases
// and expression variants. Bind by model, never name or PLAYER_HEAD status.
const npcModels = new Set([11307,11310,11311,11315,11319,11320,11322,11323,11324,11325,11327,11331,11332,11333]);
const seenNpcModels = new Set();
const sharedAvatars = new Map();
const reviewedSharedAvatars = new Map([
  ['ctx-191.webp', [6279,6296]],
  ['ctx-154.webp', [6270,11283]],
  ['ctx-155.webp', [6271,11284]],
  ['ctx-156.webp', [6272,11285]],
  ['ctx-215.webp', [10105,11312,11313,11314]],
  ['ctx-280.webp', [6281,6282]],
  ['ctx-140.webp', [6267,10687]],
  ['ctx-376.webp', [6297,6298]],
]);
assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.meta.audio, false);
assert.equal(catalog.maps.length, new Set(catalog.maps.map(m => m.id)).size);
const images = new Set();
const image = src => { if (src) { assert.ok(src.startsWith('/art/'), src); images.add(src); } };
for (const c of Object.values(catalog.characters)) {
  image(c.image); image(c.avatar);
  if (c.avatar === '/art/stories/ctx-163.webp') assert.equal(c.modelId,11304,'Only the red male commander can use ctx-163');
  if (c.avatar === '/art/stories/ctx-026.webp') assert.equal(c.modelId,6120,'Only Archimedes can use ctx-026');
  if (npcModels.has(c.modelId)) {
    seenNpcModels.add(c.modelId);
    assert.equal(c.avatar,c.image,`${c.modelId}: NPC avatar must match its own scene portrait`);
    assert.equal(c.avatarFromPortrait,true);
    assert.ok(c.avatarCrop,`${c.modelId}: reviewed face crop is required`);
  }
  if (c.avatar) {
    if (!sharedAvatars.has(c.avatar)) sharedAvatars.set(c.avatar,new Set());
    sharedAvatars.get(c.avatar).add(c.modelId);
  }
  if (c.avatarCrop) {
    assert.equal(c.avatar,c.image,'Crop coordinates must apply to this exact character portrait');
    const metadata = await sharp(path.join(root, 'public', c.avatar)).metadata();
    assert.equal(c.avatarCrop.sourceWidth, metadata.width);
    assert.ok(c.avatarCrop.x >= 0 && c.avatarCrop.y >= 0 && c.avatarCrop.size > 0);
    assert.ok(c.avatarCrop.x + c.avatarCrop.size <= metadata.width);
    assert.ok(c.avatarCrop.y + c.avatarCrop.size <= metadata.height);
  }
}
assert.deepEqual(seenNpcModels,npcModels);
for (const [avatar,models] of sharedAvatars) {
  if (models.size <= 1) continue;
  const allowed=reviewedSharedAvatars.get(avatar.split('/').pop());
  assert.ok(allowed,`Unreviewed avatar shared by different models: ${avatar} (${[...models]})`);
  assert.ok([...models].every(id=>allowed.includes(id)),`New model borrows ${avatar}; review identity before release`);
}
for (const c of catalog.categories) {
  image(c.image);
  assert.equal(c.mapCount, catalog.maps.filter(m => m.category === c.id).length);
}
let frames = 0; const longest = []; const unique = new Map();
for (const m of catalog.maps) {
  image(m.image);
  const story = await read(`data/stories/${m.id}.json`);
  assert.equal(story.id, m.id);
  assert.equal(story.frames.length, m.frameCount);
  assert.equal(story.sections.length, m.sectionCount);
  assert.equal(m.summaryOnly, !story.frames.length);
  assert.ok(story.frames.length || story.summaries.length);
  assert.equal(new Set(story.frames.map(f => f.id)).size, story.frames.length);
  let cursor = 0;
  for (const [i, s] of story.sections.entries()) {
    assert.equal(s.start, cursor);
    assert.ok(s.count > 0);
    for (const f of story.frames.slice(s.start, s.start + s.count)) assert.equal(f.section, i);
    cursor += s.count;
  }
  assert.equal(cursor, story.frames.length);
  for (const [i, f] of story.frames.entries()) {
    assert.ok(['dialogue','narration','notice'].includes(f.kind));
    assert.equal(typeof f.text, 'string');
    assert.ok(f.background && f.dialogue, f.id);
    image(f.background); image(f.dialogue); image(f.item);
    for (const id of [f.left, f.right, f.head]) if (id !== null) assert.ok(catalog.characters[id], `${f.id}: ${id}`);
    if (f.kind === 'dialogue') { assert.ok(f.side === 'left' || f.side === 'right'); assert.equal(f[f.side], f.head); }
    const key = f.id.split(':').slice(-2).join(':');
    if (unique.has(key)) assert.equal(unique.get(key), f.text); else unique.set(key, f.text);
    longest.push({ map: m.id, name: m.name, index: i, length: f.text.length });
    frames++;
  }
}
for (const src of images) {
  const info = await sharp(path.join(root, 'public', src)).metadata();
  assert.ok(info.width && info.height, src);
}
assert.equal(clampStoryIndex(-1, 30), 0);
assert.equal(clampStoryIndex(30, 30), 29);
assert.equal(clampStoryIndex(1, 0), 0);
console.log(JSON.stringify({ ok: true, maps: catalog.maps.length, frames, uniqueLines: unique.size, assets: images.size, longest: longest.sort((a,b)=>b.length-a.length).slice(0,5) }, null, 2));
