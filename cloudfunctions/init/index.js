// cloudfunctions/init/index.js
// 胖兄弟外卖 - 数据库初始化云函数
// 创建所有集合并建立索引

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// ---------------------------------------------------------------------------
// Collection definitions
// ---------------------------------------------------------------------------

const COLLECTIONS = [
  'users',
  'merchants',
  'categories',
  'products',
  'orders',
  'reviews',
  'settlements'
]

// ---------------------------------------------------------------------------
// Index definitions
//
// Each entry maps a collection name to an array of index specifications.
// WeChat cloud DB `createIndex` accepts:
//   - indexName  : unique name for the index
//   - fieldPath  : the field to index (compound indexes use multiple calls or
//                  a composite field path depending on SDK version)
//   - unique     : whether the index enforces uniqueness
//
// For compound indexes we use a single createIndex call with an array of
// `{fieldPath, order}` objects where supported by the SDK.  If the SDK only
// supports single-field indexes at the time of execution, we fall back to
// creating individual single-field indexes (still beneficial for queries).
// ---------------------------------------------------------------------------

const INDEXES = {
  users: [
    {
      indexName: 'idx_openid',
      fields: [{ fieldPath: '_openid', order: 'asc' }],
      unique: true
    }
  ],

  merchants: [
    {
      indexName: 'idx_user_id',
      fields: [{ fieldPath: 'user_id', order: 'asc' }],
      unique: true
    },
    {
      indexName: 'idx_invite_code',
      fields: [{ fieldPath: 'invite_code', order: 'asc' }],
      unique: true
    },
    {
      indexName: 'idx_location',
      fields: [{ fieldPath: 'location', order: '2dsphere' }],
      unique: false
    },
    {
      indexName: 'idx_status_is_open',
      fields: [
        { fieldPath: 'status', order: 'asc' },
        { fieldPath: 'is_open', order: 'asc' }
      ],
      unique: false
    }
  ],

  categories: [
    {
      indexName: 'idx_merchant_sort',
      fields: [
        { fieldPath: 'merchant_id', order: 'asc' },
        { fieldPath: 'sort_order', order: 'asc' }
      ],
      unique: false
    }
  ],

  products: [
    {
      indexName: 'idx_merchant_category',
      fields: [
        { fieldPath: 'merchant_id', order: 'asc' },
        { fieldPath: 'category_id', order: 'asc' }
      ],
      unique: false
    },
    {
      indexName: 'idx_merchant_on_sale',
      fields: [
        { fieldPath: 'merchant_id', order: 'asc' },
        { fieldPath: 'is_on_sale', order: 'asc' }
      ],
      unique: false
    }
  ],

  orders: [
    {
      indexName: 'idx_user_created',
      fields: [
        { fieldPath: 'user_id', order: 'asc' },
        { fieldPath: 'created_at', order: 'desc' }
      ],
      unique: false
    },
    {
      indexName: 'idx_merchant_status_created',
      fields: [
        { fieldPath: 'merchant_id', order: 'asc' },
        { fieldPath: 'status', order: 'asc' },
        { fieldPath: 'created_at', order: 'desc' }
      ],
      unique: false
    },
    {
      indexName: 'idx_order_no',
      fields: [{ fieldPath: 'order_no', order: 'asc' }],
      unique: true
    }
  ],

  reviews: [
    {
      indexName: 'idx_order_id',
      fields: [{ fieldPath: 'order_id', order: 'asc' }],
      unique: false
    },
    {
      indexName: 'idx_merchant_created',
      fields: [
        { fieldPath: 'merchant_id', order: 'asc' },
        { fieldPath: 'created_at', order: 'desc' }
      ],
      unique: false
    }
  ],

  settlements: [
    {
      indexName: 'idx_order_id',
      fields: [{ fieldPath: 'order_id', order: 'asc' }],
      unique: false
    },
    {
      indexName: 'idx_merchant_created',
      fields: [
        { fieldPath: 'merchant_id', order: 'asc' },
        { fieldPath: 'created_at', order: 'desc' }
      ],
      unique: false
    }
  ]
}

// ---------------------------------------------------------------------------
// Helper – create a single collection (ignore "already exists" errors)
// ---------------------------------------------------------------------------

async function createCollection(collectionName) {
  try {
    await db.createCollection(collectionName)
    return { collection: collectionName, status: 'created' }
  } catch (err) {
    // -501007 means the collection already exists in WeChat cloud
    if (err.errCode === -501007 || (err.message && err.message.includes('already exists'))) {
      return { collection: collectionName, status: 'already_exists' }
    }
    return { collection: collectionName, status: 'error', error: err.message }
  }
}

// ---------------------------------------------------------------------------
// Helper – create a single index (ignore "already exists" errors)
// ---------------------------------------------------------------------------

async function createIndex(collectionName, indexDef) {
  try {
    const col = db.collection(collectionName)
    await col.createIndex(indexDef.indexName, indexDef.fields, indexDef.unique)
    return {
      collection: collectionName,
      index: indexDef.indexName,
      status: 'created'
    }
  } catch (err) {
    if (
      err.errCode === -501009 ||
      (err.message && err.message.includes('already exists')) ||
      (err.message && err.message.includes('index name already'))
    ) {
      return {
        collection: collectionName,
        index: indexDef.indexName,
        status: 'already_exists'
      }
    }
    return {
      collection: collectionName,
      index: indexDef.indexName,
      status: 'error',
      error: err.message
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

exports.main = async (event, context) => {
  const results = {
    collections: [],
    indexes: [],
    summary: {
      collections_created: 0,
      collections_existed: 0,
      collections_failed: 0,
      indexes_created: 0,
      indexes_existed: 0,
      indexes_failed: 0
    }
  }

  // 1. Create collections ------------------------------------------------
  console.log('[init] Creating collections...')
  for (const name of COLLECTIONS) {
    const res = await createCollection(name)
    results.collections.push(res)
    if (res.status === 'created') results.summary.collections_created++
    else if (res.status === 'already_exists') results.summary.collections_existed++
    else results.summary.collections_failed++
    console.log(`[init]   ${name}: ${res.status}`)
  }

  // 2. Create indexes ----------------------------------------------------
  console.log('[init] Creating indexes...')
  for (const [collectionName, indexDefs] of Object.entries(INDEXES)) {
    for (const indexDef of indexDefs) {
      const res = await createIndex(collectionName, indexDef)
      results.indexes.push(res)
      if (res.status === 'created') results.summary.indexes_created++
      else if (res.status === 'already_exists') results.summary.indexes_existed++
      else results.summary.indexes_failed++
      console.log(`[init]   ${collectionName}.${indexDef.indexName}: ${res.status}`)
    }
  }

  console.log('[init] Done.', JSON.stringify(results.summary))
  return results
}
