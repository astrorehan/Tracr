import {
  Wallet,
  CreditCard,
  Smartphone,
  Bitcoin,
  LineChart,
  Landmark,
  HandCoins,
  Coins,
} from 'lucide-react'
import type { AccountType } from '@/types/db'

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: typeof Wallet }[] = [
  { value: 'cash', label: 'Cash', icon: Wallet },
  { value: 'bank_card', label: 'Bank / Card', icon: Landmark },
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { value: 'e_wallet', label: 'E-Wallet', icon: Smartphone },
  { value: 'crypto', label: 'Crypto', icon: Bitcoin },
  { value: 'stocks', label: 'Stocks', icon: LineChart },
  { value: 'loan', label: 'Loan', icon: HandCoins },
  { value: 'other', label: 'Other', icon: Coins },
]

/** Account types that are debts by nature — used to default the liability flag. */
export const LIABILITY_TYPES = new Set<AccountType>(['credit_card', 'loan'])

export function accountTypeMeta(type: AccountType) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1]
}

/** Refined, warm-harmonious accent palette offered when creating an account.
   Muted/earthy tones that sit well against the amber theme rather than loud
   primaries. Rendered as low-opacity tints, so these read as quiet accents. */
export const ACCOUNT_COLORS = [
  '#d97706', // amber
  '#c2603f', // terracotta
  '#a87b3f', // ochre
  '#6b8e6b', // sage
  '#4f8a8b', // dusty teal
  '#5b7290', // dusty blue
  '#8a5f7e', // mauve
  '#8a7c66', // stone
]
