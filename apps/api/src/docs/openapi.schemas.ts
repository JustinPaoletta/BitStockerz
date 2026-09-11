import type { OpenAPIObject } from '@nestjs/swagger';

type OpenApiSchemas = NonNullable<
  NonNullable<OpenAPIObject['components']>['schemas']
>;

const stringId = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const decimal = {
  type: 'string',
  description: 'Base-10 decimal serialized as a string to preserve precision.',
  example: '10000.00',
} as const;

export const API_SCHEMAS: OpenApiSchemas = {
  ProblemDetails: {
    type: 'object',
    description: 'RFC 7807 problem details with stable BitStockerz extensions.',
    required: [
      'type',
      'title',
      'status',
      'detail',
      'instance',
      'code',
      'requestId',
    ],
    properties: {
      type: { type: 'string', format: 'uri' },
      title: { type: 'string' },
      status: { type: 'integer', minimum: 400, maximum: 599 },
      detail: { type: 'string' },
      instance: { type: 'string', example: '/api/strategies' },
      code: { type: 'string', example: 'VALIDATION_ERROR' },
      requestId: { type: 'string', format: 'uuid' },
      fieldErrors: {
        type: 'array',
        items: {
          type: 'object',
          required: ['field', 'reason'],
          properties: {
            field: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  },
  LinkedAuthMethods: {
    type: 'object',
    required: ['passkeys', 'google', 'apple'],
    properties: {
      passkeys: { type: 'boolean' },
      google: { type: 'boolean' },
      apple: { type: 'boolean' },
    },
  },
  UserProfile: {
    type: 'object',
    required: [
      'id',
      'email',
      'base_currency',
      'linked_auth_methods',
      'passkey_count',
    ],
    properties: {
      id: stringId,
      email: { type: 'string', format: 'email' },
      display_name: { type: 'string', maxLength: 80 },
      base_currency: { type: 'string', enum: ['USD'] },
      linked_auth_methods: { $ref: '#/components/schemas/LinkedAuthMethods' },
      passkey_count: { type: 'integer', minimum: 0 },
    },
  },
  AuthResponse: {
    type: 'object',
    required: ['access_token', 'token_type', 'user'],
    properties: {
      access_token: {
        type: 'string',
        description: 'Opaque bearer session token.',
      },
      token_type: { type: 'string', enum: ['Bearer'] },
      user: { $ref: '#/components/schemas/UserProfile' },
    },
  },
  WebAuthnRegisterOptions: {
    type: 'object',
    required: [
      'challenge_id',
      'challenge',
      'rp_id',
      'rp_name',
      'timeout_ms',
      'user_email',
      'options',
    ],
    properties: {
      challenge_id: { type: 'string' },
      challenge: { type: 'string' },
      rp_id: { type: 'string' },
      rp_name: { type: 'string' },
      timeout_ms: { type: 'integer', minimum: 1 },
      user_email: { type: 'string', format: 'email' },
      options: { type: 'object', additionalProperties: true },
    },
  },
  WebAuthnLoginOptions: {
    type: 'object',
    required: [
      'challenge_id',
      'challenge',
      'timeout_ms',
      'user_email',
      'allow_credentials',
      'options',
    ],
    properties: {
      challenge_id: { type: 'string' },
      challenge: { type: 'string' },
      timeout_ms: { type: 'integer', minimum: 1 },
      user_email: { type: 'string', format: 'email' },
      allow_credentials: { type: 'array', items: { type: 'string' } },
      options: { type: 'object', additionalProperties: true },
    },
  },
  OAuthStartResponse: {
    type: 'object',
    required: ['provider', 'state', 'authorization_url', 'expires_in_seconds'],
    properties: {
      provider: { type: 'string', enum: ['google', 'apple'] },
      state: { type: 'string' },
      authorization_url: { type: 'string', format: 'uri' },
      expires_in_seconds: { type: 'integer', minimum: 1 },
    },
  },
  LogoutResponse: {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'string', enum: ['ok'] } },
  },
  Symbol: {
    type: 'object',
    required: ['id', 'symbol', 'name', 'asset_type', 'currency', 'is_active'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      symbol: { type: 'string', example: 'AAPL' },
      name: { type: 'string', example: 'Apple Inc.' },
      asset_type: { type: 'string', enum: ['EQUITY', 'CRYPTO'] },
      exchange: { type: 'string', example: 'NASDAQ' },
      currency: { type: 'string', example: 'USD' },
      base_asset: { type: 'string', example: 'BTC' },
      quote_asset: { type: 'string', example: 'USD' },
      is_active: { type: 'boolean' },
    },
  },
  DailyCandle: {
    type: 'object',
    required: ['date', 'open', 'high', 'low', 'close', 'volume'],
    properties: {
      date: { type: 'string', format: 'date', example: '2026-07-31' },
      open: { type: 'number' },
      high: { type: 'number' },
      low: { type: 'number' },
      close: { type: 'number' },
      volume: { type: 'number' },
    },
  },
  HourlyCandle: {
    type: 'object',
    required: ['timestamp', 'open', 'high', 'low', 'close', 'volume'],
    properties: {
      timestamp,
      open: { type: 'number' },
      high: { type: 'number' },
      low: { type: 'number' },
      close: { type: 'number' },
      volume: { type: 'number' },
    },
  },
  SanitySummary: {
    type: 'object',
    required: ['checked', 'invalid', 'issues'],
    properties: {
      checked: { type: 'integer', minimum: 0 },
      invalid: { type: 'integer', minimum: 0 },
      issues: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
      },
    },
  },
  MarketDataHealth: {
    type: 'object',
    required: ['status', 'timestamp', 'series', 'sanity', 'source', 'provider'],
    properties: {
      status: { type: 'string', enum: ['ok', 'degraded', 'unhealthy'] },
      timestamp,
      series: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'asset_type',
            'interval',
            'latest_timestamp',
            'age_ms',
            'stale',
            'stale_after_ms',
            'symbol_count_with_data',
          ],
          properties: {
            asset_type: { type: 'string', enum: ['EQUITY', 'CRYPTO'] },
            interval: { type: 'string', enum: ['1d', '1h'] },
            latest_timestamp: { ...timestamp, nullable: true },
            age_ms: { type: 'integer', minimum: 0, nullable: true },
            stale: { type: 'boolean' },
            stale_after_ms: { type: 'integer', minimum: 1 },
            symbol_count_with_data: { type: 'integer', minimum: 0 },
          },
        },
      },
      sanity: { $ref: '#/components/schemas/SanitySummary' },
      source: { type: 'string', enum: ['seed', 'database'] },
      provider: {
        type: 'object',
        required: [
          'configured',
          'last_success_at',
          'circuit',
          'last_error_code',
        ],
        properties: {
          configured: { type: 'string' },
          last_success_at: { ...timestamp, nullable: true },
          circuit: {
            type: 'string',
            enum: ['closed', 'open', 'half_open'],
          },
          last_error_code: { type: 'string', nullable: true },
        },
      },
    },
  },
  DurationStats: {
    type: 'object',
    required: ['count', 'avg', 'p95', 'max'],
    properties: {
      count: { type: 'integer', minimum: 0 },
      avg: { type: 'number', minimum: 0 },
      p95: { type: 'number', minimum: 0 },
      max: { type: 'number', minimum: 0 },
    },
  },
  MetricsSnapshot: {
    type: 'object',
    required: [
      'timestamp',
      'http',
      'jobs',
      'backtests',
      'cache',
      'errors_by_domain',
    ],
    properties: {
      timestamp,
      http: {
        type: 'object',
        required: ['request_count', 'error_count', 'duration_ms'],
        properties: {
          request_count: { type: 'integer', minimum: 0 },
          error_count: { type: 'integer', minimum: 0 },
          duration_ms: { $ref: '#/components/schemas/DurationStats' },
        },
      },
      jobs: {
        type: 'object',
        required: ['by_type'],
        properties: {
          by_type: { type: 'object', additionalProperties: { type: 'object' } },
        },
      },
      backtests: { type: 'object', additionalProperties: true },
      cache: {
        type: 'object',
        required: ['symbols', 'candles'],
        properties: {
          symbols: {
            type: 'object',
            required: ['hit', 'miss', 'load_error', 'eviction'],
            properties: {
              hit: { type: 'integer', minimum: 0 },
              miss: { type: 'integer', minimum: 0 },
              load_error: { type: 'integer', minimum: 0 },
              eviction: { type: 'integer', minimum: 0 },
            },
          },
          candles: {
            type: 'object',
            required: ['hit', 'miss', 'load_error', 'eviction'],
            properties: {
              hit: { type: 'integer', minimum: 0 },
              miss: { type: 'integer', minimum: 0 },
              load_error: { type: 'integer', minimum: 0 },
              eviction: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
      errors_by_domain: {
        type: 'object',
        additionalProperties: { type: 'integer', minimum: 0 },
      },
    },
  },
  IndicatorCatalog: {
    type: 'object',
    required: ['indicators'],
    properties: {
      indicators: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'key',
            'display_name',
            'description',
            'params',
            'sources',
            'default_source',
          ],
          properties: {
            key: { type: 'string', enum: ['SMA', 'EMA', 'RSI'] },
            display_name: { type: 'string' },
            description: { type: 'string' },
            params: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'type', 'min', 'max', 'default'],
                properties: {
                  name: { type: 'string', enum: ['period'] },
                  type: { type: 'string', enum: ['integer'] },
                  min: { type: 'integer' },
                  max: { type: 'integer' },
                  default: { type: 'integer' },
                },
              },
            },
            sources: {
              type: 'array',
              items: { type: 'string', enum: ['open', 'high', 'low', 'close'] },
            },
            default_source: {
              type: 'string',
              enum: ['open', 'high', 'low', 'close'],
            },
          },
        },
      },
    },
  },
  StrategyOperand: {
    oneOf: [
      {
        type: 'object',
        required: ['indicator'],
        additionalProperties: false,
        properties: { indicator: { type: 'string' } },
      },
      {
        type: 'object',
        required: ['price'],
        additionalProperties: false,
        properties: {
          price: { type: 'string', enum: ['open', 'high', 'low', 'close'] },
        },
      },
      {
        type: 'object',
        required: ['literal'],
        additionalProperties: false,
        properties: { literal: { type: 'number' } },
      },
    ],
  },
  StrategyDefinition: {
    type: 'object',
    required: ['indicators', 'entry', 'exit', 'risk'],
    additionalProperties: false,
    properties: {
      indicators: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          required: ['id', 'type', 'params', 'source'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 64 },
            type: { type: 'string', enum: ['SMA', 'EMA', 'RSI'] },
            params: {
              type: 'object',
              required: ['period'],
              additionalProperties: false,
              properties: {
                period: { type: 'integer', minimum: 2, maximum: 200 },
              },
            },
            source: { type: 'string', enum: ['open', 'high', 'low', 'close'] },
          },
        },
      },
      entry: { $ref: '#/components/schemas/StrategyConditionGroup' },
      exit: { $ref: '#/components/schemas/StrategyConditionGroup' },
      risk: {
        type: 'object',
        required: ['stop_loss', 'take_profit'],
        additionalProperties: false,
        properties: {
          stop_loss: { $ref: '#/components/schemas/PercentRiskRule' },
          take_profit: { $ref: '#/components/schemas/PercentRiskRule' },
        },
      },
    },
  },
  StrategyConditionGroup: {
    type: 'object',
    required: ['logic', 'conditions'],
    additionalProperties: false,
    properties: {
      logic: { type: 'string', enum: ['AND'] },
      conditions: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: {
          type: 'object',
          required: ['left', 'op', 'right'],
          additionalProperties: false,
          properties: {
            left: { $ref: '#/components/schemas/StrategyOperand' },
            op: {
              type: 'string',
              enum: [
                'gt',
                'gte',
                'lt',
                'lte',
                'eq',
                'crosses_above',
                'crosses_below',
              ],
            },
            right: { $ref: '#/components/schemas/StrategyOperand' },
          },
        },
      },
    },
  },
  PercentRiskRule: {
    type: 'object',
    required: ['type', 'value'],
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ['percent'] },
      value: { type: 'number', exclusiveMinimum: true, minimum: 0 },
    },
  },
  Strategy: {
    type: 'object',
    required: [
      'id',
      'name',
      'description',
      'asset_type',
      'symbol_scope',
      'timeframe',
      'is_active',
      'version_number',
      'definition',
      'summary',
      'created_at',
      'updated_at',
    ],
    properties: {
      id: stringId,
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      asset_type: { type: 'string', enum: ['EQUITY', 'CRYPTO'] },
      symbol_scope: { type: 'string', enum: ['SINGLE'] },
      timeframe: { type: 'string', enum: ['1d', '1h'] },
      is_active: { type: 'boolean' },
      version_number: { type: 'integer', minimum: 1 },
      definition: { $ref: '#/components/schemas/StrategyDefinition' },
      summary: { type: 'string' },
      created_at: timestamp,
      updated_at: timestamp,
      version_created_at: timestamp,
      is_latest: { type: 'boolean' },
    },
  },
  StrategyList: {
    type: 'object',
    required: ['items', 'limit', 'offset', 'has_more'],
    properties: {
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/Strategy' },
      },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      offset: { type: 'integer', minimum: 0 },
      has_more: { type: 'boolean' },
    },
  },
  StrategyValidation: {
    type: 'object',
    required: ['is_valid', 'errors', 'summary'],
    properties: {
      is_valid: { type: 'boolean' },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'code', 'message'],
          properties: {
            path: { type: 'string' },
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
      summary: { type: 'string', nullable: true },
    },
  },
  Job: {
    type: 'object',
    required: ['id', 'job_type', 'status', 'payload', 'created_at'],
    properties: {
      id: stringId,
      job_type: {
        type: 'string',
        enum: [
          'equity_daily_import',
          'crypto_import',
          'market_data_scheduled',
          'backtest_run',
        ],
      },
      status: {
        type: 'string',
        enum: [
          'pending',
          'running',
          'completed',
          'failed',
          'timed_out',
          'cancelled',
        ],
      },
      payload: { type: 'object', additionalProperties: true },
      error_message: { type: 'string' },
      created_at: timestamp,
      started_at: timestamp,
      finished_at: timestamp,
    },
  },
  BacktestRun: {
    type: 'object',
    required: [
      'id',
      'strategy_id',
      'strategy_version_id',
      'symbol',
      'timeframe',
      'start_date',
      'end_date',
      'initial_equity',
      'status',
      'created_at',
      'updated_at',
    ],
    properties: {
      id: stringId,
      strategy_id: stringId,
      strategy_version_id: { type: 'integer', minimum: 1 },
      symbol: { type: 'string' },
      timeframe: { type: 'string', enum: ['1d', '1h'] },
      start_date: timestamp,
      end_date: timestamp,
      initial_equity: decimal,
      status: {
        type: 'string',
        enum: ['pending', 'running', 'completed', 'failed', 'timed_out'],
      },
      job_id: stringId,
      error_message: { type: 'string' },
      diagnostics: { type: 'object', additionalProperties: true },
      created_at: timestamp,
      updated_at: timestamp,
      started_at: timestamp,
      finished_at: timestamp,
    },
  },
  BacktestListItem: {
    allOf: [
      { $ref: '#/components/schemas/BacktestRun' },
      {
        type: 'object',
        required: ['strategy_name'],
        properties: {
          strategy_name: { type: 'string' },
          total_return_pct: decimal,
          max_drawdown_pct: decimal,
          num_trades: { type: 'integer', minimum: 0 },
        },
      },
    ],
  },
  BacktestResult: {
    type: 'object',
    nullable: true,
    required: [
      'final_equity',
      'total_return_pct',
      'max_drawdown_pct',
      'win_rate_pct',
      'num_trades',
      'avg_win_pct',
      'avg_loss_pct',
      'sharpe_ratio',
    ],
    properties: {
      final_equity: decimal,
      total_return_pct: decimal,
      max_drawdown_pct: decimal,
      win_rate_pct: decimal,
      num_trades: { type: 'integer', minimum: 0 },
      avg_win_pct: decimal,
      avg_loss_pct: decimal,
      sharpe_ratio: { ...decimal, nullable: true },
    },
  },
  BacktestCreateResponse: {
    type: 'object',
    required: ['run', 'results'],
    properties: {
      run: { $ref: '#/components/schemas/BacktestRun' },
      results: { $ref: '#/components/schemas/BacktestResult' },
    },
  },
  BacktestList: {
    type: 'object',
    required: ['items', 'limit', 'offset', 'has_more'],
    properties: {
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/BacktestListItem' },
      },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      offset: { type: 'integer', minimum: 0 },
      has_more: { type: 'boolean' },
    },
  },
  BacktestDetail: {
    type: 'object',
    required: ['run', 'results', 'trades', 'trades_page', 'equity_curve'],
    properties: {
      run: { $ref: '#/components/schemas/BacktestRun' },
      results: { $ref: '#/components/schemas/BacktestResult' },
      trades: {
        type: 'array',
        description:
          'Ordered by entry_time ascending, then stable trade id ascending.',
        items: {
          type: 'object',
          required: [
            'id',
            'symbol_id',
            'entry_time',
            'exit_time',
            'side',
            'entry_price',
            'exit_price',
            'quantity',
            'pnl_abs',
            'pnl_pct',
          ],
          properties: {
            id: { type: 'integer', minimum: 1 },
            symbol_id: { type: 'integer', minimum: 1 },
            entry_time: timestamp,
            exit_time: timestamp,
            side: { type: 'string', enum: ['long'] },
            entry_price: decimal,
            exit_price: decimal,
            quantity: decimal,
            pnl_abs: decimal,
            pnl_pct: decimal,
          },
        },
      },
      trades_page: {
        type: 'object',
        description:
          'Pagination metadata for trades. When has_more is true, request the next page by advancing trades_offset by the number of rows already loaded.',
        required: ['limit', 'offset', 'has_more'],
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 1000 },
          offset: { type: 'integer', minimum: 0, maximum: 100000 },
          has_more: {
            type: 'boolean',
            description: 'True when another ordered trade page is available.',
          },
        },
      },
      equity_curve: {
        type: 'array',
        items: {
          type: 'object',
          required: ['timestamp', 'equity'],
          properties: { timestamp, equity: decimal },
        },
      },
    },
  },
  PaperAccount: {
    type: 'object',
    required: [
      'id',
      'base_currency',
      'starting_balance',
      'cash_balance',
      'created_at',
    ],
    properties: {
      id: { type: 'integer', minimum: 1 },
      base_currency: { type: 'string', enum: ['USD'] },
      starting_balance: decimal,
      cash_balance: decimal,
      created_at: timestamp,
    },
  },
  PaperOrder: {
    type: 'object',
    required: ['id', 'symbol', 'side', 'quantity', 'status', 'requested_at'],
    properties: {
      id: stringId,
      symbol: { type: 'string', example: 'AAPL' },
      side: { type: 'string', enum: ['BUY', 'SELL'] },
      quantity: decimal,
      status: {
        type: 'string',
        enum: ['PENDING', 'FILLED', 'REJECTED', 'CANCELLED'],
      },
      avg_fill_price: decimal,
      reject_reason: {
        type: 'string',
        enum: [
          'NO_MARKET_PRICE',
          'MAX_ORDER_NOTIONAL',
          'MAX_POSITION_PCT',
          'MIN_CASH_REMAINING',
          'INSUFFICIENT_CASH',
          'INSUFFICIENT_POSITION',
        ],
      },
      requested_at: timestamp,
      filled_at: timestamp,
      client_order_id: { type: 'string', minLength: 1, maxLength: 64 },
    },
  },
  PlaceOrderResponse: {
    type: 'object',
    required: ['order'],
    properties: { order: { $ref: '#/components/schemas/PaperOrder' } },
  },
  OrderList: {
    type: 'object',
    required: ['orders', 'limit', 'offset', 'has_more'],
    properties: {
      orders: {
        type: 'array',
        items: { $ref: '#/components/schemas/PaperOrder' },
      },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      offset: { type: 'integer', minimum: 0, maximum: 10000 },
      has_more: { type: 'boolean' },
    },
  },
  PaperExecution: {
    type: 'object',
    required: [
      'executed_at',
      'symbol',
      'side',
      'quantity',
      'price',
      'notional',
    ],
    properties: {
      executed_at: timestamp,
      symbol: { type: 'string', example: 'AAPL' },
      side: { type: 'string', enum: ['BUY', 'SELL'] },
      quantity: decimal,
      price: decimal,
      notional: decimal,
    },
  },
  ExecutionList: {
    type: 'object',
    required: ['executions', 'limit', 'offset', 'has_more'],
    properties: {
      executions: {
        type: 'array',
        items: { $ref: '#/components/schemas/PaperExecution' },
      },
      limit: { type: 'integer', minimum: 1, maximum: 500 },
      offset: { type: 'integer', minimum: 0, maximum: 10000 },
      has_more: { type: 'boolean' },
    },
  },
  PositionList: {
    type: 'object',
    required: ['positions'],
    properties: {
      positions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['symbol', 'quantity', 'avg_cost'],
          properties: {
            symbol: { type: 'string', example: 'AAPL' },
            quantity: decimal,
            avg_cost: decimal,
          },
        },
      },
    },
  },
  PortfolioSummary: {
    type: 'object',
    required: [
      'cash_balance',
      'total_position_value',
      'total_equity',
      'unrealized_pnl_total',
    ],
    properties: {
      cash_balance: decimal,
      total_position_value: decimal,
      total_equity: decimal,
      unrealized_pnl_total: decimal,
    },
  },
  Liveness: {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'string', enum: ['ok'] } },
  },
  Readiness: {
    type: 'object',
    required: ['status', 'ready', 'timestamp', 'checks'],
    properties: {
      status: { type: 'string', enum: ['ok', 'degraded'] },
      ready: { type: 'boolean' },
      timestamp,
      checks: {
        type: 'object',
        required: ['database', 'marketData'],
        properties: {
          database: { $ref: '#/components/schemas/DependencyCheck' },
          marketData: { $ref: '#/components/schemas/DependencyCheck' },
        },
      },
    },
  },
  DependencyCheck: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['up', 'down', 'not_configured'] },
      latencyMs: { type: 'integer', minimum: 0 },
      details: { type: 'string' },
    },
  },
  AiExplainStrategyResponse: {
    type: 'object',
    required: [
      'disclaimer',
      'confidence',
      'ai_request_id',
      'explanation',
      'warnings',
    ],
    properties: {
      disclaimer: { type: 'string' },
      confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      ai_request_id: stringId,
      explanation: { type: 'string' },
      warnings: {
        type: 'array',
        items: { $ref: '#/components/schemas/AiWarning' },
      },
    },
  },
  AiValidateStrategyResponse: {
    type: 'object',
    required: ['disclaimer', 'confidence', 'ai_request_id', 'warnings'],
    properties: {
      disclaimer: { type: 'string' },
      confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      ai_request_id: stringId,
      warnings: {
        type: 'array',
        items: { $ref: '#/components/schemas/AiWarning' },
      },
    },
  },
  AiExplainBacktestResponse: {
    type: 'object',
    required: [
      'disclaimer',
      'confidence',
      'ai_request_id',
      'explanation',
      'issues',
    ],
    properties: {
      disclaimer: { type: 'string' },
      confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      ai_request_id: stringId,
      explanation: { type: 'string' },
      issues: {
        type: 'array',
        items: { $ref: '#/components/schemas/AiIssue' },
      },
    },
  },
  AiSuggestImprovementsResponse: {
    type: 'object',
    required: ['disclaimer', 'confidence', 'ai_request_id', 'suggestions'],
    properties: {
      disclaimer: { type: 'string' },
      confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      ai_request_id: stringId,
      suggestions: {
        type: 'array',
        items: { $ref: '#/components/schemas/AiSuggestion' },
      },
    },
  },
  AiWarning: {
    type: 'object',
    required: ['code', 'severity', 'message', 'evidence_paths'],
    properties: {
      code: { type: 'string' },
      severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      message: { type: 'string' },
      evidence_paths: { type: 'array', items: { type: 'string' } },
    },
  },
  AiIssue: {
    type: 'object',
    required: ['code', 'severity', 'message', 'evidence'],
    properties: {
      code: { type: 'string' },
      severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      message: { type: 'string' },
      evidence: { type: 'array', items: { type: 'string' } },
    },
  },
  AiSuggestion: {
    type: 'object',
    required: ['code', 'title', 'description', 'evidence'],
    properties: {
      code: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      evidence: { type: 'array', items: { type: 'string' } },
    },
  },
};
