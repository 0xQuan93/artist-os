export function parseResolutionAnswer(value) {
  const answer = String(value || '');
  return answer === 'yes' ? true : answer === 'no' ? false : null;
}

export function musicDecisionMatches(persisted, expected) {
  if (!persisted || !expected) return false;
  const persistedAnswers = persisted.artistResolutions || persisted.scores || null;
  const expectedAnswers = expected.artistResolutions || expected.scores || null;
  return persisted.status === expected.status
    && persisted.note === expected.note
    && persisted.updatedAt === expected.updatedAt
    && JSON.stringify(persistedAnswers) === JSON.stringify(expectedAnswers);
}

export function shouldCloseDialog(handlerResult) {
  return handlerResult !== false;
}

export function stageMusicDecision(currentState, itemId, decision, activity) {
  const stagedState = structuredClone(currentState);
  stagedState.musicReviews = stagedState.musicReviews || {};
  stagedState.activity = Array.isArray(stagedState.activity)
    ? stagedState.activity
    : [];
  stagedState.musicReviews[itemId] = structuredClone(decision);
  stagedState.activity.unshift(structuredClone(activity));
  stagedState.activity = stagedState.activity.slice(0, 100);
  return stagedState;
}
