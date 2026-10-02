// What kind of flight is this? Six buckets for the "overhead today" counter.
export const CLASSES = ['airline', 'privateplus', 'private', 'cargo', 'heli', 'military'];

const CARGO = new Set(['FDX', 'UPS', 'GTI', 'ABX', 'ATN', 'CKS', 'CLX', 'PAC', 'SOO', 'MTN', 'AJT', 'WGN', 'DHK', 'BCS', 'NCR', 'CAO', 'KAL']);
// Fractional / charter / jet-card fleets that fly under their own operator code.
const PRIVATE_PLUS = new Set(['EJA', 'LXJ', 'VJT', 'XOJ', 'JTL', 'EJM', 'TWY', 'WUP', 'GAJ', 'JRE', 'FWK', 'PJC']);
const HELI_TYPES = /^(EC|AS|H1|H6|B0|B2|B4|R22|R44|R66|S76|S92|A1|AW|UH|AH|CH|MD5)/;
// Airliner families: an operator code on one of these is an airline (or cargo, above).
const AIRLINER = /^(A3|A2|A1[89]|B7|B3|B4|B5|B6|B7|BCS|E1|E2|E7|E9|E45|E14|E13|CRJ|AT[4-7]|DH8|MD8|MD9|MD1|C17|SF3)/;

export function classify({ callsign, type, mil, category }) {
  if (mil) return 'military';
  const t = (type || '').toUpperCase();
  if (category === 'A7' || HELI_TYPES.test(t)) return 'heli';
  const m = /^([A-Z]{3})\d/.exec(callsign || '');
  if (!m) return 'private'; // tail-number callsign or none
  const op = m[1];
  if (CARGO.has(op)) return 'cargo';
  if (PRIVATE_PLUS.has(op)) return 'privateplus';
  if (!t || AIRLINER.test(t)) return 'airline';
  return 'privateplus'; // an operator code on a business jet or small plane: charter / fractional
}
