import { allGeneratedCorrections } from './generatedCorrections.js'

const MODULE_ID = 'pf2e-crowdsourced-community-corrections'
const MODULE_NAME_SHORT = 'Pf2e CCC'

const lockedCompendiums = new Set()

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

const handleArraysInDotNotation = (patchUpdate, originalDocData) => {
  const finalPatchUpdate = patchUpdate
  for (const [fullKey, value] of Object.entries(patchUpdate)) {
    const keyParts = fullKey.split('.')
    for (let i = 0; i < keyParts.length; i++) {
      const keyPart = keyParts[i]
      if (keyPart.match(/^\d+$/)) {
        // this is an array index
        const keyAsIndex = parseInt(keyPart)
        const keyUntilArray = keyParts.slice(0, i).join('.')
        const array = getProperty(originalDocData, keyUntilArray)
        if (!Array.isArray(array)) {
          if (typeof array === 'object')
            continue // this is an object with a single digit string key, not an array
          throw new Error(`Expected ${keyUntilArray} to be an array`)
        }
        if (i === keyParts.length - 1) {
          // this is the final key
          array[keyAsIndex] = value
        } else {
          // this is not the final key
          const keyAfterArray = keyParts.slice(i + 1).join('.')
          array[keyAsIndex][keyAfterArray] = value
        }
        delete finalPatchUpdate[fullKey]
        finalPatchUpdate[keyUntilArray] = array
      }
    }
  }
}

const patchObjectWithCorrections = async (patches) => {
  const { module_uuid: uuid, name_or_header: name } = patches[0]
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
  const patchUpdate = {}
  const traits = originalDocData.system.traits?.value?.slice()  // .slice() = create copy
  for (const patch of patches) {
    const {
      module_action: action,
      module_field_key: fieldKey,
      module_pattern: pattern,
      module_value: value,
    } = patch
    if (fieldKey.includes('system.traits.value'))
      return errorNotification(`Do not use the system.traits.value field directly!`)
    if (fieldKey.includes('system.prerequisites.value'))
      return errorNotification(`Do not use the system.traits.value field directly!`)
    const originalValue = fieldKey ? getProperty(originalDocData, fieldKey) : undefined
    if (fieldKey && originalValue === undefined && action !== 'OVERWRITE')
      return errorNotification(`Could not find value in field ${fieldKey}`)
    if (pattern !== '' && action !== 'FIND_AND_REPLACE')
      return errorNotification(`Pattern must be empty for ${action} action;  did you mean to use FIND_AND_REPLACE?`)
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
      case 'ADD_PREREQUISITE':
        const prereqs = originalDocData.system.prerequisites.value.slice()  // .slice() = create copy
        if (prereqs.includes(value) || prereqs?.[0]?.value === value)
          return errorNotification(`Document already has prerequisite ${value}`)
        prereqs.push({ value: value })
        patchUpdate['system.prerequisites.value'] = prereqs
        break
      case 'FIND_AND_REPLACE':
        if (pattern === '')
          return errorNotification(`Pattern cannot be empty`)
        //if pattern and value are integers, don't convert
        if (value.startsWith('{') && value.endsWith('}')) {
          const strOriginalValue = JSON.stringify(originalValue)
          const jsonValue = JSON.parse(value)
          if (strOriginalValue !== pattern)
            return errorNotification(`Field ${fieldKey} doesn't match expected value ${pattern}: ${originalValue}`)
          if (strOriginalValue === value)
            return errorNotification(`Field ${fieldKey} already has value ${value}`)
          patchUpdate[fieldKey] = jsonValue
          break
        } else if (Number.isInteger(value) || value.match(/^-?\d+$/)) {
          const intPattern = parseInt(pattern)
          const intValue = parseInt(value)
          if (originalValue !== intPattern)
            return errorNotification(`Field ${fieldKey} doesn't match expected value ${intPattern}: ${originalValue}`)
          if (originalValue === intValue)
            return errorNotification(`Field ${fieldKey} already has value ${intValue}`)
          patchUpdate[fieldKey] = intValue
          break
        } else {
          const updatedValue = originalValue.replace(pattern, value)
          if (updatedValue === originalValue)
            if (originalValue.includes(value))
              return errorNotification(`Field ${fieldKey} already contains value without any pattern matching`)
            else
              return errorNotification(`Field ${fieldKey} has no matches for pattern`)
          const multiUpdatedValue = originalValue.replaceAll(pattern, value)
          if (updatedValue !== multiUpdatedValue) {
            return errorNotification(`Field ${fieldKey} has more than 1 matches for pattern`)
          }
          const extraUpdatedValue = updatedValue.replace(pattern, value)
          if (updatedValue !== extraUpdatedValue) {
            return errorNotification(`Pattern replacement in ${fieldKey} isn't self-preventing`)
          }
          patchUpdate[fieldKey] = updatedValue
          break
        }
      case 'APPEND':
        const extraSuffix = originalValue.endsWith('</p>') ? '</p>' : ''
        const trimmedValue = originalValue.substring(0, originalValue.length - extraSuffix.length)
        if (trimmedValue.endsWith(value))
          return errorNotification(`Field ${fieldKey} already ends with: ${value}`)
        patchUpdate[fieldKey] = trimmedValue + value + extraSuffix
        break
      case 'PREPEND':
        const extraPrefix = originalValue.startsWith('<p>') ? '<p>' : ''
        const trimmedValue2 = originalValue.substring(extraPrefix.length)
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
  }
  patchUpdate[`flags.${[MODULE_ID]}.patched`] = true
  if (traits) {
    traits.push('pf2e-ccc-patched')
    patchUpdate['system.traits.value'] = traits
  } else {
    // deities don't have traits so I'm forced to change their name to keep the change clearly visible
    patchUpdate['name'] = originalDocData.name + ' (CCC Patched)'
  }
  // handle arrays (annoyingly, foundry dot notation doesn't automatically do this)
  handleArraysInDotNotation(patchUpdate, originalDocData)
  console.debug(`${MODULE_NAME_SHORT} | ${name} | Patching document with UUID ${uuid}...`, patchUpdate)
  await document.update(patchUpdate)
  return true
}

const unsetPatchMarkers = async (uuid) => {
  const correction = allGeneratedCorrections.find(c => c.module_uuid === uuid)
  await unlockCompendium(correction)
  const document = await fromUuid(uuid)
  const patchUpdate = { [`flags.${[MODULE_ID]}.patched`]: false }
  if (document.system.traits?.value?.includes('pf2e-ccc-patched')) {
    const traits = document.system.traits.value.slice()
    traits.splice(traits.indexOf('pf2e-ccc-patched'), 1)
    patchUpdate['system.traits.value'] = traits
  }
  if (document.name.includes(' (CCC Patched)')) {
    patchUpdate['name'] = document.name.replace(' (CCC Patched)', '')
  }
  await document.update(patchUpdate)
  await lockAllRecentlyUnlockedCompendiums()
}

const patchEverything = async () => {
  console.log(`${MODULE_NAME_SHORT} | Starting to patch documents...`)
  // group by uuid
  const correctionsByUuid = allGeneratedCorrections.reduce((acc, correction) => {
    const { module_uuid: uuid } = correction
    if (!acc[uuid]) acc[uuid] = []
    acc[uuid].push(correction)
    return acc
  }, {})

  for (const corrections of Object.values(correctionsByUuid)) {
    await unlockCompendium(corrections[0])
  }
  const wereUpdated = []
  console.log(`${MODULE_NAME_SHORT} | (Unlocked ${lockedCompendiums.size} compendiums)`)
  for (const corrections of Object.values(correctionsByUuid)) {
    try {
      const patchResult = await patchObjectWithCorrections(corrections)
      if (patchResult === true)
        wereUpdated.push(corrections[0])
    } catch (e) {
      ui.notifications.error(`Error while patching ${corrections[0].name_or_header} (${corrections[0].module_uuid})`)
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
  window.pf2eCccc = { patchEverything, unsetPatchMarkers }
}

Hooks.once('pf2e.systemReady', pf2eSystemReadyHook)
