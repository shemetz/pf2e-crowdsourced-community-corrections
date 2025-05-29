export const splitHardcodedCorrections = (hardcodedCorrection) => {
  switch (hardcodedCorrection.module_pid) {
    case 'aura spells - hardcoded - add aura':
      return patchesForAuraSpell()
    default:
      throw new Error(`Unknown hardcoded correction module_pid: ${hardcodedCorrection.module_pid}`)
  }
}

const SPELLS_THAT_NEED_AURA_TAG = [
  // 99% confidence
  ['Compendium.pf2e.spells-srd.Item.My7FvAoLYgGDDBzy', 'Antimagic Field'],
  ['Compendium.pf2e.spells-srd.Item.Vw2CNwlRRKABsuZi', 'Entrancing Eyes'],
  ['Compendium.pf2e.spells-srd.Item.28kgh0JzBO6pt38C', 'Focusing Hum'],
  ['Compendium.pf2e.spells-srd.Item.AspA30tzKCHFWRf0', 'Incendiary Aura'],
  ['Compendium.pf2e.spells-srd.Item.YDMOqndvYFu3OjA6', 'Qi Form'],
  ['Compendium.pf2e.spells-srd.Item.ou56ShiFH7GWF8hX', 'Light of Revelation'],
  ['Compendium.pf2e.spells-srd.Item.AsRd1gNRSkHDq2Jx', 'Magnetic Dominion'],
  ['Compendium.pf2e.spells-srd.Item.Um0aaJotqMKGmAlR', 'Pied Piping'],
  ['Compendium.pf2e.spells-srd.Item.uhEjKSFdEhXzszh6', 'Poltergeist\'s Fury'],
  ['Compendium.pf2e.spells-srd.Item.pt3gEnzA159uHcJC', 'Prying Survey'],
  ['Compendium.pf2e.spells-srd.Item.3mINzPzup2m9qzFU', 'Sepulchral Mask'],
  ['Compendium.pf2e.spells-srd.Item.Q1OWufw6dUiY8yEI', 'Shroud of Flame'],
  ['Compendium.pf2e.spells-srd.Item.LTUaK3smfm5eDiFK', 'Song of Marching'],
  ['Compendium.pf2e.spells-srd.Item.3ehSrqTAm7IPqbIZ', 'Spirit Sense'],
  // 80% confidence
  ['Compendium.pf2e.spells-srd.Item.HMTloW1hvRFJ5Z2D', 'Consuming Darkness'],
  ['Compendium.pf2e.spells-srd.Item.oahqARSgOGDRybBQ', 'Control Sand'],
  ['Compendium.pf2e.spells-srd.Item.fxRaWoeOGyi6THYH', 'Frenzied Revelry'],
  ['Compendium.pf2e.spells-srd.Item.yfCykJ6cs0uUL79b', 'Radiant Heart of Devotion'],
  ['Compendium.pf2e.spells-srd.Item.YtJXpiu4ijkB6nP2', 'Unbreaking Wave Barrier'],
  // 60% confidence
  ['Compendium.pf2e.spells-srd.Item.VUMtDHr8CRwwr3Mj', 'Aura of the Unremarkable'],
  ['Compendium.pf2e.spells-srd.Item.bgX4Zfhavahu8lyN', 'Burrow Ward'],
  ['Compendium.pf2e.spells-srd.Item.AnWCohzPgK4L9GVl', 'Detect Scrying'],
  ['Compendium.pf2e.spells-srd.Item.ThE5zPYKF4weiljj', 'Show the Way'],
  ['Compendium.pf2e.spells-srd.Item.kk7JKox6MdGAWmCH', 'Vacuum'],
]
const patchesForAuraSpell = () => {
  return SPELLS_THAT_NEED_AURA_TAG.map(([uuid, name]) => ({
    'name_or_header': name,
    'subheader': '',
    'source': '',
    'issue_type': 'Missing rule',
    'issue_description': '',
    'severity': 1,
    'reasoning': '',
    'confidence': 4,
    'proposed_fix': '',
    'fix_reliability': 4,
    'fix_commentary': '',
    'discussion_link': '',
    'sorting_grouping': '',
    'module_uuid': uuid,
    'module_action': 'ADD_TRAIT',
    'module_field_key': '',
    'module_pattern': '',
    'module_value': 'aura',
    'module_comment': '',
    'module_pid': `aura spells - hardcoded - add aura - ${name.toLowerCase()}`,
  }))
}