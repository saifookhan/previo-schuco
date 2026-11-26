import type { ToolDefinition } from './types'

export const QUOTE_TOOLS: ToolDefinition[] = [
  {
    name: 'search_catalog',
    description:
      'Find product families by words from the user. By default only published families whose prices are valid today are returned. Results include version, brand, and validity so near-duplicate names can be told apart. Never pick one of several matches yourself.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words the user used for the family or product.' },
        includeHidden: {
          type: 'boolean',
          description: 'True only when the user explicitly asks to see drafts or expired price lists.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'describe_family',
    description:
      'Lines and options of one family the user has already chosen. Call this only after a single family id is known. Does not include price-matrix cells.',
    parameters: {
      type: 'object',
      properties: { familyId: { type: 'string', description: 'The family id from search_catalog.' } },
      required: ['familyId'],
    },
  },
  {
    name: 'create_quote',
    description: 'Create a draft quote for a customer. Ask for the customer name when the user has not given one.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        reference: { type: 'string', description: 'Short quote reference. Defaults to the customer name when omitted.' },
        projectLocation: { type: 'string' },
      },
      required: ['customerName'],
    },
  },
  {
    name: 'add_product',
    description:
      'Add a catalog product as a new row. If that family is not on the quote yet, it is added as a new family block with this row. Width and height in millimetres are required. If several families or lines match the names, this does not add anything and returns the choices.',
    parameters: {
      type: 'object',
      properties: {
        familyId: { type: 'string' },
        lineName: { type: 'string', description: 'Product line name, for example MyBox Revo Light profondità 150.' },
        quantity: { type: 'integer' },
        widthMm: { type: 'number' },
        heightMm: { type: 'number' },
      },
      required: ['familyId', 'lineName', 'widthMm', 'heightMm'],
    },
  },
  {
    name: 'duplicate_line',
    description: 'Copy one row on the quote. New position number, same product, size, and commercial columns.',
    parameters: {
      type: 'object',
      properties: { lineName: { type: 'string', description: 'Name or position code of the row to copy.' } },
      required: ['lineName'],
    },
  },
  {
    name: 'duplicate_family',
    description: 'Copy a whole product-family block on the quote, including every row.',
    parameters: {
      type: 'object',
      properties: { familyName: { type: 'string' } },
      required: ['familyName'],
    },
  },
  {
    name: 'move_line',
    description: 'Move a row up or down within its family.',
    parameters: {
      type: 'object',
      properties: {
        lineName: { type: 'string' },
        direction: { type: 'string', enum: ['up', 'down'] },
      },
      required: ['lineName', 'direction'],
    },
  },
  {
    name: 'update_line',
    description:
      'Change columns on one row: widthMm, heightMm, extraPct, discountPct, unitPrice (this makes the row manual), vatRate (22%, 10%, 4%, Es.), installationHours. Net and total are calculated, never set them.',
    parameters: {
      type: 'object',
      properties: {
        lineName: { type: 'string' },
        widthMm: { type: 'number' },
        heightMm: { type: 'number' },
        extraPct: { type: 'number' },
        discountPct: { type: 'number' },
        unitPrice: { type: 'number' },
        vatRate: { type: 'string', enum: ['22%', '10%', '4%', 'Es.'] },
        installationHours: { type: 'number' },
        quantity: { type: 'integer' },
      },
      required: ['lineName'],
    },
  },
]
