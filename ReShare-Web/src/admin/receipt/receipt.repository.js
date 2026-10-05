import { demoReceiptAdapter } from './receipt.demo'

// Provider independent contract for the actual receipt feature.
// Replace this adapter when the receipt API is available; views never call Firebase directly.
const unavailable = () => new Error('Nguồn dữ liệu ghi nhận thực nhận chưa được cấu hình.')

const emptyAdapter = {
  async getDonation() {
    throw unavailable()
  },
  async getOptions() {
    throw unavailable()
  },
  async createReceipt() {
    throw unavailable()
  },
}

let adapter = emptyAdapter

export function setReceiptRepository(nextAdapter) {
  adapter = nextAdapter ?? emptyAdapter
}

export const receiptRepository = Object.freeze({
  getDonation: (...args) => adapter.getDonation(...args),
  getOptions: (...args) => adapter.getOptions(...args),
  createReceipt: (...args) => adapter.createReceipt(...args),
})

// Explicitly selected by the development preview route; never selected implicitly.
export const demoReceiptRepository = Object.freeze({
  getDonation: (...args) => demoReceiptAdapter.getDonation(...args),
  getOptions: (...args) => demoReceiptAdapter.getOptions(...args),
  createReceipt: (...args) => demoReceiptAdapter.createReceipt(...args),
})
