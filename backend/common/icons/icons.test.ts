import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_ITEMS } from '../game/items.ts';
import { drawItemIcon, ICON_SIZE, iconKeys } from './draw.ts';

test('every weapon, spellbook, manual and item has its own icon', () => {
  const keys = Object.keys(GAME_ITEMS);
  assert.deepEqual([...iconKeys()].sort(), [...keys].sort());
  const seen = new Map<string, string>();
  for (const key of keys) {
    const px = drawItemIcon(key);
    assert.ok(px, `${key} has no icon`);
    assert.equal(px.length, ICON_SIZE * ICON_SIZE * 4);
    const hash = Buffer.from(px).toString('base64');
    assert.ok(!seen.has(hash), `${key} draws the same pixels as ${seen.get(hash)}`);
    seen.set(hash, key);
  }
});

test('icons are outlined pixel art with enough filled pixels to read', () => {
  for (const key of iconKeys()) {
    const px = drawItemIcon(key)!;
    let filled = 0, outline = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      assert.equal(px[i + 3], 255, `${key}: no partial alpha`);
      filled++;
      if (px[i] === 0x2B && px[i + 1] === 0x24 && px[i + 2] === 0x21) outline++;
    }
    assert.ok(filled >= 30, `${key}: only ${filled} pixels`);
    assert.ok(outline >= 12, `${key}: missing outline`);
  }
});

test('the same key always draws the same icon and unknown keys draw nothing', () => {
  assert.deepEqual(drawItemIcon('iron_sword'), drawItemIcon('iron_sword'));
  assert.equal(drawItemIcon('no_such_item'), null);
});
