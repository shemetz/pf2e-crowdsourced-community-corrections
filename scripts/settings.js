import {
  getAllCorrectionsWithExtraFields,
  patchAllFiltered,
  patchOne,
} from './pf2e-crowdsourced-community-corrections.js'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

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

export const CorrectionsMenu = class extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'corrections-menu-{id}',
    classes: ['application'],
    window: {
      icon: 'fa-solid fa-wrench',
      title: 'Pf2e CCC Configuration',
      frame: true,
      resizable: true,
    },
    position: {
      width: 1400,
      height: 900,
    },
  }

  /** @override */
  static PARTS = {
    form: {
      id: 'corrections-menu',
      template: `modules/${MODULE_ID}/scripts/correctionsMenu.hbs`,
    },
  }

  async _prepareContext (_options) {
    const settingMinConfidence = game.settings.get(MODULE_ID, 'min-confidence')
    const settingMinFixReliability = game.settings.get(MODULE_ID, 'min-fix-reliability')
    const allCorrections = getAllCorrectionsWithExtraFields()
    const enabledCorrectionsCount = allCorrections.filter(c => !c.isFilteredOut).length
    const newCorrectionsCount = allCorrections.filter(c => !c.isFilteredOut && !c.wasApplied).length
    const pf2eSystemVersion = game.system.version
    const latestVerifiedVersion = game.modules.get(MODULE_ID).relationships.systems.first().compatibility.verified
    return {
      settingMinConfidence,
      settingMinFixReliability,
      allCorrections,
      enabledCorrectionsCount,
      newCorrectionsCount,
      pf2eSystemVersion,
      latestVerifiedVersion,
    }
  }

  /** @override */
  _onRender (context, options) {
    super._onRender(context, options)

    const rerender = () => this.render()
    this.element.querySelector('.apply-selected-corrections').addEventListener('click', async () => {
      const enabledCorrectionsCount = getAllCorrectionsWithExtraFields().filter(c => !c.isFilteredOut).length
      return foundry.applications.api.DialogV2.confirm({
        id: 'confirm-apply-corrections',
        window: {
          title: `Activate ${enabledCorrectionsCount} Corrections`,
        },
        content: `
<h2>Are you sure you want to do this?</h2>
<p>This will permanently change compendium data in your world, and cannot be undone except by reinstalling or updating the pf2e system.</p>
`,
        yes: {
          label: 'Yes',
          default: true,
          callback: () => {
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
        },
        no: { label: 'Cancel' },
      })
    })
    this.element.querySelector('.apply-one-correction').addEventListener('click', async (el) => {
      const modulePid = el.currentTarget.dataset.modulePid
      const correction = getAllCorrectionsWithExtraFields().find(c => c.module_pid === modulePid)
      const success = await patchOne(correction)
      if (success) {
        ui.notifications.info(`Done applying correction to ${correction.name_or_header}`)
        rerender()
      }
    })
    this.element.querySelector('#setting-min-confidence').addEventListener('input', async event => {
      await game.settings.set(MODULE_ID, 'min-confidence', parseInt(event.target.value))
      rerender()
    })
    this.element.querySelector('#setting-min-fix-reliability').addEventListener('input', async event => {
      await game.settings.set(MODULE_ID, 'min-fix-reliability', parseInt(event.target.value))
      rerender()
    })
  }

  async _updateObject (event, formData) {
    return Promise.resolve(undefined)
  }
}