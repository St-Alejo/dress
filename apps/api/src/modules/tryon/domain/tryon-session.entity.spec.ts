import { DomainError, TryOnSession } from './tryon-session.entity';

const now = new Date('2026-01-01T10:00:00Z');
const requester = { sid: '11111111-1111-1111-1111-111111111111' };
const start = () => TryOnSession.start({ id: 's1', garmentId: 'g1', mode: 'similar-model', requester, now });

describe('TryOnSession', () => {
  it('empieza sin foto ni cuenta', () => {
    const dto = start().toDto();
    expect(dto.uploadedPhotoUrl).toBeUndefined();
    expect(dto.userId).toBeUndefined();
    expect(dto.generationStatus).toBe('idle');
  });

  it('adjuntar foto pasa a fotorrealista con TTL', () => {
    const s = start();
    s.attachPhoto(now, 24);
    expect(s.mode).toBe('photorealistic');
    expect(s.toDto().photoExpiresAt).toBe('2026-01-02T10:00:00.000Z');
    expect(s.isExpired(new Date('2026-01-02T10:00:01Z'))).toBe(true);
  });

  it('no se puede generar sin foto', () => {
    expect(() => start().requestGeneration()).toThrow(DomainError);
  });

  it('no permite dos generaciones simultáneas', () => {
    const s = start();
    s.attachPhoto(now, 24);
    s.requestGeneration();
    expect(() => s.requestGeneration()).toThrow(DomainError);
    expect(() => s.attachPhoto(now, 24)).toThrow(DomainError);
  });

  it('purgar borra foto y resultado no guardado', () => {
    const s = start();
    s.attachPhoto(now, 24);
    s.requestGeneration();
    s.complete();
    expect(s.purgePhoto().sort()).toEqual(['uploads/sessions/s1/photo.jpg', 'uploads/sessions/s1/result.png']);
    expect(s.toDto().resultImageUrl).toBeUndefined();
  });

  it('un resultado guardado en la cuenta sobrevive a la purga', () => {
    const s = start();
    s.attachPhoto(now, 24);
    s.requestGeneration();
    s.complete();
    s.saveResult('u1');
    expect(s.purgePhoto()).toEqual(['uploads/sessions/s1/photo.jpg']);
    expect(s.resultKey).toBe('saved/u1/s1.png');
  });

  it('pertenece a su sid o a su cuenta, a nadie más', () => {
    const s = start();
    expect(s.isOwnedBy(requester)).toBe(true);
    expect(s.isOwnedBy({ sid: 'otro' })).toBe(false);
  });
});
