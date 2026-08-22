// subCostReadyToBill()'s gate for the bill-through subcontractor cost bridge.
// Run from tradiee-app/:  node scripts/check-sub-cost-bridge.mjs

import assert from 'node:assert/strict'
import { subCostReadyToBill } from '../lib/job-financials.ts'

assert.equal(
  subCostReadyToBill({ subJobStatus: 'in_progress', agreedPrice: 500, contractorMaterialId: null }),
  false,
  'not ready while the sub job is still in progress',
)
assert.equal(
  subCostReadyToBill({ subJobStatus: 'completed', agreedPrice: null, contractorMaterialId: null }),
  false,
  'no agreed price on the invitation: nothing to pull in',
)
assert.equal(
  subCostReadyToBill({ subJobStatus: 'completed', agreedPrice: 500, contractorMaterialId: 'existing-id' }),
  false,
  'already pulled in once: never double-add',
)
assert.equal(
  subCostReadyToBill({ subJobStatus: 'completed', agreedPrice: 0, contractorMaterialId: null }),
  true,
  'a $0 agreed price is still a real value, not "no price" — falsy-zero must not be treated as missing',
)
assert.equal(
  subCostReadyToBill({ subJobStatus: 'completed', agreedPrice: 500, contractorMaterialId: null }),
  true,
  'completed, priced, not yet added: ready',
)

console.log('OK — subCostReadyToBill() gate verified (completed + priced + not-yet-added).')
