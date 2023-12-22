import { allGeneratedCorrections } from './generatedCorrections.js'

const MODULE_ID = 'pf2e-crowdsourced-community-corrections'
const MODULE_NAME_SHORT = 'Pf2e CCC'

const lockedCompendiums = new Set()

const localize = (key) => game.i18n.localize(MODULE_ID + key)

const unlockCompendium = async (patch) => {
  const { module_uuid } = patch
  const document = await fromUuid(module_uuid)
  if (!document) return // error notification comes later
  const compendium = document?.compendium
  if (!compendium) return // error notification comes later
  if (!compendium.locked) return  // no need to unlock
  await compendium.configure({ locked: false })
  lockedCompendiums.add(compendium)
}
const lockAllRecentlyUnlockedCompendiums = async () => {
  for (const compendium of lockedCompendiums) {
    await compendium.configure({ locked: true })
  }
  lockedCompendiums.clear()
}

const patchObjectWithCorrection = async (patch) => {
  const {
    name_or_header: name,
    module_uuid: uuid,
    module_action: action,
    module_field_key: fieldKey,
    module_pattern: pattern,
    module_value: value,
  } = patch
  const errorNotification = (msg) => ui.notifications.error(`${MODULE_NAME_SHORT} | ${name} | ${msg}`)
  const document = await fromUuid(uuid)
  if (!document)
    return errorNotification(`Could not find document with UUID ${uuid}`)
  const compendium = document?.compendium
  if (!compendium)
    return errorNotification(`Could not find compendium for document with UUID ${uuid}`)
  const originalDocData = document?.toObject()
  const flags = originalDocData.flags
  if (flags?.[MODULE_ID]?.['patched']) {
    // skip - already patched
    return false
  }
  if (fieldKey === 'system.traits.value')
    return errorNotification(`Do not use the system.traits.value field directly!`)

  const patchUpdate = {}
  const traits = originalDocData.system.traits.value.slice()  // .slice() = create copy
  traits.push('pf2e-ccc-patched')
  switch (action) {
    case 'ADD_TRAIT':
      if (traits.includes(value))
        return errorNotification(`Document already has trait ${value}`)
      traits.push(value)
      break
    case 'REMOVE_TRAIT':
      if (!traits.includes(value))
        return errorNotification(`Document doesn't already have trait ${value}`)
      traits.splice(traits.indexOf(value), 1)
      break
    case 'FIND_AND_REPLACE':
      const originalValue = getProperty(originalDocData, fieldKey)
      const updatedValue = originalValue.replace(pattern, value)
      if (updatedValue === originalValue)
        return errorNotification(`Field ${fieldKey} has no matches for pattern`)
      const multiUpdatedValue = updatedValue.replaceAll(pattern, value)
      if (updatedValue !== multiUpdatedValue) {
        return errorNotification(`Field ${fieldKey} has more than 1 matche for pattern`)
      }
      const extraUpdatedValue = updatedValue.replace(pattern, value)
      if (updatedValue !== extraUpdatedValue) {
        return errorNotification(`Pattern replacement in ${fieldKey} isn't self-preventing`)
      }
      patchUpdate[fieldKey] = updatedValue
      break
    case 'APPEND':
      let valueBeforeAppend = getProperty(originalDocData, fieldKey)
      const extraSuffix = valueBeforeAppend.endsWith('</p>') ? '</p>' : ''
      const trimmedValue = valueBeforeAppend.substring(0, valueBeforeAppend.length - extraSuffix.length)
      if (trimmedValue.endsWith(value))
        return errorNotification(`Field ${fieldKey} already ends with: ${value}`)
      patchUpdate[fieldKey] = trimmedValue + value + extraSuffix
      break
    case 'PREPEND':
      const valueBeforePrepend = getProperty(originalDocData, fieldKey)
      const extraPrefix = valueBeforePrepend.startsWith('<p>') ? '<p>' : ''
      const trimmedValue2 = valueBeforePrepend.substring(extraPrefix.length)
      if (trimmedValue2.startsWith(value))
        return errorNotification(`Field ${fieldKey} already starts with: ${value}`)
      patchUpdate[fieldKey] = extraPrefix + value + trimmedValue2
      break
    case 'OVERWRITE': // no check to see if it was already replaced;  this one just has to be applied over and over
      patchUpdate[fieldKey] = value
      break
    default:
      return errorNotification(`Unknown action: ${action}`)
  }
  patchUpdate[`flags.${[MODULE_ID]}.patched`] = true
  patchUpdate['system.traits.value'] = traits
  console.debug(`${MODULE_NAME_SHORT} | ${name} | Patching document with UUID ${uuid}...`, patchUpdate)
  await document.update(patchUpdate)
  return true
}

const patchEverything = async () => {
  console.log(`${MODULE_NAME_SHORT} | Starting to patch documents...`)
  const corrections = allGeneratedCorrections
  for (const correction of corrections) {
    await unlockCompendium(correction)
  }
  const wereUpdated = []
  console.log(`${MODULE_NAME_SHORT} | (Unlocked ${lockedCompendiums.size} compendiums)`)
  for (const correction of corrections) {
    try {
      const patchResult = await patchObjectWithCorrection(correction)
      if (patchResult === true)
        wereUpdated.push(correction)
    } catch (e) {
      ui.notifications.error(`Error while patching UUID: ${correction.module_uuid}`)
      console.error(e)
    }
  }
  if (wereUpdated.length > 0)
    console.log(`${MODULE_NAME_SHORT} | Done patching documents:`, wereUpdated.map(c => c.name_or_header))
  else
    console.log(`${MODULE_NAME_SHORT} | No documents patched (all good except for any logged errors)`)
  await lockAllRecentlyUnlockedCompendiums()
}

const pf2eSystemReadyHook = async () => {
  if (!game.user.isGM) return // only GMs have the permissions (and need) to do all this
  const numOfCorrections = Object.keys(allGeneratedCorrections).length
  console.log(`${MODULE_NAME_SHORT} | Initializing, with ${numOfCorrections} error corrections in json file`)
  window.pf2eCccc = { patchEverything, lockAllRecentlyUnlockedCompendiums }
}

Hooks.once('pf2e.systemReady', pf2eSystemReadyHook)
