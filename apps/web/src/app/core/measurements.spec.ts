import type { BodyEstimate, SavedProfile } from '@vestirse/shared-types';
import { mergeAiMeasurements, profileMeasurements } from './measurements';

const AI: BodyEstimate = { checked: true, usable: true, measurements: { chestCm: 96, waistCm: 82, hipCm: 100 }, confidence: 'medium' };

describe('mergeAiMeasurements', () => {
  it('sin medidas propias usa las de la IA y las marca como estimadas', () => {
    expect(mergeAiMeasurements(null, AI, 172)).toEqual({ heightCm: 172, chestCm: 96, waistCm: 82, hipCm: 100, estimatedFromPose: true });
  });

  it('lo escrito por la persona manda sobre la IA', () => {
    const m = mergeAiMeasurements({ heightCm: 170, chestCm: 101, waistCm: 79, hipCm: 99 }, AI, 170);
    expect(m).toEqual({ heightCm: 170, chestCm: 101, waistCm: 79, hipCm: 99 });
  });

  it('una medición nueva reemplaza a una estimada antes', () => {
    const m = mergeAiMeasurements({ heightCm: 170, chestCm: 90, estimatedFromPose: true }, AI, 170);
    expect(m.chestCm).toBe(96);
  });

  it('una foto no utilizable deja solo la altura', () => {
    expect(mergeAiMeasurements(null, { checked: true, usable: false, reason: 'not-frontal' }, 165)).toEqual({ heightCm: 165 });
  });
});

describe('profileMeasurements', () => {
  const base: SavedProfile = { heightCm: 176, aiFields: [], hasPhoto: true, consentAt: '', updatedAt: '' };

  it('marca como estimadas las medidas que vienen de la IA', () => {
    expect(profileMeasurements({ ...base, chestCm: 96, waistCm: 80, aiFields: ['chestCm', 'waistCm'] }).estimatedFromPose).toBe(true);
  });

  it('con medidas escritas por la persona no las marca', () => {
    expect(profileMeasurements({ ...base, chestCm: 96, shoulderCm: 44, aiFields: ['shoulderCm'] })).toEqual({ heightCm: 176, chestCm: 96 });
  });
});
