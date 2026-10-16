export function paymentSplit(balanceCents: number, amountCents: number, interestCents: number) {
  for (const amount of [balanceCents, amountCents, interestCents]) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 99_999_999_999) throw new Error('Enter valid payment amounts.')
  }
  if (amountCents === 0) throw new Error('Payment must be greater than zero.')
  if (interestCents > amountCents) throw new Error('Interest cannot exceed the payment.')
  const principalCents = amountCents - interestCents
  if (principalCents > balanceCents) throw new Error('Principal cannot exceed the saved debt balance. Check the payment and interest split.')
  return { principalCents, interestCents, balanceAfterCents: balanceCents - principalCents }
}
