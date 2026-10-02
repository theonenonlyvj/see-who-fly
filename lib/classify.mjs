// What kind of flight is this? Six buckets for the "overhead today" counter.
//   airline      scheduled passenger flights (incl. regionals and commuters)
//   privateplus  business jets: fractional/charter fleets and privately flown jets alike
//   private      small private planes (pistons, small turboprops) on tail-number callsigns
//   cargo, heli, military
export const CLASSES = ['airline', 'privateplus', 'private', 'cargo', 'heli', 'military'];

const CARGO = new Set(['FDX', 'UPS', 'GTI', 'ABX', 'ATN', 'CKS', 'CLX', 'PAC', 'SOO', 'MTN', 'AJT', 'WGN', 'DHK', 'BCS', 'NCR', 'CAO']);
// Fractional / charter / jet-card fleets that fly under their own operator code (even on turboprops).
const FRACTIONAL = new Set(['EJA', 'LXJ', 'VJT', 'XOJ', 'JTL', 'EJM', 'TWY', 'WUP', 'GAJ', 'JRE', 'FWK', 'PJC', 'CNS']);
// Airliner families: count as airline even with no callsign or on a tail number.
const AIRLINER = /^(A3[0-9]{2}|A3[0-9]N|A19N|A20N|A21N|A22[0-9]|BCS[13]|B7[0-9]{2}|B3[0-9]M|B7[0-9]X|E1[79]0|E75[LS]|E19[05]|E29[05]|CRJ[1-9X]|AT[47][0-9]|DH8[A-D]|MD[89][0-9])$/;
const HELI = new Set(['A109', 'A119', 'A139', 'A169', 'A189', 'AS32', 'AS35', 'AS50', 'AS55', 'AS65', 'B06', 'B06T', 'B105', 'B212', 'B407',
  'B412', 'B429', 'B505', 'BK17', 'EC20', 'EC25', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75', 'H160', 'H60', 'MI8', 'R22', 'R44', 'R66',
  'S61', 'S70', 'S76', 'S92', 'UH1', 'AH64', 'CH47', 'V22']);
const BIZJET = new Set(['GLF4', 'GLF5', 'GLF6', 'GA5C', 'GA6C', 'GA7C', 'GA8C', 'G150', 'G280', 'GALX', 'ASTR', 'GLEX', 'GL5T', 'GL7T',
  'CL30', 'CL35', 'CL60', 'C25A', 'C25B', 'C25C', 'C25M', 'C500', 'C510', 'C525', 'C550', 'C560', 'C56X', 'C650', 'C680', 'C68A', 'C700', 'C750',
  'E50P', 'E55P', 'E545', 'E550', 'H25B', 'H25C', 'LJ31', 'LJ35', 'LJ40', 'LJ45', 'LJ60', 'LJ70', 'LJ75', 'FA7X', 'FA8X', 'FA10', 'FA20',
  'FA50', 'F2TH', 'F900', 'PC24', 'HDJT', 'BE40', 'PRM1', 'SF50', 'EA50', 'E35L', 'FA6X', 'GLF2', 'GLF3', 'HA4T', 'LJ25', 'LJ55', 'C501', 'C551', 'C55B']);

export function classify({ callsign, type, mil, category }) {
  if (mil) return 'military';
  const t = (type || '').toUpperCase();
  if (category === 'A7' || HELI.has(t)) return 'heli';
  const m = /^([A-Z]{3})\d/.exec(callsign || '');
  const op = m ? m[1] : null;
  if (op && CARGO.has(op)) return 'cargo';
  if (BIZJET.has(t) || (op && FRACTIONAL.has(op))) return 'privateplus';
  if (op || AIRLINER.test(t)) return 'airline'; // an operator code, or an airliner however it's flying
  return 'private';
}
