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

/** Muted accent palette offered when creating an account — purely for *identity*
   (telling accounts apart), the one place the monochrome system tolerates colour.
   Even, low-saturation tones rendered as low-opacity tints; leads with a cool
   neutral and carries no loud brand hue, so accounts don't tie back to a theme. */
export const ACCOUNT_COLORS = [
  '#5b7290', // dusty blue
  '#4f8a8b', // dusty teal
  '#6b8e6b', // sage
  '#8a5f7e', // mauve
  '#a87b3f', // ochre
  '#c2603f', // terracotta
  '#8a7c66', // stone
  '#6b7280', // slate grey
]
