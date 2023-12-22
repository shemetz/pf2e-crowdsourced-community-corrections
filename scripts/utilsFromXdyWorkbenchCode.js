// copied from https://github.com/xdy/xdy-pf2e-workbench/

export function unflatten (object) {
  const result = {}
  Object.keys(object).forEach(function (k) {
    setValue(result, k, object[k])
  })
  return result
}

export function setValue (object, path, value) {
  const split = path.split('.')
  const top = split.pop()
  split.reduce(function (o, k, i, kk) {
    return (o[k] = o[k] || (isFinite(i + 1 in kk ? kk[i + 1] : top) ? [] : {}))
  }, object)[top] = value
}

function expandObject (obj, _d = 0) {
  const expanded = {}
  if (_d > 10) throw new Error('Maximum depth exceeded')
  for (const [k, v0] of Object.entries(obj)) {
    let v = v0
    if (v instanceof Object && !Array.isArray(v)) v = expandObject(v, _d + 1)
    pf2eSetProperty(expanded, k, v)
  }
  return expanded
}

/** A helper function for merging objects when the target key does not exist in the original */
function _mergeInsert (
  original,
  k,
  v,
  {
    insertKeys,
    insertValues,
    performDeletions,
  } = {},
  _d,
) {
  // Delete a key
  if (k.startsWith('-=') && performDeletions) {
    delete original[k.slice(2)]
    return
  }

  const canInsert = (_d <= 1 && insertKeys) || (_d > 1 && insertValues)
  if (!canInsert) return

  // Recursively create simple objects
  if (v?.constructor === Object) {
    original[k] = pf2eMergeObject({}, v, {
      insertKeys: true,
      inplace: true,
      performDeletions,
    })
    return
  }

  // Insert a key
  original[k] = v
}

/** A helper function for merging objects when the target key exists in the original */
function _mergeUpdate (
  original,
  k,
  v,
  {
    insertKeys,
    insertValues,
    enforceTypes,
    overwrite,
    recursive,
    performDeletions,
  } = {},
  _d,
) {
  const x = original[k]
  const tv = getType(v)
  const tx = getType(x)

  // Recursively merge an inner object
  if (tv === 'Object' && tx === 'Object' && recursive) {
    return pf2eMergeObject(
      x,
      v,
      {
        insertKeys,
        insertValues,
        overwrite,
        enforceTypes,
        performDeletions,
        inplace: true,
      },
      _d,
    )
  }

  // Overwrite an existing value
  if (overwrite) {
    if (tx !== 'undefined' && tv !== tx && enforceTypes) {
      throw new Error(`Mismatched data types encountered during object merge.`)
    }
    original[k] = v
  }
}

function getType (token) {
  const tof = typeof token
  if (typeof token === 'object') {
    if (token === null) return 'null'
    const cn = token.constructor.name
    if (['String', 'Number', 'Boolean', 'Array', 'Set'].includes(cn)) return cn
    else if (/^HTML/.test(cn)) return 'HTMLElement'
    else return 'Object'
  }
  return tof
}

export function pf2eSetProperty (obj, key, value) {
  let target = obj
  let changed = false

  // Convert the key to an object reference if it contains dot notation
  if (key.indexOf('.') !== -1) {
    const parts = key.split('.')
    key = parts.pop() ?? ''
    target = parts.reduce((o, i) => {
      if (!Object.prototype.hasOwnProperty.call(o, i)) o[i] = {}
      return (o)[i]
    }, obj)
  }

  // Update the target
  if (target[key] !== value) {
    changed = true
    target[key] = value
  }

  // Return changed status
  return changed
}

export function pf2eMergeObject (
  original,
  other = {},
  {
    insertKeys = true,
    insertValues = true,
    overwrite = true,
    recursive = true,
    inplace = true,
    enforceTypes = false,
    performDeletions = false,
  } = {},
  _d = 0,
) {
  other = other || {}
  if (!(original instanceof Object) || !(other instanceof Object)) {
    throw new Error('One of original or other are not Objects!')
  }
  const options = { insertKeys, insertValues, overwrite, recursive, inplace, enforceTypes, performDeletions }

  // Special handling at depth 0
  if (_d === 0) {
    if (Object.keys(other).some((k) => /\./.test(k))) other = expandObject(other)
    if (Object.keys(original).some((k) => /\./.test(k))) {
      const expanded = expandObject(original)
      if (inplace) {
        Object.keys(original).forEach((k) => delete (original)[k])
        Object.assign(original, expanded)
      } else original = expanded
    } else if (!inplace) original = foundry.utils.deepClone(original)
  }

  // Iterate over the other object
  for (const k of Object.keys(other)) {
    const v = (other)[k]
    if (Object.hasOwn(original, k)) _mergeUpdate(original, k, v, options, _d + 1)
    else _mergeInsert(original, k, v, options, _d + 1)
  }
  return original
}