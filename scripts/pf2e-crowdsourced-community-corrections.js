import { allGeneratedCorrections } from './generatedCorrections.js'
import { CorrectionsMenu, MODULE_ID, MODULE_NAME_SHORT, registerSettings } from './settings.js'

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
  const patchUpdate = {}
  const traits = originalDocData.system.traits?.value?.slice()  // .slice() = create copy
  for (const patch of patches) {
    const {
      module_action: action,
      module_field_key: fieldKey,
      module_pattern: pattern,
      module_value: value,
      module_pid: patch_id,
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
      case 'HARDCODED_HANDLING':
        switch (patch_id) {
          default:
            return errorNotification(`Unknown hardcoded patch ID: ${patch_id}`)
        }
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
  console.debug(`${MODULE_NAME_SHORT} | ${name} | Applying document with UUID ${uuid}...`, patchUpdate)
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

export const getAllCorrectionsWithExtraFields = () => {
  const settingMinConfidence = game.settings.get(MODULE_ID, 'min-confidence')
  const settingMinFixReliability = game.settings.get(MODULE_ID, 'min-fix-reliability')
  const patchHistory = game.settings.get(MODULE_ID, 'patch-history')
  return allGeneratedCorrections.map(
    c => ({
      ...c,
      compendiumLinkHtml: getCompendiumLinkHtml(c),
      isFilteredOut: c.confidence < settingMinConfidence || c.fix_reliability < settingMinFixReliability,
      wasApplied: patchHistory.some(p => p.pid === c.module_pid),
      isExtra: c.name_or_header.includes('_extra_'),
    }),
  )
}

const getCompendiumLinkHtml = (correction) => {
  const dataUuid = correction.module_uuid
  const dataId = correction.module_uuid.split('.').pop()
  const dataPack = correction.module_uuid.split('.')[1]
  const text = correction.name_or_header.length <= 40
    ? correction.name_or_header
    : (correction.name_or_header.substring(0, 40) + '...')
  return `
      <a class="content-link" data-pack="${dataPack}" data-uuid="${dataUuid}" data-id="${dataId}"><i class="fas fa-suitcase"></i>${text}</a>
    `
}

export const patchEverything = async () => {
  console.log(`${MODULE_NAME_SHORT} | Starting to patch documents...`)
  // group by uuid
  const correctionsByUuid = getAllCorrectionsWithExtraFields().reduce((acc, correction) => {
    if (correction.isFilteredOut) return acc
    const { module_uuid: uuid } = correction
    if (!acc[uuid]) acc[uuid] = []
    acc[uuid].push(correction)
    return acc
  }, {})

  for (const corrections of Object.values(correctionsByUuid)) {
    await unlockCompendium(corrections[0])
  }
  const wereUpdated = []
  let hadErrors = false
  console.log(`${MODULE_NAME_SHORT} | (Unlocked ${lockedCompendiums.size} compendiums)`)
  const appliedPatches = []
  for (const corrections of Object.values(correctionsByUuid)) {
    try {
      const patchResult = await patchObjectWithCorrections(corrections)
      if (patchResult === true) {
        wereUpdated.push(corrections[0])
        for (const correction of corrections) {
          console.log(`${MODULE_NAME_SHORT} | Applied: ${correction.module_pid}`)
          appliedPatches.push({
            pid: correction.module_pid,
            uuid: correction.module_uuid,
            timestamp: Date.now(),
            module_version: game.modules.get(MODULE_ID).version,
          })
        }
      }
    } catch (e) {
      ui.notifications.error(`Error while patching ${corrections[0].name_or_header} (${corrections[0].module_uuid})`)
      console.error(e)
      hadErrors = true
    }
  }
  if (wereUpdated.length > 0) {
    console.log(`${MODULE_NAME_SHORT} | Done patching documents:`, wereUpdated.map(c => c.name_or_header))
    if (hadErrors)
      console.warn(`${MODULE_NAME_SHORT} | Had errors while patching documents!`)
    const allAppliedPatches = game.settings.get(MODULE_ID, 'patch-history')
    allAppliedPatches.push(...appliedPatches)
    console.log(`${MODULE_NAME_SHORT} | Applied ${appliedPatches.length} new patches`)
    await game.settings.set(MODULE_ID, 'patch-history', allAppliedPatches)
  } else if (hadErrors)
    console.warn(`${MODULE_NAME_SHORT} | No documents patched, but had errors`)
  else
    console.log(`${MODULE_NAME_SHORT} | No documents patched (all good)`)
  await lockAllRecentlyUnlockedCompendiums()
  return wereUpdated
}

export const patchOne = async (correction) => {
  await unlockCompendium(correction)
  if (lockedCompendiums.size > 0) console.log(`${MODULE_NAME_SHORT} | (Unlocked ${lockedCompendiums.size} compendiums)`)
  let success = null
  try {
    const patchResult = await patchObjectWithCorrections([correction])
    if (patchResult === true) {
      console.log(`${MODULE_NAME_SHORT} | Applied: ${correction.module_pid}`)
      const allAppliedPatches = game.settings.get(MODULE_ID, 'patch-history')
      allAppliedPatches.push({ pid: correction.module_pid, uuid: correction.module_uuid, timestamp: Date.now() })
      await game.settings.set(MODULE_ID, 'patch-history', allAppliedPatches)
      success = true
    }
  } catch (e) {
    success = false
    ui.notifications.error(`Error while patching ${correction.name_or_header} (${correction.module_uuid})`)
    console.error(e)
  }
  await lockAllRecentlyUnlockedCompendiums()
  return success
}

const pf2eSystemReadyHook = async () => {
  if (!game.user.isGM) return // only GMs have the permissions (and need) to do all this
  window.pf2eCccc = { patchEverything, unsetPatchMarkers, CorrectionsMenu }
  const numOfCorrections = Object.keys(allGeneratedCorrections).length
  console.log(`${MODULE_NAME_SHORT} | Initializing, with ${numOfCorrections} error corrections in json file`)
  // if compendiums were reset (e.g. after system update) - reset stored patch history
  const patchHistory = game.settings.get(MODULE_ID, 'patch-history')
  const firstPatch = patchHistory?.[0]
  if (firstPatch && firstPatch.uuid.includes('Compendium.')) {
    const document = await fromUuid(firstPatch.uuid)
    if (document?.flags[MODULE_ID]?.['patched'] !== true) {
      console.log(`${MODULE_NAME_SHORT} | Compendiums were reverted, resetting patch history`)
      const newPatchHistory = patchHistory.filter(p => !p.uuid.includes('Compendium.'))
      await game.settings.set(MODULE_ID, 'patch-history', newPatchHistory)
      ui.notifications.info(`${MODULE_NAME_SHORT} | Compendiums were reverted, you'll need to reapply patches`)
    }
  }
}

Hooks.once('init', registerSettings)
Hooks.once('pf2e.systemReady', pf2eSystemReadyHook)
