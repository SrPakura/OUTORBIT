import { base44 } from '@/api/base44Client';
import type { LeaderboardEntryRecord } from '@/game/types';

/**
 * Lee las mejores puntuaciones globales ordenadas por score descendente.
 * Devuelve [] silenciosamente si Base44 no está disponible (dev local sin conexión).
 */
export async function fetchTopLeaderboard(limit = 10): Promise<LeaderboardEntryRecord[]> {
  try {
    const page = await base44.entities.LeaderboardEntry.list({
      sort: '-score',
      limit,
    });
    return ((page as { items?: unknown[] }).items ?? []) as LeaderboardEntryRecord[];
  } catch (error) {
    console.warn('[leaderboard] No se pudo leer el leaderboard:', error);
    return [];
  }
}

/**
 * Envía una entrada al leaderboard. Devuelve el registro creado o null
 * si el envío falló (p. ej. sin conexión o sin sesión en Base44).
 */
export async function submitLeaderboardEntry(
  entry: Omit<LeaderboardEntryRecord, 'id' | 'created_date'>
): Promise<LeaderboardEntryRecord | null> {
  try {
    const created = await base44.entities.LeaderboardEntry.create({ ...entry });
    return (created ?? null) as LeaderboardEntryRecord | null;
  } catch (error) {
    console.warn('[leaderboard] No se pudo enviar la entrada:', error);
    return null;
  }
}
