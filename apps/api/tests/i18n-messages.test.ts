import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PERMISSIONS } from '@schuco/contracts'
import { describe, expect, it } from 'vitest'

/**
 * The web app's translation files, checked without running the web app:
 * next-intl treats "." in a key as nesting (an invalid key throws and breaks
 * every page), and a key missing from one locale shows raw key text.
 */

const LOCALES = ['en', 'it', 'de'] as const
type Messages = { [key: string]: string | Messages }

const load = (locale: string): Messages =>
  JSON.parse(readFileSync(join(__dirname, '../../web/messages', `${locale}.json`), 'utf8')) as Messages

const flatten = (messages: Messages, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : flatten(value, `${prefix}${key}.`),
  )

const dottedKeys = (messages: Messages, path = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) => [
    ...(key.includes('.') ? [`${path}${key}`] : []),
    ...(typeof value === 'string' ? [] : dottedKeys(value, `${path}${key}/`)),
  ])

describe('web translation files', () => {
  it.each(LOCALES)('%s has no key containing a dot', (locale) => {
    expect(dottedKeys(load(locale))).toEqual([])
  })

  it('has identical keys in every locale', () => {
    const en = flatten(load('en')).sort()
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      expect(flatten(load(locale)).sort()).toEqual(en)
    }
  })

  it('translates account statuses on the company user list', () => {
    const statuses = ['active', 'inactive', 'pending_approval', 'invited', 'invite_failed'] as const
    for (const locale of LOCALES) {
      const values = (load(locale).settingsUsers as Messages).statusValue as Messages
      for (const status of statuses) {
        expect(typeof values[status]).toBe('string')
        expect(values[status]).not.toBe(status)
      }
    }
    const en = (load('en').settingsUsers as Messages).statusValue as Messages
    expect(en.active).toBe('Active')
    expect(en.inactive).toBe('Inactive')
  })

  it.each(LOCALES)('%s labels every permission in the access-rights matrix', (locale) => {
    const access = load(locale).settingsAccessRights as Messages
    for (const permission of PERMISSIONS) {
      const key = permission.replace('.', '_') // next-intl keys cannot contain dots
      expect(typeof (access.permissionLabels as Messages)[key]).toBe('string')
      expect(typeof (access.permissionHints as Messages)[key]).toBe('string')
    }
  })
})
