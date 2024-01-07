import {
  getAllCorrectionsWithExtraFields,
  patchAllFiltered,
  patchOne,
} from './pf2e-crowdsourced-community-corrections.js'

export const MODULE_ID = 'pf2e-crowdsourced-community-corrections'
export const MODULE_NAME_SHORT = 'Pf2e CCC'
export const registerSettings = function () {
  game.settings.registerMenu(MODULE_ID, 'corrections-menu', {
    name: 'Corrections Menu',
    label: 'Open Corrections Menu',
    hint: 'Configure and apply the corrections.  This is an EXPERIMENTAL MODULE!  Take backups or be prepared to reinstall the system it if goes wrong.',
    icon: 'fas fa-wrench',
    type: CorrectionsMenu,
    restricted: true,
  })
  game.settings.register(MODULE_ID, 'min-confidence', {
    name: '_',
    hint: '_',
    scope: 'world',
    config: false,  // appears in the corrections menu
    default: 3,
    type: Number,
  })
  game.settings.register(MODULE_ID, 'min-fix-reliability', {
    name: '_',
    hint: '_',
    scope: 'world',
    config: false,  // appears in the corrections menu
    default: 3,
    type: Number,
  })
  game.settings.register(MODULE_ID, 'patch-history', {
    name: '_',
    hint: '_',
    scope: 'world',
    config: false,  // used internally
    default: [],
    type: Object,
  })
}

export const CorrectionsMenu = class extends FormApplication {
  static get defaultOptions () {
    return {
      ...super.defaultOptions,
      title: 'Pf2e CCC Configuration',
      id: 'corrections-menu',
      template: `modules/${MODULE_ID}/templates/correctionsMenu.hbs`,
      height: 900,
      width: 1400,
      resizable: true,
    }
  }

  getData (_options) {
    const settingMinConfidence = game.settings.get(MODULE_ID, 'min-confidence')
    const settingMinFixReliability = game.settings.get(MODULE_ID, 'min-fix-reliability')
    const allCorrections = getAllCorrectionsWithExtraFields()
    const enabledCorrectionsCount = allCorrections.filter(c => !c.isFilteredOut).length
    const newCorrectionsCount = allCorrections.filter(c => !c.isFilteredOut && !c.wasApplied).length
    return {
      settingMinConfidence,
      settingMinFixReliability,
      allCorrections,
      enabledCorrectionsCount,
      newCorrectionsCount,
    }
  }

  activateListeners (_html) {
    const rerender = () => this.render()
    this.element.find('.apply-selected-corrections').on('click', async () => {
      const enabledCorrectionsCount = getAllCorrectionsWithExtraFields().filter(c => !c.isFilteredOut).length
      return Dialog.confirm({
        title: `Activate ${enabledCorrectionsCount} Corrections`,
        content: `
<h2>Are you sure you want to do this?</h2>
<p>This will permanently change compendium data in your world, and cannot be undone except by reinstalling or updating the pf2e system.</p>
`,
        yes: () => {
          const extra = enabledCorrectionsCount > 10 ? '  (This may take a while)' : ''
          const startNotificationId = ui.notifications.info(
            `Applying all ${enabledCorrectionsCount} enabled corrections...${extra}`,
            { permanent: true })
          patchAllFiltered().then((documentsUpdated) => {
            ui.notifications.info(`Done applying corrections.  ${documentsUpdated.length} documents were updated.`,
              { permanent: true })
            rerender()
          }).finally(() => {
            ui.notifications.remove(startNotificationId)
          })
        },
      })
    })
    this.element.find('.apply-one-correction').on('click', async (el) => {
      const modulePid = el.currentTarget.dataset.modulePid
      const correction = getAllCorrectionsWithExtraFields().find(c => c.module_pid === modulePid)
      const success = await patchOne(correction)
      if (success) {
        ui.notifications.info(`Done applying correction to ${correction.name_or_header}`)
        rerender()
      }
    })
    this.element.find('#setting-min-confidence').on('input', async event => {
      await game.settings.set(MODULE_ID, 'min-confidence', parseInt(event.target.value))
      rerender()
    })
    this.element.find('#setting-min-fix-reliability').on('input', async event => {
      await game.settings.set(MODULE_ID, 'min-fix-reliability', parseInt(event.target.value))
      rerender()
    })
  }

  async _updateObject (event, formData) {
    return Promise.resolve(undefined)
  }
}