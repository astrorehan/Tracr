import {
  Wallet,
  CreditCard,
  Smartphone,
  Bitcoin,
  LineChart,
  Landmark,
  HandCoins,
  Coins,
  Receipt,
} from 'lucide-react'
import type { AccountType } from '@/types/db'

import type { MsgKey } from '@/i18n'

export const ACCOUNT_TYPES: { value: AccountType; label: MsgKey; icon: typeof Wallet }[] = [
  { value: 'cash', label: 'accType.cash', icon: Wallet },
  { value: 'bank_card', label: 'accType.bank_card', icon: Landmark },
  { value: 'credit_card', label: 'accType.credit_card', icon: CreditCard },
  { value: 'e_wallet', label: 'accType.e_wallet', icon: Smartphone },
  { value: 'crypto', label: 'accType.crypto', icon: Bitcoin },
  { value: 'stocks', label: 'accType.stocks', icon: LineChart },
  { value: 'loan', label: 'accType.loan', icon: HandCoins },
  { value: 'receivable', label: 'accType.receivable', icon: Receipt },
  { value: 'other', label: 'accType.other', icon: Coins },
]

/** Account types that are debts by nature — used to default the liability flag. */
export const LIABILITY_TYPES = new Set<AccountType>(['credit_card', 'loan'])

export function accountTypeMeta(type: AccountType) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1]
}

/** Vibrant e-wallet accent palette offered when creating an account, book, goal, tag, or category —
   high-clarity, friendly tones designed to render clearly as both solid pickers and
   low-opacity tints (`${color}22`) across light and dark modes. */
export const ACCOUNT_COLORS = [
  '#2b8ef0', // vibrant blue
  '#12b0c4', // vibrant cyan
  '#1fb07c', // vibrant green
  '#f0a020', // vibrant amber
  '#f2743d', // vibrant orange
  '#ef4d6b', // vibrant rose
  '#7a5af0', // vibrant indigo
  '#d857b0', // vibrant magenta
]
