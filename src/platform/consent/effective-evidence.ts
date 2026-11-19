export interface EffectiveEvidence {
  id: string;
  effectiveAt?: string;
  recordedAt: string;
}

const timestamp = (value: string) => Date.parse(value);

export function selectCurrentEffectiveEvidence<T extends EffectiveEvidence>(
  evidence: readonly T[],
  referenceTime: Date,
): T | undefined {
  const referenceTimestamp = referenceTime.getTime();

  return evidence.reduce<T | undefined>((selected, candidate) => {
    const candidateEffectiveAt = timestamp(candidate.effectiveAt ?? candidate.recordedAt);
    const candidateRecordedAt = timestamp(candidate.recordedAt);
    if (!Number.isFinite(candidateEffectiveAt) || !Number.isFinite(candidateRecordedAt) || candidateEffectiveAt > referenceTimestamp) {
      return selected;
    }
    if (!selected) return candidate;

    const selectedEffectiveAt = timestamp(selected.effectiveAt ?? selected.recordedAt);
    const selectedRecordedAt = timestamp(selected.recordedAt);
    const order = candidateEffectiveAt - selectedEffectiveAt
      || candidateRecordedAt - selectedRecordedAt
      || candidate.id.localeCompare(selected.id);
    return order > 0 ? candidate : selected;
  }, undefined);
}
