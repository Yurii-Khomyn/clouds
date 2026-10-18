// Опис API у форматі OpenAPI 3. Swagger UI (/docs) будує з нього інтерактивну сторінку.
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Все для дому: API',
    version: '1.0.0',
    description: 'REST API невеликого магазину: каталог товарів і замовлення.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Автентифікація' },
    { name: 'Каталог' },
    { name: 'Замовлення' },
    { name: 'Службове' },
  ],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Автентифікація'],
        summary: 'Реєстрація',
        description: 'Створює користувача й одразу повертає JWT-токен (діє 1 годину).',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } } },
        responses: {
          201: { description: 'Користувача створено', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { description: 'Некоректні дані', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'Такий email уже зареєстровано', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Автентифікація'],
        summary: 'Вхід',
        description: 'Повертає JWT-токен. Його треба передавати в заголовку Authorization: Bearer <токен>.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: 'Успішний вхід', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Хибний email або пароль', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/products': {
      get: {
        tags: ['Каталог'],
        summary: 'Список товарів',
        responses: {
          200: {
            description: 'Каталог товарів із бази',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
              },
            },
          },
        },
      },
    },
    '/orders': {
      get: {
        tags: ['Замовлення'],
        summary: 'Мої замовлення (до 20)',
        description: 'Лише замовлення поточного користувача. Потрібен токен.',
        security: [{ bearerAuth: [] }],
        responses: {
          401: { description: 'Немає токена або він недійсний', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          200: {
            description: 'Список замовлень, найновіші першими',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Замовлення'],
        summary: 'Створити замовлення',
        description: 'Потрібен токен. Ім\'я покупця береться з токена, суму рахує сервер за цінами з бази.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OrderRequest' },
              example: { items: [{ productId: 1, quantity: 2 }] },
            },
          },
        },
        responses: {
          201: {
            description: 'Замовлення створено',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderCreated' } } },
          },
          401: { description: 'Немає токена або він недійсний', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          400: {
            description: 'Некоректний запит (немає товарів, невідомий товар)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          500: {
            description: 'Внутрішня помилка',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Службове'],
        summary: 'Перевірка, що застосунок живий',
        description: 'Її викликає балансувальник. До бази не звертається.',
        responses: {
          200: {
            description: 'Застосунок працює',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Токен із /auth/login або /auth/register' },
    },
    schemas: {
      RegisterRequest: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Юрій' },
          email: { type: 'string', format: 'email', example: 'yurii@example.com' },
          password: { type: 'string', minLength: 8, example: 'щонайменше-8-символів' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
      AuthResponse: {
        type: 'object',
        properties: { token: { type: 'string', description: 'JWT, діє 1 годину' }, name: { type: 'string' } },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Приставний столик' },
          description: { type: 'string', example: 'Біле дерево з акцентними ніжками, діаметр 40 см' },
          image_url: { type: 'string', example: '/img/table.jpg' },
          price_cents: { type: 'integer', description: 'Ціна в копійках', example: 189900 },
        },
      },
      OrderRequest: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['productId', 'quantity'],
              properties: {
                productId: { type: 'integer', example: 1 },
                quantity: { type: 'integer', minimum: 1, example: 2 },
              },
            },
          },
        },
      },
      OrderCreated: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          total_cents: { type: 'integer', example: 379800 },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          customer_name: { type: 'string' },
          total_cents: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { product_id: { type: 'integer' }, quantity: { type: 'integer' } },
            },
          },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string', example: 'unknown product' } },
      },
    },
  },
};
