import type { ToolDefinition } from './types'

const lineRef = { type: 'string', description: 'Row id (l-…), Pos such as "pos 1", "famiglia 2 pos 1", or the product name.' }

export const QUOTE_TOOLS: ToolDefinition[] = [
  {
    name: 'get_quote',
    description: 'Read the open quote: header, rows with ids, text, activities, payments, and totals. Call this before saying what is on the quote.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'catalog_summary',
    description: 'How many current product families and lines exist, and how many are draft or expired.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_catalog',
    description:
      'Find catalog families and lines by a partial or slightly misspelled name, when the user wants to ADD a product. Do not call this to edit, rename, discount, or delete a row that is already on the quote.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        includeHidden: { type: 'boolean', description: 'True only when the user asks to see drafts or expired price lists.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'describe_family',
    description: 'Lines, options, and matrix bounds of one family the user already chose.',
    parameters: {
      type: 'object',
      properties: { familyId: { type: 'string' } },
      required: ['familyId'],
    },
  },
  {
    name: 'create_quote',
    description: 'Create a new draft. Only when the user asks for a new quote. Never use this to change the customer, address, or project site of the open quote.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        reference: { type: 'string' },
        projectLocation: { type: 'string' },
      },
      required: ['customerName'],
    },
  },
  {
    name: 'update_header',
    description:
      'Change the open quote header: customer name, fiscal code, address, city, project site, quote date (ISO), or internal notes. Notes are not printed. Do not create a quote.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        customerFiscalCode: { type: 'string' },
        customerAddress: { type: 'string' },
        customerCity: { type: 'string' },
        projectLocation: { type: 'string' },
        quoteDate: { type: 'string', description: 'ISO date, for example 2026-12-01.' },
        notes: { type: 'string', description: 'Internal note. Not printed.' },
      },
    },
  },
  {
    name: 'add_product',
    description:
      'Add a catalog product as a new row. Width and height must be numbers the user typed. If several line names or families match, this returns chips and adds nothing. Do not invent a familyId.',
    parameters: {
      type: 'object',
      properties: {
        familyId: { type: 'string' },
        lineName: { type: 'string' },
        quantity: { type: 'integer' },
        widthMm: { type: 'number' },
        heightMm: { type: 'number' },
      },
      required: ['lineName', 'widthMm', 'heightMm'],
    },
  },
  {
    name: 'update_line',
    description:
      'Change one row already on the quote: name, quantity, widthMm, heightMm, extraPct, discountPct, unitPrice (positive, needs confirm), vatRate (22%, 10%, 4%, Es.), installationHours, isAlternative, locked. Net and total are calculated.',
    parameters: {
      type: 'object',
      properties: {
        lineName: lineRef,
        name: { type: 'string' },
        widthMm: { type: 'number' },
        heightMm: { type: 'number' },
        extraPct: { type: 'number' },
        discountPct: { type: 'number' },
        unitPrice: { type: 'number' },
        vatRate: { type: 'string', enum: ['22%', '10%', '4%', 'Es.'] },
        installationHours: { type: 'number' },
        quantity: { type: 'integer' },
        isAlternative: { type: 'boolean' },
        locked: { type: 'boolean' },
        confirmToken: { type: 'string' },
      },
      required: ['lineName'],
    },
  },
  {
    name: 'update_lines',
    description: 'Change VAT, discount, extra %, or installation hours on many rows. scope is "all", a family name, or line ids. More than one row needs confirm.',
    parameters: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: '"all", a family name, or a comma-separated list of row ids.' },
        vatRate: { type: 'string', enum: ['22%', '10%', '4%', 'Es.'] },
        discountPct: { type: 'number' },
        extraPct: { type: 'number' },
        installationHours: { type: 'number' },
        confirmToken: { type: 'string' },
      },
      required: ['scope'],
    },
  },
  {
    name: 'set_line_options',
    description: 'Set a catalog option on one row and reprice it. options is a list of {group, option}.',
    parameters: {
      type: 'object',
      properties: {
        lineName: lineRef,
        options: { type: 'array', items: { type: 'object', properties: { group: { type: 'string' }, option: { type: 'string' } } } },
      },
      required: ['lineName', 'options'],
    },
  },
  {
    name: 'remove_line',
    description: 'Remove one row. Requires a confirm token.',
    parameters: { type: 'object', properties: { lineName: lineRef, confirmToken: { type: 'string' } }, required: ['lineName'] },
  },
  {
    name: 'duplicate_line',
    description: 'Copy one row. Pass the row id when several rows match.',
    parameters: { type: 'object', properties: { lineName: lineRef }, required: ['lineName'] },
  },
  {
    name: 'move_line',
    description: 'Move one row up or down inside its family. The Pos number stays on the product.',
    parameters: {
      type: 'object',
      properties: { lineName: lineRef, direction: { type: 'string', enum: ['up', 'down'] } },
      required: ['lineName', 'direction'],
    },
  },
  {
    name: 'duplicate_family',
    description: 'Copy one family block on the quote, including its rows.',
    parameters: { type: 'object', properties: { familyName: { type: 'string' } }, required: ['familyName'] },
  },
  {
    name: 'remove_family',
    description: 'Remove one family block from the quote. Requires a confirm token.',
    parameters: { type: 'object', properties: { familyName: { type: 'string' }, confirmToken: { type: 'string' } }, required: ['familyName'] },
  },
  {
    name: 'move_family',
    description: 'Move a family block up or down on the quote.',
    parameters: {
      type: 'object',
      properties: { familyName: { type: 'string' }, direction: { type: 'string', enum: ['up', 'down'] } },
      required: ['familyName', 'direction'],
    },
  },
  {
    name: 'update_family_block',
    description: 'Change a family block name, description, notes, or alternative flag on the quote. This does not search the catalog.',
    parameters: {
      type: 'object',
      properties: {
        familyName: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        notes: { type: 'string' },
        isAlternative: { type: 'boolean' },
      },
      required: ['familyName'],
    },
  },
  {
    name: 'switch_family_version',
    description: 'Replace an expired or unpublished family block with its current catalog version and reprice. Requires a confirm token.',
    parameters: { type: 'object', properties: { familyName: { type: 'string' }, confirmToken: { type: 'string' } }, required: ['familyName'] },
  },
  {
    name: 'add_text_module',
    description: 'Add a printed text module. place is intro unless the user says closing or chiusura. Do not use this for an internal note or a saved template.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' }, place: { type: 'string', enum: ['intro', 'closing'] } },
      required: ['text'],
    },
  },
  {
    name: 'edit_text_module',
    description: 'Replace the text of one intro or closing module. index starts at 1.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', enum: ['intro', 'closing'] },
        index: { type: 'integer' },
        text: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'remove_text_module',
    description: 'Remove one text module. Requires a confirm token.',
    parameters: {
      type: 'object',
      properties: { place: { type: 'string', enum: ['intro', 'closing'] }, index: { type: 'integer' }, confirmToken: { type: 'string' } },
    },
  },
  {
    name: 'insert_text_template',
    description: 'Insert a saved company text template by its name. Do not type the template name as the module text.',
    parameters: {
      type: 'object',
      properties: { templateName: { type: 'string' }, place: { type: 'string', enum: ['intro', 'closing'] } },
      required: ['templateName'],
    },
  },
  {
    name: 'add_activity',
    description: 'Add one closing activity to Included or Not included. Do not use this to remove an activity, mark a row alternative, or record a payment.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        included: { type: 'boolean' },
        printed: { type: 'boolean' },
      },
      required: ['description'],
    },
  },
  {
    name: 'remove_activity',
    description: 'Remove one closing activity. Requires a confirm token. Do not move it to Not included.',
    parameters: { type: 'object', properties: { description: { type: 'string' }, confirmToken: { type: 'string' } }, required: ['description'] },
  },
  {
    name: 'set_payments',
    description: 'Replace the payment rows. Percentages must sum to 100. This is not an activity.',
    parameters: {
      type: 'object',
      properties: {
        rows: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, pct: { type: 'number' } } } },
      },
      required: ['rows'],
    },
  },
  {
    name: 'set_quote_status',
    description: 'Mark the open version draft, sent, accepted, or rejected. Requires a confirm token. A draft can be sent; a sent version can be accepted or rejected.',
    parameters: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['draft', 'sent', 'accepted', 'rejected'] }, confirmToken: { type: 'string' } },
      required: ['status'],
    },
  },
  {
    name: 'save_new_version',
    description: 'Save the open document as a new draft version and leave the current version as it is.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'restore_revision',
    description: 'Restore a previous save of this version. Requires a confirm token.',
    parameters: {
      type: 'object',
      properties: { revisionNumber: { type: 'integer' }, confirmToken: { type: 'string' } },
      required: ['revisionNumber'],
    },
  },
  {
    name: 'update_print_settings',
    description: 'Show or hide print sections: discount, extra, total, payments, activities, images, family description, line characteristics, summaries, sales contact.',
    parameters: {
      type: 'object',
      properties: {
        showDiscount: { type: 'boolean' },
        showExtraMarkup: { type: 'boolean' },
        showTotal: { type: 'boolean' },
        showPayments: { type: 'boolean' },
        showActivities: { type: 'boolean' },
        showImages: { type: 'boolean' },
        showFamilyDescription: { type: 'boolean' },
        showLineCharacteristics: { type: 'boolean' },
        showFamilySummary: { type: 'boolean' },
        showCategorySummary: { type: 'boolean' },
        showSalesContact: { type: 'boolean' },
      },
    },
  },
  {
    name: 'preview_pdf',
    description: 'Return the print preview link for the open quote. Does not generate a file on the server.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'duplicate_quote',
    description: 'Copy the open quote into a new draft for another customer. Copies the rows. Does not empty the new quote.',
    parameters: { type: 'object', properties: { customerName: { type: 'string' } }, required: ['customerName'] },
  },
]
