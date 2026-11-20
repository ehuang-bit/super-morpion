import fs from 'node:fs';
import path from 'node:path';
import {
  applyOutcomeToProfile,
  calculateEloUpdate,
  createDefaultEloProfile,
  getEloTier,
  type EloMatchDelta,
  type EloProfile,
} from '../shared/elo.js';

export interface EloStoreOptions {
  filePath?: string | null;
}

export interface RecordedEloMatch {
  profileX: EloProfile;
  profileO: EloProfile;
  resultX: EloMatchDelta;
  resultO: EloMatchDelta;
}

export function makeProfileKey(
  profileId: string | undefined,
  pseudo: string,
): string {
  const cleanId =
    (profileId ?? 'anon').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'anon';
  const cleanPseudo =
    pseudo.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 20) || 'joueur';
  return `${cleanId}:${cleanPseudo}`;
}

export class EloStore {
  private readonly filePath: string | null;
  private readonly profiles = new Map<string, EloProfile>();

  constructor(options: EloStoreOptions = {}) {
    this.filePath = options.filePath ?? null;
    if (this.filePath) {
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, EloProfile>;
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          if (value && typeof value.rating === 'number') {
            this.profiles.set(key, {
              rating: value.rating,
              gamesPlayed: Number(value.gamesPlayed) || 0,
              wins: Number(value.wins) || 0,
              draws: Number(value.draws) || 0,
              losses: Number(value.losses) || 0,
              peakRating: Number(value.peakRating) || value.rating,
              streak: Number(value.streak) || 0,
            });
          }
        }
      }
    } catch {
      // Ignore corrupt cache file and start clean in memory
    }
  }

  private persistToDisk(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const data = Object.fromEntries(this.profiles.entries());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Ignore disk write failure so gameplay never blocks
    }
  }

  public getProfile(key: string): EloProfile {
    const existing = this.profiles.get(key);
    return existing ? { ...existing } : createDefaultEloProfile();
  }

  public recordMatch(
    keyX: string,
    keyO: string,
    outcomeX: 1 | 0.5 | 0,
  ): RecordedEloMatch {
    const prevX = this.getProfile(keyX);
    const prevO = this.getProfile(keyO);

    const update = calculateEloUpdate(prevX, prevO, outcomeX);
    const outcomeO = (1 - outcomeX) as 1 | 0.5 | 0;

    const nextX = applyOutcomeToProfile(prevX, update.newRatingA, outcomeX);
    const nextO = applyOutcomeToProfile(prevO, update.newRatingB, outcomeO);

    this.profiles.set(keyX, nextX);
    this.profiles.set(keyO, nextO);
    this.persistToDisk();

    return {
      profileX: { ...nextX },
      profileO: { ...nextO },
      resultX: {
        before: prevX.rating,
        after: nextX.rating,
        delta: update.deltaA,
        tier: getEloTier(nextX.rating).label,
      },
      resultO: {
        before: prevO.rating,
        after: nextO.rating,
        delta: update.deltaB,
        tier: getEloTier(nextO.rating).label,
      },
    };
  }
}
