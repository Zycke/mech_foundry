/**
 * electronics.mjs
 * ---------------
 * Canonical seed data for the Electronics compendium, transcribed from the
 * A Time of War EQUIPMENT chapter (Communications, Computers, Surveillance,
 * Optics, Remote Sensors, Sensor Monitors, and electronic Security Systems).
 * Seeded by helpers/gear-seeder.mjs into `mech-foundry.electronics` as editable
 * `electronics` Items, foldered under Electronics by category.
 *
 * `powerUse` is the numeric power draw the book prints (per hour unless the
 * item's note says otherwise); `range` holds the device's operating/detection
 * range as a display string.
 */

const IMG = 'icons/tools/scribal/magnifying-glass.webp';

/** Expand a raw electronics record into a seed entry { folder, subfolder, item }. */
export function toElectronicsSeed(r) {
  return {
    folder: 'Electronics',
    subfolder: r.sub || '',
    item: {
      name: r.name,
      img: r.img || IMG,
      type: 'electronics',
      system: {
        description: r.description || '',
        equipmentRating: r.ar || '',
        cost: r.cost ?? 0,
        affiliation: r.aff || '',
        mass: r.massKg ?? 0,
        notes: r.notes || '',
        carryStatus: 'carried',
        itemEffects: [],
        range: r.range || '',
        powerUse: r.powerUse ?? 0
      },
      flags: { 'mech-foundry': { folder: 'Electronics', subfolder: r.sub || '' } }
    }
  };
}

/* Records mirror the table columns. `sub` is the compendium sub-folder. */
export const ELECTRONICS = [
  // ---- Communications ---------------------------------------------------
  { sub: 'Communications', name: 'Communications Headset', cost: 50, massKg: 0.01, range: '100 m', powerUse: 1 },
  { sub: 'Communications', name: 'Comm. Kit, Long-Range', cost: 400, massKg: 5, range: '50 km (2,500 km to satellite)', powerUse: 3 },
  { sub: 'Communications', name: 'Civilian Communicator', cost: 45, massKg: 0.1, range: '10 km (LOS)', powerUse: 0.2 },
  { sub: 'Communications', name: 'Civilian Micro-Communicator', cost: 175, massKg: 0.005, range: '2 km (LOS)', powerUse: 0.2 },
  { sub: 'Communications', name: 'Intercom-Link', cost: 500, massKg: 0.005, range: '10 m', powerUse: 0.2, notes: 'Usable only within a network; range to nearest network node only; cannot be extended with satellites/relays' },
  { sub: 'Communications', name: 'SatNav Receiver', cost: 75, massKg: 0.5, range: '', powerUse: 1, notes: 'Receiver only; requires a SatNav network; +2 to Navigation rolls when used' },
  { sub: 'Communications', name: 'Vid-Phone', cost: 35, massKg: 0.4, range: '', powerUse: 0.1, notes: 'Cordless "land-line" communicator (ties into local networks)' },
  { sub: 'Communications', name: 'Field Comm. Kit, Advanced', cost: 100000, aff: 'CS', massKg: 100, range: '1,000 km (2,500 km to satellite)', powerUse: 10 },
  { sub: 'Communications', name: 'Field Communicator', cost: 200, massKg: 1, range: '25 km', powerUse: 1 },
  { sub: 'Communications', name: 'Military Communicator', cost: 50, massKg: 0.1, range: '10 km', powerUse: 1 },
  { sub: 'Communications', name: 'Military Micro-Communicator', cost: 75, massKg: 0.001, range: '5 km', powerUse: 1, notes: 'Uses micro power packs only' },
  { sub: 'Communications', name: 'Subvocal Microcommunicator', cost: 600, massKg: 0.0035, range: '100 m', powerUse: 1, notes: 'Micro power packs only; requires Communications/Conventional 2+; -3 to Perception to eavesdrop on user' },
  { sub: 'Communications', name: 'Civilian Field Relay, Small', cost: 2500, massKg: 500, range: '2 km', powerUse: 0, notes: 'Fixed antenna/relay set-up' },
  { sub: 'Communications', name: 'Civilian Field Relay, Large', cost: 4000, massKg: 1000, range: '10 km', powerUse: 0, notes: 'Fixed antenna/relay set-up' },
  { sub: 'Communications', name: 'Civilian Comm. Hub', cost: 8000, massKg: 1000, range: '5 km', powerUse: 0, notes: 'Fixed communications hub; coordinates up to 30 relays' },
  { sub: 'Communications', name: 'Military Relay Antenna', cost: 4500, massKg: 1000, range: '5 km', powerUse: 1, notes: 'Semi-fixed antenna/relay; may connect to a local power grid' },
  { sub: 'Communications', name: 'Military Comm. Hub', cost: 10000, massKg: 1000, range: '25 km', powerUse: 3, notes: 'Mobile communications hub; expandable' },

  // ---- Computers --------------------------------------------------------
  { sub: 'Computers', name: 'Compad', cost: 150, massKg: 0.2, powerUse: 0.1, notes: 'Portable text reader; micro power pack' },
  { sub: 'Computers', name: 'Noteputer', cost: 500, massKg: 0.5, powerUse: 0.1, notes: 'Portable; micro power pack' },
  { sub: 'Computers', name: 'Personal Computer', cost: 250, massKg: 3, powerUse: 1, notes: 'Desktop; power pack or plug' },
  { sub: 'Computers', name: 'Pocket Transcriber', cost: 200, massKg: 0.5, powerUse: 0.5, notes: 'Portable; micro power pack; speech-to-text transcription and playback only' },
  { sub: 'Computers', name: 'Telescan', cost: 100, massKg: 0.75, powerUse: 0.1, notes: 'Portable; micro power pack; needs a working satellite net for local news/weather feeds' },
  { sub: 'Computers', name: 'Descartes MK XXI', cost: 1000, massKg: 7, powerUse: 2, notes: 'Diagnostic scanner; +1 to Technician rolls when diagnosing damage' },
  { sub: 'Computers', name: 'Descartes MK XXV', cost: 2500, massKg: 5, powerUse: 3, notes: 'Diagnostic scanner; +2 to Technician rolls when diagnosing damage' },
  { sub: 'Computers', name: 'Scanalyzer', cost: 5000, massKg: 3, powerUse: 0.1, notes: 'Desktop; +2 to Science rolls when analyzing samples' },
  { sub: 'Computers', name: "Engineer's Portable Console", cost: 5000, massKg: 4, powerUse: 1, notes: 'Interface; +1 to Security Systems/Electronic; -1 to Piloting/Spacecraft' },
  { sub: 'Computers', name: 'Enhanced Imaging Display', cost: 400000, aff: 'CLAN', massKg: 5, powerUse: 0, notes: 'Interface; integrates with cockpit systems (see EI neural implants); +1 to Sensor Operations without EI implants' },
  { sub: 'Computers', name: 'Verigraph Scanner/Reader', cost: 360, massKg: 1, powerUse: 0, notes: 'Encrypts/reads the operator\'s genetic coding for secure message transfer; -4 to Forgery' },

  // ---- Surveillance -----------------------------------------------------
  { sub: 'Surveillance', name: 'Microphone, Directional', cost: 60, massKg: 1.5, range: '100 m', powerUse: 0.1, notes: 'Hears sounds via direct audio' },
  { sub: 'Surveillance', name: 'Microphone, Laser', cost: 500, massKg: 3, range: '1,000 m', powerUse: 3, notes: 'Hears sounds from wall/window vibration; range down to 100 m in fog/smoke/visual clutter' },
  { sub: 'Surveillance', name: 'Voice Distorter', cost: 600, massKg: 0.5, powerUse: 0.1, notes: "Obscures the user's voice" },
  { sub: 'Surveillance', name: 'White Noise Generator', cost: 400, massKg: 2, range: '5 m', powerUse: 1, notes: 'Thwarts audio recordings within range (1 PP/minute)' },
  { sub: 'Surveillance', name: 'Microphone Bug', cost: 40, massKg: 0.01, range: '5 m', powerUse: 0, notes: 'Sound-activated; records up to 2 hours; can transmit up to 100 m for 2 days' },
  { sub: 'Surveillance', name: 'SatNav Bug', cost: 150, massKg: 0.05, powerUse: 0, notes: 'Works with SatNav receivers/networks only; transmits for up to 3 days' },
  { sub: 'Surveillance', name: 'Tracking Bug', cost: 30, massKg: 0.1, powerUse: 0, notes: 'Transmits location for up to 10 days' },
  { sub: 'Surveillance', name: 'Tracking Microphone Bug', cost: 100, massKg: 0.15, powerUse: 0, notes: 'Transmits audio and location for up to 24 hours' },
  { sub: 'Surveillance', name: 'Bug Scanner', cost: 800, massKg: 1, range: '15 m', powerUse: 1, notes: 'Detects bugs in range; Sensor Operations check to locate each' },
  { sub: 'Surveillance', name: 'Bug Scanner Watch', cost: 1500, massKg: 0.1, range: '10 m', powerUse: 0.5, notes: 'Detects bugs in range; Sensor Operations -4 to locate each' },
  { sub: 'Surveillance', name: 'Tracking Bug Locator', cost: 250, massKg: 8, range: '500 m', powerUse: 1, notes: 'Detects and receives audio from friendly tracking bugs' },
  { sub: 'Surveillance', name: 'Tracking Bug Locator, Compact', cost: 2000, massKg: 0.8, range: '200 m', powerUse: 0.5, notes: 'Detects and receives audio from friendly tracking bugs' },

  // ---- Optics -----------------------------------------------------------
  { sub: 'Optics', name: 'Binox Image Intensifier', cost: 25, massKg: 0.25, powerUse: 0, notes: '20x magnification (+1 to Perception at M/L/E)' },
  { sub: 'Optics', name: 'Rangefinder Binoculars', cost: 200, massKg: 0.5, powerUse: 0.1, notes: '400x magnification (+4 to Perception at M/L/E); also works as night-vision goggles' },
  { sub: 'Optics', name: 'Micheaux Electronic Binoculars', cost: 150, aff: 'LA', massKg: 0.75, powerUse: 0.1, notes: '400x magnification (+4 to Perception at M/L/E)' },
  { sub: 'Optics', name: 'IR Scanner', cost: 100, massKg: 0.4, powerUse: 0.1, notes: 'Detects heat signatures only; 300x (+3 to Perception at M/L/E, ignoring darkness)' },
  { sub: 'Optics', name: 'Night Vision Goggles', cost: 220, massKg: 0.6, powerUse: 0.1, notes: 'Negates darkness modifiers; -1 to Perception to spot surface details/insignia' },
  { sub: 'Optics', name: 'Circle-Vision Visor', cost: 5000, aff: 'DC', massKg: 0.75, powerUse: 0.5, notes: '+4 Perception; also a rangefinder; user cannot be surprised; BAR 10 vs. flash' },
  { sub: 'Optics', name: 'Ultrasonic Detector', cost: 2500, aff: 'CS', massKg: 3, powerUse: 0.1, notes: '+3 Perception; spots targets up to 10 m through BAR 3 barriers; ignores darkness; BAR 3 vs. flash (0.1 PP/minute)' },

  // ---- Remote Sensors ---------------------------------------------------
  { sub: 'Remote Sensors', name: 'Heat Sensor', cost: 200, massKg: 0.5, range: '1 km', powerUse: 0.1, notes: 'Detects via heat only (affected by IR stealth gear)' },
  { sub: 'Remote Sensors', name: 'Motion Sensor', cost: 100, massKg: 0.25, range: '10 km', powerUse: 0.1, notes: 'Detects via motion only (affected by camo stealth gear)' },
  { sub: 'Remote Sensors', name: 'Radar Sensor', cost: 2000, massKg: 5, range: '10 km', powerUse: 0.5, notes: 'Detects via EM only (affected by ECM stealth gear)' },
  { sub: 'Remote Sensors', name: 'Seismic Sensor', cost: 1000, massKg: 2, range: '5 km', powerUse: 0.5, notes: 'Sensor Ops mods: +6 BattleMech, +5 ProtoMech, +3 ground/naval vehicle, +2 battle armor, +1 infantry' },
  { sub: 'Remote Sensors', name: 'Trip-Line Sensor (Infrared)', cost: 100, massKg: 0.5, range: '10 m', powerUse: 0.1, notes: '-6 to Perception to spot; max 10 m tripwire' },
  { sub: 'Remote Sensors', name: 'Trip-Line Sensor (Laser)', cost: 50, massKg: 1, range: '10 m', powerUse: 0.1, notes: '-4 to Perception to spot; max 10 m tripwire' },
  { sub: 'Remote Sensors', name: 'Trip-Line Sensor (Physical)', cost: 1, massKg: 0.1, range: '10 m', powerUse: 0, notes: '-2 to Perception to spot; max 10 m tripwire' },

  // ---- Sensor Monitors --------------------------------------------------
  { sub: 'Sensor Monitors', name: 'Heat Monitor, Portable', cost: 1000, massKg: 15, range: '15 km', powerUse: 0.5, notes: 'Monitors up to 10 sensors' },
  { sub: 'Sensor Monitors', name: 'Motion Monitor, Portable', cost: 500, massKg: 10, range: '10 km', powerUse: 0.5, notes: 'Monitors up to 10 sensors' },
  { sub: 'Sensor Monitors', name: 'Radar Monitor', cost: 5000, massKg: 100, range: '50 km', powerUse: 1, notes: 'Monitors up to 10 sensors' },
  { sub: 'Sensor Monitors', name: 'Seismic Monitor', cost: 5000, massKg: 100, range: '20 km', powerUse: 1, notes: 'Monitors up to 5 sensors' },
  { sub: 'Sensor Monitors', name: 'Trip-Line Monitor, Portable', cost: 500, massKg: 10, range: '1 km', powerUse: 0.5, notes: 'Monitors up to 10 sensors' },

  // ---- Security Systems -------------------------------------------------
  { sub: 'Security Systems', name: 'Lock, Magnetic', cost: 100, massKg: 3, powerUse: 0.1, notes: 'Keycard/punch-code/optical/voiceprint access; Security Systems/Electronic to install or pick' },
  { sub: 'Security Systems', name: 'Lock, Mechanical', cost: 30, massKg: 1, powerUse: 0, notes: 'Deadbolt/chain/combination locks; Security Systems/Mechanical to install or pick' },
  { sub: 'Security Systems', name: 'Lock, Alarmed', cost: 25, massKg: 0.5, powerUse: 0.1, notes: 'Add-on: alarm sounds/flashes when picked unless the pick check succeeds by 2+' },
  { sub: 'Security Systems', name: 'Lock, Reinforced', cost: 75, massKg: 2, powerUse: 0, notes: 'Add-on: redundant mechanism/failsafe; -3 to pick (not to install)' },
  { sub: 'Security Systems', name: 'Lock, Neural', cost: 1000, massKg: 5, powerUse: 0.1, notes: 'Neurohelmet-style; -3 to bypass without a Neurohelmet Codebreaker' }
];

/** All electronics seed entries (expanded), consumed by the gear seeder. */
export const ELECTRONICS_SEED = ELECTRONICS.map(toElectronicsSeed);
