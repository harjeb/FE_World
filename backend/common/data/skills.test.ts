import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKILLS, skillText } from './skills.ts';

test('skillText retourne le texte standard pour les autres skills', () => {
  for (const id of Object.keys(SKILLS)) {
    if (id === 'divine_inspiration') continue;
    assert.equal(skillText(id as keyof typeof SKILLS, 45), SKILLS[id as keyof typeof SKILLS].text);
  }
});

test('skillText pour divine_inspiration selon le niveau', () => {
  // Niveau 1 à 29 : +3, sans mention des palais suivants
  for (const level of [1, 10, 29]) {
    const t = skillText('divine_inspiration', level);
    assert.ok(t.includes('＋3'), `niveau ${level} doit afficher +3`);
    assert.ok(!t.includes('30级'), `niveau ${level} ne doit pas预告 30级`);
    assert.ok(!t.includes('60级'), `niveau ${level} ne doit pas预告 60级`);
    assert.ok(!t.includes('＋6'), `niveau ${level} ne doit pas mentionner +6`);
    assert.ok(!t.includes('猛攻'), `niveau ${level} ne doit pas mentionner 猛攻`);
  }
  // Niveau 30 à 59 : +6, sans猛攻 ni预告
  for (const level of [30, 45, 59]) {
    const t = skillText('divine_inspiration', level);
    assert.ok(t.includes('＋6'), `niveau ${level} doit afficher +6`);
    assert.ok(!t.includes('＋3，'), `niveau ${level} ne doit plus afficher +3`);
    assert.ok(!t.includes('60级'), `niveau ${level} ne doit pas预告 60级`);
    assert.ok(!t.includes('猛攻'), `niveau ${level} ne doit pas mentionner 猛攻`);
  }
  // Niveau 60 et plus : +6 et 猛攻 effectif
  for (const level of [60, 75, 100]) {
    const t = skillText('divine_inspiration', level);
    assert.ok(t.includes('＋6'), `niveau ${level} doit afficher +6`);
    assert.ok(t.includes('并额外赋予猛攻'), `niveau ${level} doit mentionner 猛攻`);
    assert.ok(!t.includes('30级'), `niveau ${level} ne doit pas预告 30级`);
  }
});

test('skillText sans niveau vaut niveau 1', () => {
  assert.equal(skillText('divine_inspiration'), skillText('divine_inspiration', 1));
});
