import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  musicDecisionMatches,
  parseResolutionAnswer,
  stageMusicDecision,
  shouldCloseDialog
} from '../public/music-review-utils.js';

describe('Music review client contract', () => {
  it('preserves unanswered, explicit yes, and explicit no as distinct states', () => {
    assert.equal(parseResolutionAnswer(''), null);
    assert.equal(parseResolutionAnswer(null), null);
    assert.equal(parseResolutionAnswer('yes'), true);
    assert.equal(parseResolutionAnswer('no'), false);
  });

  it('verifies the persisted artist decision after a dashboard reload', () => {
    const expected = {
      status: 'choose-a',
      note: 'Candidate A develops the motif with convincing authority.',
      artistResolutions: [{
        candidateLabel: 'Candidate A',
        question: 'Is the motif audible?',
        confirmed: true
      }],
      updatedAt: '2026-07-26T02:00:00.000Z'
    };
    assert.equal(musicDecisionMatches(structuredClone(expected), expected), true);
    assert.equal(
      musicDecisionMatches({ ...expected, status: 'pending' }, expected),
      false
    );
  });

  it('keeps the review dialog open when validation or persistence fails', () => {
    assert.equal(shouldCloseDialog(false), false);
    assert.equal(shouldCloseDialog(true), true);
    assert.equal(shouldCloseDialog(undefined), true);
  });

  it('stages a review transaction without mutating state that a later save could reuse', () => {
    const currentState = {
      musicReviews: {},
      activity: [],
      metrics: []
    };
    const decision = {
      status: 'choose-b',
      note: 'Candidate B carries the full production architecture.',
      artistResolutions: [],
      updatedAt: '2026-07-26T03:00:00.000Z'
    };
    const activity = {
      id: 'review-activity',
      message: 'Review staged',
      type: 'music',
      timestamp: '2026-07-26T03:00:00.000Z'
    };
    const staged = stageMusicDecision(
      currentState,
      'first-opening-production-proof-a-b',
      decision,
      activity
    );
    assert.equal(
      staged.musicReviews['first-opening-production-proof-a-b'].status,
      'choose-b'
    );
    assert.equal(currentState.musicReviews['first-opening-production-proof-a-b'], undefined);
    assert.equal(currentState.activity.length, 0);

    const laterUnrelatedSave = structuredClone(currentState);
    laterUnrelatedSave.metrics.push({ id: 'unrelated' });
    assert.equal(
      laterUnrelatedSave.musicReviews['first-opening-production-proof-a-b'],
      undefined
    );
  });
});
