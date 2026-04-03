import { normalizeMerchantName } from '../lib/classifiers/merchant-normalizer'
import { categorize } from '../lib/classifiers/categorizer'

const merchants = [
  'NETFLIX',
  'SPOTIFY',
  'HULU',
  'DISNEY+',
  'APPLE.COM/BILL',
  'WHOLE FOODS MARKET',
  "TRADER JOE'S",
  'WALMART SUPERCENTER',
  'TARGET',
  'STARBUCKS',
  "MCDONALD'S",
  'UBER',
  'UBER EATS',
  'LYFT',
  'SHELL OIL',
  'BP GAS',
  'EXXON',
  'CHEVRON',
  'COMED',
  'AT&T',
  'VERIZON',
  'T-MOBILE',
  'PAYROLL DEPOSIT',
  'DIRECT DEPOSIT ACME CORP',
  'VENMO PAYMENT',
  'CASH APP',
  'ZELLE PMT FROM MOM',
  'AMAZON MKTPL',
  'DOORDASH',
]

console.log('\nMerchant Classification Test\n')
console.log(
  'Merchant'.padEnd(30) +
  'Normalized'.padEnd(25) +
  'Category'.padEnd(16) +
  'Conf'.padEnd(7) +
  'Reason'
)
console.log('─'.repeat(100))

for (const raw of merchants) {
  const normalized = normalizeMerchantName(raw)
  const result     = categorize({
    date:        '',
    description: raw,
    merchant:    normalized,
    amount:      10,
    direction:   'debit',
    raw:         {} as never,
  })

  console.log(
    raw.padEnd(30) +
    normalized.padEnd(25) +
    result.category.padEnd(16) +
    String(result.confidence).padEnd(7) +
    result.reason
  )
}
