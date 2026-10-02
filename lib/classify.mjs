// What kind of flight is this? Six buckets for the "overhead today" counter.
//   airline      scheduled passenger flights (incl. regionals and commuters)
//   privateplus  business jets: fractional/charter fleets and privately flown jets alike
//   private      small private planes (pistons, small turboprops) on tail-number callsigns
//   cargo, heli, military
export const CLASSES = ['airline', 'privateplus', 'private', 'cargo', 'heli', 'military'];

const CARGO = new Set(['FDX', 'UPS', 'GTI', 'ABX', 'ATN', 'CKS', 'CLX', 'PAC', 'SOO', 'MTN', 'AJT', 'WGN', 'DHK', 'BCS', 'NCR', 'CAO']);
const HELI = new Set(['A109', 'A119', 'A139', 'A169', 'A189', 'AS32', 'AS35', 'AS50', 'AS55', 'AS65', 'B06', 'B06T', 'B105', 'B212', 'B407',
  'B412', 'B429', 'B505', 'BK17', 'EC20', 'EC25', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75', 'H160', 'H60', 'MI8', 'R22', 'R44', 'R66',
  'S61', 'S70', 'S76', 'S92', 'UH1', 'AH64', 'CH47', 'V22']);
const BIZJET = new Set(['GLF4', 'GLF5', 'GLF6', 'GA5C', 'GA6C', 'GA7C', 'GA8C', 'G150', 'G280', 'GALX', 'ASTR', 'GLEX', 'GL5T', 'GL7T',
  'CL30', 'CL35', 'CL60', 'C25A', 'C25B', 'C25C', 'C25M', 'C500', 'C510', 'C525', 'C550', 'C560', 'C56X', 'C650', 'C680', 'C68A', 'C700', 'C750',
  'E50P', 'E55P', 'E545', 'E550', 'H25B', 'H25C', 'LJ31', 'LJ35', 'LJ40', 'LJ45', 'LJ60', 'LJ70', 'LJ75', 'FA7X', 'FA8X', 'FA10', 'FA20',
  'FA50', 'F2TH', 'F900', 'PC24', 'HDJT', 'BE40', 'PRM1', 'SF50', 'EA50']);

export function classify({ callsign, type, mil, category }) {
  if (mil) return 'military';
  const t = (type || '').toUpperCase();
  if (category === 'A7' || HELI.has(t)) return 'heli';
  if (BIZJET.has(t)) return 'privateplus';
  const m = /^([A-Z]{3})\d/.exec(callsign || '');
  if (m) return CARGO.has(m[1]) ? 'cargo' : 'airline'; // an operator code on anything that isn't a business jet
  return 'private';
}
