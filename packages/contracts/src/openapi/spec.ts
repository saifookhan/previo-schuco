export type OpenApiDocument = {
  openapi: '3.0.3'
  info: {
    title: string
    version: string
    description: string
  }
  servers: Array<{ url: string; description: string }>
  tags: Array<{ name: string; description: string }>
  paths: Record<string, unknown>
  components: Record<string, unknown>
}

export type OpenApiOptions = {
  /** Core BFF base URL (apps/api). */
  apiUrl: string
  /** Calculation service base URL (Phase 3, optional). */
  calculationUrl?: string
  /** Files service base URL (Phase 4, optional). */
  filesUrl?: string
}

const ref = (name: string): { $ref: string } => ({ $ref: `#/components/schemas/${name}` })

const jsonResponse = (
  description: string,
  schemaRef: string,
): { description: string; content: { 'application/json': { schema: { $ref: string } } } } => ({
  description,
  content: {
    'application/json': {
      schema: ref(schemaRef),
    },
  },
})

const errorResponses = (): Record<string, unknown> => ({
  '401': {
    description: 'Missing or invalid authentication',
    content: { 'application/json': { schema: ref('ErrorResponse') } },
  },
  '403': {
    description: 'Forbidden — insufficient role or inactive user',
    content: { 'application/json': { schema: ref('ErrorResponse') } },
  },
})

/**
 * Build the PREVIO OpenAPI document covering the core API and planned microservices.
 * @param options - Server URLs for each deployable service
 */
export const buildOpenApiDocument = (options: OpenApiOptions): OpenApiDocument => {
  const calculationUrl = options.calculationUrl ?? 'http://localhost:3002'
  const filesUrl = options.filesUrl ?? 'http://localhost:3003'

  return {
    openapi: '3.0.3',
    info: {
      title: 'PREVIO Platform API',
      version: '0.1.0',
      description: [
        'OpenAPI specification for the PREVIO Schuco platform.',
        '',
        '**Services**',
        '- **Core API (BFF)** — auth, RBAC, quotes orchestration (`apps/api`)',
        '- **Calculation Service** — quote pricing engine (`apps/calculation-service`, Phase 3)',
        '- **Files Service** — S3 uploads, PDF render, import/export (`apps/files-service`, Phase 4)',
        '',
        '**Authentication**',
        '- Production: `Authorization: Bearer <Cognito JWT>`',
        '- Local dev (no Cognito): `X-Dev-User-Sub: <cognito-sub>` from seed users',
      ].join('\n'),
    },
    servers: [
      { url: options.apiUrl, description: 'Core API (BFF)' },
      { url: calculationUrl, description: 'Calculation Service (Phase 3 — planned)' },
      { url: filesUrl, description: 'Files Service (Phase 4 — planned)' },
    ],
    tags: [
      { name: 'Platform', description: 'Health checks and API documentation' },
      { name: 'Auth & RBAC', description: 'Session user profile and tenant context' },
      { name: 'Products', description: 'Product catalog' },
      { name: 'Quotes', description: 'Quote listing, detail, and creation (Core API)' },
      { name: 'Calculation', description: 'Quote pricing — in-process today, HTTP service Phase 3' },
      {
        name: 'Files',
        description: 'Uploads, PDF generation, Excel import/export — Phase 4',
      },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Platform'],
          summary: 'Health check',
          operationId: 'getHealth',
          responses: {
            '200': jsonResponse('Service is healthy', 'HealthResponse'),
          },
        },
      },
      '/openapi.json': {
        get: {
          tags: ['Platform'],
          summary: 'OpenAPI specification (JSON)',
          operationId: 'getOpenApiSpec',
          responses: {
            '200': {
              description: 'OpenAPI 3.0 document',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
      '/docs': {
        get: {
          tags: ['Platform'],
          summary: 'Swagger UI',
          operationId: 'getSwaggerUi',
          responses: {
            '200': { description: 'Interactive Swagger UI (HTML)' },
          },
        },
      },
      '/api/me': {
        get: {
          tags: ['Auth & RBAC'],
          summary: 'Current authenticated user',
          description: 'Returns user profile with role, company, and business unit scopes.',
          operationId: 'getMe',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          responses: {
            '200': jsonResponse('Authenticated user profile', 'MeResponse'),
            ...errorResponses(),
          },
        },
      },
      '/api/products': {
        get: {
          tags: ['Products'],
          summary: 'List product catalog',
          operationId: 'listProducts',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          responses: {
            '200': {
              description: 'Product catalog',
              content: {
                'application/json': {
                  schema: { type: 'array', items: ref('Product') },
                },
              },
            },
            ...errorResponses(),
          },
        },
      },
      '/api/quotes': {
        get: {
          tags: ['Quotes'],
          summary: 'List recent quotes',
          operationId: 'listQuotes',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          responses: {
            '200': {
              description: 'Recent quotes (demo + session)',
              content: {
                'application/json': {
                  schema: { type: 'array', items: ref('Quote') },
                },
              },
            },
            ...errorResponses(),
          },
        },
        post: {
          tags: ['Quotes'],
          summary: 'Create quote',
          description: 'Calculates pricing and stores a session quote (demo — not persisted to RDS).',
          operationId: 'createQuote',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateQuoteRequest') } },
          },
          responses: {
            '200': jsonResponse('Created quote with calculation', 'CreateQuoteResponse'),
            '400': {
              description: 'Validation error',
              content: { 'application/json': { schema: ref('ValidationError') } },
            },
            ...errorResponses(),
          },
        },
      },
      '/api/quotes/{reference}': {
        get: {
          tags: ['Quotes'],
          summary: 'Get quote by reference',
          operationId: 'getQuoteByReference',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [
            {
              name: 'reference',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'PRV-2026-0042',
            },
          ],
          responses: {
            '200': jsonResponse('Quote with product families', 'QuoteDetailResponse'),
            '404': {
              description: 'Quote not found',
              content: { 'application/json': { schema: ref('ErrorResponse') } },
            },
            ...errorResponses(),
          },
        },
      },
      '/api/calculate': {
        post: {
          tags: ['Calculation'],
          summary: 'Calculate quote (Core API)',
          description:
            'Runs pricing in-process via `@schuco/calculation`. Phase 3 will delegate to calculation-service.',
          operationId: 'calculateQuote',
          servers: [{ url: options.apiUrl, description: 'Core API (BFF)' }],
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('QuoteConfiguration') } },
          },
          responses: {
            '200': jsonResponse('Calculation result', 'QuoteResult'),
            '400': {
              description: 'Validation error',
              content: { 'application/json': { schema: ref('ValidationError') } },
            },
            ...errorResponses(),
          },
        },
      },
      '/calculate': {
        post: {
          tags: ['Calculation'],
          summary: 'Calculate quote (Calculation Service)',
          description: 'Phase 3 HTTP service — internal ALB only; not exposed to web clients.',
          operationId: 'calculateQuoteService',
          servers: [{ url: calculationUrl, description: 'Calculation Service' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('QuoteConfiguration') } },
          },
          responses: {
            '200': jsonResponse('Calculation result', 'QuoteResult'),
            '400': {
              description: 'Validation error',
              content: { 'application/json': { schema: ref('ValidationError') } },
            },
          },
        },
      },
      '/validate': {
        post: {
          tags: ['Calculation'],
          summary: 'Validate quote configuration',
          description: 'Phase 3 — returns feasibility errors without full pricing.',
          operationId: 'validateConfiguration',
          servers: [{ url: calculationUrl, description: 'Calculation Service' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('QuoteConfiguration') } },
          },
          responses: {
            '200': jsonResponse('Validation result', 'ValidateConfigurationResponse'),
          },
        },
      },
      '/upload': {
        post: {
          tags: ['Files'],
          summary: 'Initiate file upload',
          description: 'Phase 4 — returns presigned S3 URL for direct upload.',
          operationId: 'initiateUpload',
          servers: [{ url: filesUrl, description: 'Files Service' }],
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UploadRequest') } },
          },
          responses: {
            '200': jsonResponse('Presigned upload URL', 'UploadResponse'),
            ...errorResponses(),
          },
        },
      },
      '/files/{id}': {
        get: {
          tags: ['Files'],
          summary: 'Get file metadata and download URL',
          operationId: 'getFile',
          servers: [{ url: filesUrl, description: 'Files Service' }],
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': jsonResponse('File metadata', 'FileMetadata'),
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: ref('ErrorResponse') } },
            },
            ...errorResponses(),
          },
        },
      },
      '/pdf/render': {
        post: {
          tags: ['Files'],
          summary: 'Render quote PDF',
          description: 'Phase 4 — generates preventivo PDF from quote reference.',
          operationId: 'renderPdf',
          servers: [{ url: filesUrl, description: 'Files Service' }],
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('RenderPdfRequest') } },
          },
          responses: {
            '200': jsonResponse('PDF download URL', 'RenderPdfResponse'),
            ...errorResponses(),
          },
        },
      },
      '/import/excel': {
        post: {
          tags: ['Files'],
          summary: 'Import quotes from Excel',
          description: 'Phase 4 — multipart upload of Excel workbook.',
          operationId: 'importExcel',
          servers: [{ url: filesUrl, description: 'Files Service' }],
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary' },
                  },
                  required: ['file'],
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('Import summary', 'ImportExcelResponse'),
            ...errorResponses(),
          },
        },
      },
      '/export/excel/{reference}': {
        get: {
          tags: ['Files'],
          summary: 'Export quote to Excel',
          operationId: 'exportExcel',
          servers: [{ url: filesUrl, description: 'Files Service' }],
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [
            {
              name: 'reference',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Excel workbook',
              content: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                  schema: { type: 'string', format: 'binary' },
                },
              },
            },
            ...errorResponses(),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'AWS Cognito access token',
        },
        devUserSub: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Dev-User-Sub',
          description: 'Local dev only — Cognito sub from seed users when Cognito is not configured',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { oneOf: [{ type: 'string' }, { type: 'object' }] },
          },
          required: ['error'],
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                formErrors: { type: 'array', items: { type: 'string' } },
                fieldErrors: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
              },
            },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'] },
            service: { type: 'string' },
          },
          required: ['status', 'service'],
        },
        MeResponse: {
          type: 'object',
          properties: { user: { $ref: '#/components/schemas/UserProfile' } },
          required: ['user'],
        },
        UserProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            cognitoSub: { type: 'string' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
            role: {
              type: 'object',
              properties: {
                id: { type: 'string', enum: ['super-admin', 'company-admin', 'super-user', 'user'] },
                name: { type: 'string' },
                description: { type: 'string' },
              },
            },
            company: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                type: { type: 'string', enum: ['platform', 'supplier', 'client'] },
                vatNumber: { type: 'string' },
              },
            },
            businessUnits: {
              type: 'array',
              items: { $ref: '#/components/schemas/BusinessUnitScope' },
            },
          },
        },
        BusinessUnitScope: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            canEdit: { type: 'boolean' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            type: { type: 'string' },
            nameEn: { type: 'string' },
            nameIt: { type: 'string' },
            nameDe: { type: 'string' },
            baseRate: { type: 'number' },
            imageUrl: { type: 'string', nullable: true },
          },
        },
        QuoteConfiguration: {
          type: 'object',
          required: ['productType', 'widthMm', 'heightMm', 'glazing', 'security', 'color', 'quantity'],
          properties: {
            productType: { type: 'string', enum: ['window', 'door', 'sliding', 'folding'] },
            widthMm: { type: 'integer', minimum: 1 },
            heightMm: { type: 'integer', minimum: 1 },
            glazing: { type: 'string', enum: ['double', 'triple', 'acoustic'] },
            security: { type: 'string', enum: ['standard', 'enhanced', 'premium'] },
            color: { type: 'string', enum: ['white', 'anthracite', 'silver', 'wood'] },
            quantity: { type: 'integer', minimum: 1 },
          },
        },
        QuoteLineItem: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            amount: { type: 'number' },
          },
        },
        QuoteResult: {
          type: 'object',
          properties: {
            areaSqM: { type: 'number' },
            lineItems: { type: 'array', items: { $ref: '#/components/schemas/QuoteLineItem' } },
            subtotal: { type: 'number' },
            vatRate: { type: 'number' },
            vatAmount: { type: 'number' },
            total: { type: 'number' },
            currency: { type: 'string', enum: ['EUR'] },
            feasible: { type: 'boolean' },
            feasibilityNotes: { type: 'array', items: { type: 'string' } },
          },
        },
        Quote: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            reference: { type: 'string' },
            customerName: { type: 'string' },
            customerEmail: { type: 'string', nullable: true },
            productType: { type: 'string' },
            widthMm: { type: 'integer' },
            heightMm: { type: 'integer' },
            glazing: { type: 'string' },
            security: { type: 'string' },
            color: { type: 'string' },
            quantity: { type: 'integer' },
            subtotal: { type: 'number' },
            vatAmount: { type: 'number' },
            total: { type: 'number' },
            locale: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ProductFamily: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            quoteReference: { type: 'string' },
            name: { type: 'string' },
            sortOrder: { type: 'integer' },
            total: { type: 'number' },
            isValid: { type: 'boolean' },
            validityNote: { type: 'string', nullable: true },
            isAlternative: { type: 'boolean' },
          },
        },
        CreateQuoteRequest: {
          allOf: [
            { $ref: '#/components/schemas/QuoteConfiguration' },
            {
              type: 'object',
              required: ['customerName'],
              properties: {
                customerName: { type: 'string', minLength: 1 },
                customerEmail: { type: 'string', format: 'email' },
                locale: { type: 'string', enum: ['it', 'en', 'de'], default: 'it' },
              },
            },
          ],
        },
        CreateQuoteResponse: {
          type: 'object',
          properties: {
            quote: { $ref: '#/components/schemas/Quote' },
            calculation: { $ref: '#/components/schemas/QuoteResult' },
          },
        },
        QuoteDetailResponse: {
          type: 'object',
          properties: {
            quote: { $ref: '#/components/schemas/Quote' },
            families: { type: 'array', items: { $ref: '#/components/schemas/ProductFamily' } },
          },
        },
        ValidateConfigurationResponse: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            errors: { type: 'array', items: { type: 'string' } },
          },
        },
        UploadRequest: {
          type: 'object',
          required: ['filename', 'contentType', 'purpose'],
          properties: {
            filename: { type: 'string' },
            contentType: { type: 'string' },
            quoteReference: { type: 'string' },
            purpose: { type: 'string', enum: ['attachment', 'import', 'export'] },
          },
        },
        UploadResponse: {
          type: 'object',
          properties: {
            fileId: { type: 'string', format: 'uuid' },
            uploadUrl: { type: 'string', format: 'uri' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
        FileMetadata: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            filename: { type: 'string' },
            contentType: { type: 'string' },
            sizeBytes: { type: 'integer', minimum: 0 },
            quoteReference: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            downloadUrl: { type: 'string', format: 'uri' },
          },
        },
        RenderPdfRequest: {
          type: 'object',
          required: ['quoteReference'],
          properties: {
            quoteReference: { type: 'string' },
            locale: { type: 'string', enum: ['it', 'en', 'de'], default: 'it' },
            template: { type: 'string', enum: ['standard', 'branded'], default: 'standard' },
          },
        },
        RenderPdfResponse: {
          type: 'object',
          properties: {
            fileId: { type: 'string', format: 'uuid' },
            downloadUrl: { type: 'string', format: 'uri' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
        ImportExcelResponse: {
          type: 'object',
          properties: {
            importedRows: { type: 'integer', minimum: 0 },
            quoteReferences: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  }
}
