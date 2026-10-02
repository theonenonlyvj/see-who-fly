// A few facts per ICAO type for the cards. Approximate public figures.
import { wingspanM, hasWingspan } from './visibility.mjs';

const F = {
  B736: ['2 turbofans (CFM56)', 'Boeing 737'], B737: ['2 turbofans (CFM56)', 'Boeing 737'], B738: ['2 turbofans (CFM56)', 'Boeing 737'],
  B739: ['2 turbofans (CFM56)', 'Boeing 737'], B37M: ['2 turbofans (CFM LEAP-1B)', 'Boeing 737 MAX'], B38M: ['2 turbofans (CFM LEAP-1B)', 'Boeing 737 MAX'],
  B39M: ['2 turbofans (CFM LEAP-1B)', 'Boeing 737 MAX'], A319: ['2 turbofans', 'Airbus A320 family'], A320: ['2 turbofans', 'Airbus A320 family'],
  A321: ['2 turbofans', 'Airbus A320 family'], A20N: ['2 turbofans (neo)', 'Airbus A320neo'], A21N: ['2 turbofans (neo)', 'Airbus A321neo'],
  BCS1: ['2 geared turbofans', 'Airbus A220'], BCS3: ['2 geared turbofans', 'Airbus A220'],
  E170: ['2 turbofans', 'Embraer E-Jet'], E75L: ['2 turbofans', 'Embraer E175'], E75S: ['2 turbofans', 'Embraer E175'], E190: ['2 turbofans', 'Embraer E190'],
  E145: ['2 turbofans (rear-mounted)', 'Embraer ERJ-145'], CRJ2: ['2 turbofans (rear-mounted)', 'Bombardier CRJ'], CRJ7: ['2 turbofans (rear-mounted)', 'Bombardier CRJ'],
  CRJ9: ['2 turbofans (rear-mounted)', 'Bombardier CRJ'], B752: ['2 turbofans', 'Boeing 757'], B763: ['2 turbofans', 'Boeing 767'], B772: ['2 turbofans', 'Boeing 777'],
  B77W: ['2 turbofans (GE90, the biggest)', 'Boeing 777'], B788: ['2 turbofans', 'Boeing 787'], B789: ['2 turbofans', 'Boeing 787'],
  A332: ['2 turbofans', 'Airbus A330'], A333: ['2 turbofans', 'Airbus A330'], A359: ['2 turbofans', 'Airbus A350'],
  C17: ['4 turbofans (P&W F117)', 'Boeing C-17 Globemaster III'], C130: ['4 turboprops', 'Lockheed C-130 Hercules'], C30J: ['4 turboprops (6-blade)', 'Lockheed C-130J'],
  K35R: ['4 turbofans', 'Boeing KC-135'], KC46: ['2 turbofans', 'Boeing KC-46'], T38: ['2 afterburning turbojets', 'Northrop T-38 Talon'], F16: ['1 afterburning turbofan', 'F-16'],
  GLF4: ['2 turbofans (Rolls-Royce Tay)', 'Gulfstream IV'], GLF5: ['2 turbofans (Rolls-Royce BR710)', 'Gulfstream V'], GLF6: ['2 turbofans (Rolls-Royce BR725)', 'Gulfstream G650'],
  GLEX: ['2 turbofans', 'Bombardier Global'], CL30: ['2 turbofans', 'Bombardier Challenger 300'], CL35: ['2 turbofans', 'Bombardier Challenger 350'],
  CL60: ['2 turbofans', 'Bombardier Challenger 600-series'], C56X: ['2 turbofans', 'Cessna Citation Excel'], C680: ['2 turbofans', 'Cessna Citation Sovereign'],
  C68A: ['2 turbofans', 'Cessna Citation Latitude'], C700: ['2 turbofans', 'Cessna Citation Longitude'], C750: ['2 turbofans', 'Cessna Citation X'],
  C25A: ['2 turbofans', 'Cessna CitationJet CJ2'], C25B: ['2 turbofans', 'Cessna CitationJet CJ3'], E55P: ['2 turbofans', 'Embraer Phenom 300'],
  H25B: ['2 turbofans', 'Hawker 800'], FA7X: ['3 turbofans', 'Dassault Falcon 7X'], F900: ['3 turbofans', 'Dassault Falcon 900'], F2TH: ['2 turbofans', 'Dassault Falcon 2000'],
  PC12: ['1 turboprop', 'Pilatus PC-12'], PC24: ['2 turbofans', 'Pilatus PC-24'], BE20: ['2 turboprops', 'Beechcraft King Air'], B350: ['2 turboprops', 'Beechcraft King Air 350'],
  C208: ['1 turboprop', 'Cessna Caravan'], C172: ['1 piston', 'Cessna 172'], C182: ['1 piston', 'Cessna 182'], P28A: ['1 piston', 'Piper Cherokee'], PA24: ['1 piston', 'Piper Comanche'],
  SR22: ['1 piston (with a parachute)', 'Cirrus SR22'], EC35: ['2 turboshafts', 'Airbus H135 helicopter'], AS50: ['1 turboshaft', 'Airbus H125 helicopter'],
};
const COURT_M = 28.65, BUS_M = 13.7; // NBA court length; US school bus length

export function typeFacts(type) {
  const f = F[(type || '').toUpperCase()];
  if (!f || !hasWingspan(type)) return null; // no reliable wingspan: say nothing rather than guess
  const span = wingspanM(type);
  const ft = Math.round(span / 0.3048);
  const courts = span / COURT_M, buses = span / BUS_M;
  const compare = courts >= 0.85 ? `wingspan ≈ ${courts.toFixed(1)} basketball courts` : `wingspan ≈ ${buses.toFixed(1)} school buses`;
  return { engines: f[0], family: f[1], span, spanFt: ft, compare };
}
