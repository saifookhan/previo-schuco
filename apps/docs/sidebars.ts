import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'urls',
    'demo-logins',
    'email-mailpit',
    'demo-data',
    {
      type: 'category',
      label: 'Features',
      collapsed: false,
      items: [
        'features/product-families',
        'features/partners',
        'features/sharing',
        'features/quotes',
        'features/users-and-onboarding',
        'features/roles-and-permissions',
        'features/admin-panel',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: false,
      items: ['excel-format', 'pricing', 'api'],
    },
    'testing-checklist',
    'known-gaps',
    'reporting-bugs',
    'release-notes',
  ],
}

export default sidebars
