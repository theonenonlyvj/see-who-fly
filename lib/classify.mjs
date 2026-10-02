// What kind of flight is this? Six buckets for the "overhead today" counter.
//   airline      scheduled passenger flights (incl. regionals and commuters)
//   privateplus  business jets: fractional/charter fleets and privately flown jets alike
//   private      small planes: pistons and small turboprops on tail numbers, and flight-school trainers
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

// Light trainers and piston singles/twins: flight schools fly them under an operator code (EPI = Epic
// Flight Academy), but they're small private planes, not airline flights.
const LIGHT = /^(C15[02]|C162|C17[0-7]|C72R|C77R|C18[02]|C185|C82[RT]|C206|T206|C210|P210|C337|P28[ABRTU]|PA32|P32[RT]|PA18|PA24|PA34|PA38|PA44|PA46|SR2[02]|S22T|DV20|DA40|DA42|DA62|BE23|BE3[356]|BE5[58]|BE76|BE95|M20[PT]|C310|C340|AA5|TB[12][0-9]|P208|P06T)$/;

export function classify({ callsign, type, mil, category }) {
  if (mil) return 'military';
  const t = (type || '').toUpperCase();
  if (category === 'A7' || HELI.has(t)) return 'heli';
  const m = /^([A-Z]{3})\d/.exec(callsign || '');
  const op = m ? m[1] : null;
  if (op && CARGO.has(op)) return 'cargo';
  if (LIGHT.test(t)) return 'private';
  if (BIZJET.has(t) || (op && FRACTIONAL.has(op))) return 'privateplus';
  if (op || AIRLINER.test(t)) return 'airline'; // an operator code, or an airliner however it's flying
  return 'private';
}

// The everyday airliners (narrow-bodies and regional jets) on airline flights. Their photos are just
// stock pictures; wide-bodies, commuters (Twin Otters, Caravans), private 737s, cargo and everything
// else are the "various planes" worth a photo.
const COMMON = /^(A318|A319|A320|A321|A19N|A20N|A21N|BCS[13]|B712|B752|B753|B73[6-9]|B37M|B38M|B39M|B3XM|E45X|E170|E175|E75[LS]|E190|E195|E290|E295|CRJ[1-9X]|E135|E145|MD8[0-9]|MD90)$/;
// Needs an airline callsign too: a 737 flying on its own tail number is a private BBJ, not a commute.
export const isCommonAirliner = ({ cls, type, callsign }) => cls === 'airline' && /^[A-Z]{3}\d/.test(callsign || '') && COMMON.test((type || '').toUpperCase());
