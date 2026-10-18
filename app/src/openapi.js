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
    { name: 'Каталог' },
    { name: 'Замовлення' },
    { name: 'Службове' },
  ],
  paths: {
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
        summary: 'Останні замовлення (до 20)',
        responses: {
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
        description: 'Суму рахує сервер за цінами з бази, а не з запиту.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OrderRequest' },
              example: { customer: 'Юрій', items: [{ productId: 1, quantity: 2 }] },
            },
          },
        },
        responses: {
          201: {
            description: 'Замовлення створено',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderCreated' } } },
          },
          400: {
            description: 'Некоректний запит (порожнє ім\'я, немає товарів, невідомий товар)',
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
    schemas: {
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
        required: ['customer', 'items'],
        properties: {
          customer: { type: 'string', example: 'Юрій' },
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
