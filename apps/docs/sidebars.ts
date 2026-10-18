import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'urls',
    'demo-logins',
    'email-mailpit',
    {
      type: 'category',
      label: 'Features',
      collapsed: false,
      items: [
        'features/product-families',
        'features/sharing',
        'features/quotes',
        'features/users-and-onboarding',
        'features/roles-and-permissions',
        'features/admin-panel',
      ],
    },
    'testing-checklist',
    'known-gaps',
  ],
}

export default sidebars
