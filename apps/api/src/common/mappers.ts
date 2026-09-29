import type { FitFeeling as ApiFeeling, TryOnMode as ApiMode } from '@vestirse/shared-types';
import type { FitFeeling, TryOnMode } from '../generated/prisma/client';

// Prisma no admite guiones en enums: se traduce en el borde, el dominio usa los nombres canónicos.
export const toDbMode = (m: ApiMode) => m.replace('-', '_') as TryOnMode;
export const fromDbMode = (m: TryOnMode) => m.replace('_', '-') as ApiMode;
export const toDbFeeling = (f: ApiFeeling) => f.replace(/-/g, '_') as FitFeeling;
export const fromDbFeeling = (f: FitFeeling) => f.replace(/_/g, '-') as ApiFeeling;

export const mediaUrl = (key: string) => `/api/media/${key}`;
