import type { ToolDefinition } from './types'

export const QUOTE_TOOLS: ToolDefinition[] = [
  {
    name: 'catalog_summary',
    description:
      'How many product families and product lines the user can quote, plus how many are draft or expired. Call this for "how many products", "what is in the catalog", or before saying you cannot find anything.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_catalog',
    description:
      'Find product families and product lines by words from the user, including a partial or slightly misspelled name. By default only published families whose prices are valid today are returned. Results include version, brand, and validity so near-duplicate names can be told apart. Never pick one of several matches yourself. Call it again after the user says they published or changed a family.',
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
      'Add a catalog product as a new row. If that family is not on the quote yet, it is added as a new family block with this row. Width and height in millimetres are required. quantity is the pieces on this new row, not a change to an existing row. If the same line is in several families, pass the familyId the user picked. If several families or lines match and no familyId is given, this does not add anything and returns the choices.',
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
    description:
      'Copy one row on the quote. New position number, same product, size, and commercial columns. "Duplicate the first one" uses lineName "pos 1". A size such as 1000×300 is not part of the name.',
    parameters: {
      type: 'object',
      properties: { lineName: { type: 'string', description: 'Product name or Pos. "pos 1" and "the first one" are the first row.' } },
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
    description:
      'Reorder one row within its family. "Make the first product the second" is lineName "pos 1" and direction "down": that swaps it with the next row. direction "up" moves it the other way.',
    parameters: {
      type: 'object',
      properties: {
        lineName: { type: 'string', description: 'Product name or Pos. "pos 1" and "the first one" are the first row.' },
        direction: { type: 'string', enum: ['up', 'down'] },
      },
      required: ['lineName', 'direction'],
    },
  },
  {
    name: 'add_text_module',
    description:
      'Add a text module to the quote. This is not a catalog product. "Add a text module, saif testing" uses text "saif testing". place is "intro" unless the user says closing, chiusura, or Riepilogo. Do not search the catalog for a text module.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The words to put in the module. Plain text, not a product name.' },
        place: { type: 'string', enum: ['intro', 'closing'], description: 'intro is the opening. closing is Riepilogo e Chiusura. Default intro.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'add_activity',
    description:
      'Add one closing activity to the quote, in Included or Not included. This is not a catalog product. Call it when the user says activity, attività, or Leistung. Call once per activity. included true means Included (Incluse); false means Not included (Non incluse). The same description is not added twice; a later call moves it between the two lists. printed false hides it from the printed quote.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'The activity text, for example saif testing.' },
        included: {
          type: 'boolean',
          description: 'True for Included, false for Not included. Default true.',
        },
        printed: {
          type: 'boolean',
          description: 'True when the activity is printed on the quote. Default true.',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'update_line',
    description:
      'Change columns on one row, including quantity. lineName is the product name or the Pos column: "pos 1", "posizione 1", and "1" are the row whose Pos is 1. "Change the qty of pos 1 to 500" sets quantity 500 and does not change the price. Other columns: widthMm, heightMm, extraPct, discountPct, unitPrice (this makes the row manual), vatRate (22%, 10%, 4%, Es.), installationHours. Net and total are calculated, never set them.',
    parameters: {
      type: 'object',
      properties: {
        lineName: { type: 'string', description: 'Product name or Pos, for example "pos 1".' },
        widthMm: { type: 'number' },
        heightMm: { type: 'number' },
        extraPct: { type: 'number' },
        discountPct: { type: 'number' },
        unitPrice: { type: 'number' },
        vatRate: { type: 'string', enum: ['22%', '10%', '4%', 'Es.'] },
        installationHours: { type: 'number' },
        quantity: { type: 'integer', description: 'Number of pieces. "qty 500" or "quantità 500" sets this.' },
      },
      required: ['lineName'],
    },
  },
]
