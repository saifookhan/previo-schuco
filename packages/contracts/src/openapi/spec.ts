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
  const apiUrl = options.apiUrl || '/'

  return {
    openapi: '3.0.3',
    info: {
      title: 'PREVIO Platform API',
      version: '0.1.0',
      description: [
        'OpenAPI specification for the PREVIO Schuco platform.',
        '',
        'Every path below is served by the host this document was loaded from.',
        'Try it out uses that host (a relative server URL), not a localhost port.',
        '',
        '**Authentication**',
        '- `Authorization: Bearer <session JWT>`',
        '- When `ALLOW_DEV_LOGIN=true`: `X-Dev-User-Sub` of a seeded demo user',
      ].join('\n'),
    },
    servers: [{ url: apiUrl, description: 'This server' }],
    tags: [
      { name: 'Platform', description: 'Health checks and API documentation' },
      { name: 'Auth & RBAC', description: 'Session user profile and tenant context' },
      { name: 'Users', description: 'Tenant-scoped user management (company-admin)' },
      { name: 'Admin', description: 'Cross-tenant platform administration (super-admin)' },
      { name: 'Products', description: 'Product families (the catalog)' },
      { name: 'Quotes', description: 'Sales quotes built from the product-family catalog' },
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
      '/api/users': {
        get: {
          tags: ['Users'],
          summary: 'List company users',
          description: 'Returns users in the authenticated company-admin tenant. Excludes cognitoSub and cross-company fields.',
          operationId: 'listCompanyUsers',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          responses: {
            '200': jsonResponse('Tenant user list', 'UsersListResponse'),
            ...errorResponses(),
          },
        },
      },
      '/api/users/{id}': {
        patch: {
          tags: ['Users'],
          summary: 'Edit a company user',
          description:
            "Company-admin (own company) or super-admin (acting company). Changes the name, roles and active/inactive status; email can't be changed. Every role added or removed must be one the caller can grant. Only a super-admin may edit a super-admin. Nobody can deactivate themselves or remove their own Super Admin / Company Admin role, and the company keeps at least one active Company Admin.",
          operationId: 'updateCompanyUser',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('UpdateUserRequest') } } },
          responses: {
            '200': jsonResponse('The user as saved', 'UpdateUserResponse'),
            '400': { description: 'Invalid fields, unknown role, a self-lockout, or removing the last active Company Admin', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            '403': { description: "The caller can't grant these roles", content: { 'application/json': { schema: ref('ErrorResponse') } } },
            '404': { description: "No such user in the caller's company", content: { 'application/json': { schema: ref('ErrorResponse') } } },
            ...errorResponses(),
          },
        },
      },
      '/api/admin/users': {
        get: {
          tags: ['Admin'],
          summary: 'List all platform users',
          description: 'Cross-tenant user directory for super-admins. Includes cognitoSub, company, and timestamps.',
          operationId: 'listAdminUsers',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          responses: {
            '200': jsonResponse('Platform user list', 'AdminUsersListResponse'),
            ...errorResponses(),
          },
        },
      },
      '/api/audit-log': {
        get: {
          tags: ['Admin'],
          summary: 'Audit log (read-only)',
          description:
            'Newest first, keyset-paged via `nextCursor`. Company admins see their own company; super-admins see every company and may filter with `companyId`. A date-only `to` includes that whole day.',
          operationId: 'listAuditLog',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [
            ...['companyId', 'actorUserId', 'resourceType', 'resourceId', 'requestId', 'from', 'to', 'cursor'].map((name) => ({
              name,
              in: 'query',
              required: false,
              schema: { type: 'string' },
            })),
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
          ],
          responses: {
            '200': jsonResponse('One page of audit entries', 'AuditLogListResponse'),
            '400': { description: 'Invalid filter or cursor', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            ...errorResponses(),
          },
        },
      },
      ...Object.fromEntries(
        (
          [
            ['/api/sales-quotes/{id}/history', 'getQuoteHistory', "A quote's change history — for anyone who can see the quote (quote.view)."],
            [
              '/api/product-families/{id}/history',
              'getProductFamilyHistory',
              "A product family's change history — owning company and super-admin only (403 for a company it was shared with).",
            ],
          ] as const
        ).map(([path, operationId, description]) => [
          path,
          {
            get: {
              tags: ['Audit'],
              summary: 'Record history (read-only)',
              description: `${description} Newest first, paged via \`nextCursor\`.`,
              operationId,
              security: [{ bearerAuth: [] }, { devUserSub: [] }],
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
                { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
              ],
              responses: {
                '200': jsonResponse('One page of history entries', 'AuditLogListResponse'),
                '404': { description: 'No such record, or not visible to the caller', content: { 'application/json': { schema: ref('ErrorResponse') } } },
                ...errorResponses(),
              },
            },
          },
        ]),
      ),
      '/api/product-families/import/preview': {
        post: {
          tags: ['Products'],
          summary: 'Check a product family workbook without saving it',
          description:
            'Parses the uploaded Excel in memory and returns what it holds (family name, counts, warnings). Nothing is written. Needs catalog.edit.',
          operationId: 'previewProductFamilyImport',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } } },
          },
          responses: {
            '200': jsonResponse('What the workbook holds', 'ProductFamilyImportPreview'),
            '400': { description: 'Missing file, or the workbook cannot be imported', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            ...errorResponses(),
          },
        },
      },
      ...Object.fromEntries(
        (
          [
            ['/api/product-families/import', 'importProductFamily', 'Imports the workbook as a new product family.'],
            [
              '/api/product-families/{id}/new-version',
              'createProductFamilyVersion',
              'Imports the workbook as the next version of this family. The older version keeps its own dates.',
            ],
          ] as const
        ).map(([path, operationId, description]) => [
          path,
          {
            post: {
              tags: ['Products'],
              summary: 'Save an uploaded product family workbook',
              description: `${description} Needs catalog.edit. Send the same file the preview checked, plus the fields the user confirmed.`,
              operationId,
              security: [{ bearerAuth: [] }, { devUserSub: [] }],
              ...(path.includes('{id}')
                ? { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] }
                : {}),
              requestBody: {
                required: true,
                content: { 'multipart/form-data': { schema: ref('ProductFamilyImportForm') } },
              },
              responses: {
                '201': { description: 'Created; body is `{ family }`' },
                '400': { description: 'Invalid fields, or the workbook cannot be imported', content: { 'application/json': { schema: ref('ErrorResponse') } } },
                ...errorResponses(),
              },
            },
          },
        ]),
      ),
      '/api/product-families/{id}/duplicate': {
        post: {
          tags: ['Products'],
          summary: 'Copy a product family',
          description:
            'Deep-copies the family (lines, characteristics, price tables, relations, images) under the name, price validity and publish choice the user confirmed. Needs catalog.edit on the owning company.',
          operationId: 'duplicateProductFamily',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('DuplicateProductFamilyRequest') } } },
          responses: {
            '201': { description: 'Created; body is `{ family }`' },
            '400': { description: 'Invalid fields', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            '404': { description: 'No such family, or not visible to the caller', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            ...errorResponses(),
          },
        },
      },
      '/api/product-families/{id}/price-validity': {
        put: {
          tags: ['Products'],
          summary: "Change the days a family's prices can be used on new quote positions",
          description: 'Owning company (catalog.edit) or super-admin. Existing quote positions are not affected.',
          operationId: 'setProductFamilyPriceValidity',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('PriceValidity') } } },
          responses: {
            '200': jsonResponse('The saved dates', 'PriceValidity'),
            '400': { description: 'Invalid dates', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            '404': { description: 'No such family, or not owned by the caller', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            ...errorResponses(),
          },
        },
      },
      '/api/product-families': {
        get: {
          tags: ['Products'],
          summary: 'List product families visible to the caller',
          description: "The caller's own families, plus published families shared with them. Needs catalog.view. Same payload the /app/product-families page loads.",
          operationId: 'listProductFamilies',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          responses: {
            '200': {
              description: 'Product families',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['families'],
                    properties: { families: { type: 'array', items: { type: 'object' } } },
                  },
                },
              },
            },
            ...errorResponses(),
          },
        },
      },
      '/api/product-families/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Product family detail',
          description: 'Lines, characteristics, matrices, relations and images. An id that is not a UUID is 404, the same as an unknown id.',
          operationId: 'getProductFamily',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Family detail' },
            '404': { description: 'No such family, or the id is not a UUID', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            ...errorResponses(),
          },
        },
      },
      '/api/product-families/{id}/shares': {
        get: {
          tags: ['Products'],
          summary: 'Companies this family is shared with',
          description: 'Owning company (catalog.share). This is the path the app calls — there is no separate shares collection.',
          operationId: 'getProductFamilyShares',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': jsonResponse('Current shares and companies that could be added', 'FamilySharesResponse'),
            '404': { description: 'No such family, or not owned by the caller', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            ...errorResponses(),
          },
        },
        put: {
          tags: ['Products'],
          summary: 'Replace the companies this family is shared with',
          operationId: 'updateProductFamilyShares',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('UpdateFamilySharesRequest') } } },
          responses: {
            '200': jsonResponse('Shares after the update', 'FamilySharesResponse'),
            '400': { description: 'Invalid body', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            '404': { description: 'No such family, or not owned by the caller', content: { 'application/json': { schema: ref('ErrorResponse') } } },
            ...errorResponses(),
          },
        },
      },
      '/api/sales-quotes': {
        get: {
          tags: ['Quotes'],
          summary: "List the caller's sales quotes",
          description: 'Catalog-backed quotes (quote.view). There is no /api/quotes collection.',
          operationId: 'listSalesQuotes',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          responses: {
            '200': {
              description: 'Sales quotes',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['quotes'],
                    properties: { quotes: { type: 'array', items: { type: 'object' } } },
                  },
                },
              },
            },
            ...errorResponses(),
          },
        },
      },
      '/api/sales-quotes/{id}': {
        get: {
          tags: ['Quotes'],
          summary: 'Sales quote detail',
          operationId: 'getSalesQuote',
          security: [{ bearerAuth: [] }, { devUserSub: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Quote and its positions' },
            '404': { description: 'No such quote, or the id is not a UUID', content: { 'application/json': { schema: ref('ErrorResponse') } } },
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
          description: 'Session JWT minted by the web app',
        },
        devUserSub: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Dev-User-Sub',
          description: 'Only when ALLOW_DEV_LOGIN=true — sub of a seeded demo user',
        },
      },
      schemas: {
        FamilySharesResponse: {
          type: 'object',
          required: ['shares', 'targets'],
          properties: {
            shares: {
              type: 'array',
              items: {
                type: 'object',
                required: ['companyId', 'companyName', 'discountPct'],
                properties: {
                  companyId: { type: 'string', format: 'uuid' },
                  companyName: { type: 'string' },
                  discountPct: { type: 'number' },
                },
              },
            },
            targets: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'name'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        UpdateFamilySharesRequest: {
          type: 'object',
          required: ['shares'],
          properties: {
            shares: {
              type: 'array',
              items: {
                type: 'object',
                required: ['companyId', 'discountPct'],
                properties: {
                  companyId: { type: 'string', format: 'uuid' },
                  discountPct: { type: 'number', minimum: 0, maximum: 100 },
                },
              },
            },
          },
        },
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
            cognitoSub: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email' },
            name: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['pending_approval', 'invited', 'invite_failed', 'active', 'inactive'] },
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
                capabilities: {
                  type: 'object',
                  properties: {
                    platform: { type: 'boolean' },
                    manufacturer: { type: 'boolean' },
                    supplier: { type: 'boolean' },
                    client: { type: 'boolean' },
                  },
                },
                vatNumber: { type: 'string' },
              },
            },
            businessUnits: {
              type: 'array',
              items: { $ref: '#/components/schemas/BusinessUnitScope' },
            },
            permissions: {
              type: 'array',
              description: 'Effective permissions (saved role matrix intersected with company capabilities).',
              items: { type: 'string' },
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
        UserDto: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['pending_approval', 'invited', 'invite_failed', 'active', 'inactive'] },
            role: {
              type: 'object',
              properties: {
                id: { type: 'string', enum: ['super-admin', 'company-admin', 'super-user', 'user'] },
                name: { type: 'string' },
              },
            },
            businessUnits: {
              type: 'array',
              items: { $ref: '#/components/schemas/BusinessUnitScope' },
            },
          },
        },
        UpdateUserResponse: {
          type: 'object',
          required: ['user'],
          properties: { user: { $ref: '#/components/schemas/UserDto' } },
        },
        UpdateUserRequest: {
          type: 'object',
          required: ['name', 'roleIds'],
          properties: {
            name: { type: 'string', maxLength: 200, description: 'Blank clears the name' },
            roleIds: { type: 'array', minItems: 1, items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'inactive'], description: 'Only for users who have accepted their invite' },
          },
        },
        AdminUserDto: {
          allOf: [
            { $ref: '#/components/schemas/UserDto' },
            {
              type: 'object',
              properties: {
                cognitoSub: { type: 'string', nullable: true },
                company: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    capabilities: {
                  type: 'object',
                  properties: {
                    platform: { type: 'boolean' },
                    manufacturer: { type: 'boolean' },
                    supplier: { type: 'boolean' },
                    client: { type: 'boolean' },
                  },
                },
                  },
                },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        UsersListResponse: {
          type: 'object',
          properties: {
            users: { type: 'array', items: { $ref: '#/components/schemas/UserDto' } },
          },
          required: ['users'],
        },
        AdminUsersListResponse: {
          type: 'object',
          properties: {
            users: { type: 'array', items: { $ref: '#/components/schemas/AdminUserDto' } },
          },
          required: ['users'],
        },
        AuditLogEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            action: { type: 'string', example: 'quote.add_position' },
            resourceType: { type: 'string', example: 'quote' },
            resourceId: { type: 'string', nullable: true },
            metadata: { type: 'object', nullable: true },
            requestId: { type: 'string', nullable: true },
            jobId: { type: 'string', nullable: true },
            actorType: { type: 'string', enum: ['user', 'system'] },
            actor: {
              type: 'object',
              nullable: true,
              properties: { id: { type: 'string' }, name: { type: 'string', nullable: true }, email: { type: 'string', nullable: true } },
            },
            actorCompany: {
              type: 'object',
              nullable: true,
              properties: { id: { type: 'string' }, name: { type: 'string', nullable: true } },
            },
            company: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string', nullable: true } } },
          },
          required: ['id', 'createdAt', 'action', 'resourceType', 'actorType', 'company'],
        },
        AuditLogListResponse: {
          type: 'object',
          properties: {
            entries: { type: 'array', items: { $ref: '#/components/schemas/AuditLogEntry' } },
            nextCursor: { type: 'string', nullable: true },
          },
          required: ['entries', 'nextCursor'],
        },
        PriceValidity: {
          type: 'object',
          description: 'Both days inclusive, in Italian time (Europe/Rome). A null `priceValidTo` means until further notice.',
          properties: {
            priceValidFrom: { type: 'string', format: 'date' },
            priceValidTo: { type: 'string', format: 'date', nullable: true },
          },
          required: ['priceValidFrom', 'priceValidTo'],
        },
        DuplicateProductFamilyRequest: {
          type: 'object',
          required: ['name', 'priceValidFrom', 'priceValidTo', 'publish'],
          properties: {
            name: { type: 'string', maxLength: 200 },
            priceValidFrom: { type: 'string', format: 'date' },
            priceValidTo: { type: 'string', format: 'date', nullable: true, description: 'Null means until further notice' },
            publish: { type: 'boolean', description: 'Publish the copy right away instead of saving a draft' },
          },
        },
        ProductFamilyImportForm: {
          type: 'object',
          required: ['file', 'priceValidFrom'],
          properties: {
            file: { type: 'string', format: 'binary' },
            name: { type: 'string', description: "Overrides the workbook's family name; blank keeps it" },
            priceValidFrom: { type: 'string', format: 'date' },
            priceValidTo: { type: 'string', format: 'date', description: 'Blank = until further notice' },
            publish: { type: 'string', enum: ['true', 'false'], description: 'Publish right away (default false: saved as a draft)' },
          },
        },
        ProductFamilyImportPreview: {
          type: 'object',
          properties: {
            fileName: { type: 'string' },
            family: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                technicalName: { type: 'string', nullable: true },
                category: { type: 'string', nullable: true },
                brand: { type: 'string', nullable: true },
              },
            },
            counts: {
              type: 'object',
              properties: Object.fromEntries(
                ['productLines', 'characteristics', 'options', 'priceTables', 'relations', 'images'].map((key) => [key, { type: 'integer' }]),
              ),
            },
            warnings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', enum: ['relationUnknownLine', 'relationUnknownCharacteristic', 'duplicateLineName', 'duplicateCharacteristicName'] },
                  productLine: { type: 'string' },
                  characteristic: { type: 'string' },
                },
                required: ['code'],
              },
            },
          },
          required: ['fileName', 'family', 'counts', 'warnings'],
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
