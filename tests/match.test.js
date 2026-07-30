import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, tokens, matchScore, bestScore, PASS_THRESHOLD } from '../js/match.js';

test('normalize: 소문자화·구두점 제거·축약 확장', () => {
  assert.equal(normalize("I'm paying you Millions!"), 'i am paying you millions');
  assert.equal(normalize("Don't  do that."), 'do not do that');
  assert.equal(normalize('We gonna win'), 'we going to win');
});

test('tokens: 군더더기(관사·필러) 제거', () => {
  assert.deepEqual(tokens('Uh, the deal is done'), ['deal', 'is', 'done']);
});

test('tokens: 전부 걸러지면 원본 토큰 유지', () => {
  assert.deepEqual(tokens('The a uh'), ['the', 'a', 'uh']);
});

test('matchScore: 완전 일치 = 1', () => {
  assert.equal(matchScore('Get your skinny ass out of here.', 'get your skinny ass out of here'), 1);
});

test('matchScore: 부분 일치 비율', () => {
  const s = matchScore('I want you to drop the suit', 'I want you to drop');
  assert.ok(s > 0.7 && s < 1);
});

test('matchScore: 전혀 다른 문장은 낮음', () => {
  assert.ok(matchScore('Sometimes good guys gotta do bad things', 'hello world') < 0.3);
});

test('bestScore: 대안 중 최고 점수', () => {
  const alts = ['i am paying you millions', 'i am playing you millions'];
  assert.equal(bestScore("I'm paying you millions.", alts), 1);
});

test('PASS_THRESHOLD는 0.8', () => { assert.equal(PASS_THRESHOLD, 0.8); });

test('normalize: wannabe 보존 (부분문자열 버그 회피)', () => {
  assert.equal(normalize('He is a corporate wannabe lawyer.'), 'he is a corporate wannabe lawyer');
});

test('normalize: she\'s 확장', () => {
  assert.equal(normalize("She's a lawyer."), 'she is a lawyer');
});

test('normalize: she\'ll 확장', () => {
  assert.equal(normalize("She'll win."), 'she will win');
});

test('bestScore: 빈 배열 처리', () => {
  assert.equal(bestScore('anything', []), 0);
});
