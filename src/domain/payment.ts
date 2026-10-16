export function paymentSplit(balanceCents: number, amountCents: number, interestCents: number, interestIncludedInBalance = false) {
  for (const amount of [balanceCents, amountCents, interestCents]) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 99_999_999_999) throw new Error('Enter valid payment amounts.')
  }
  if (amountCents === 0) throw new Error('Payment must be greater than zero.')
  if (interestCents > amountCents) throw new Error('Interest cannot exceed the payment.')
  if (typeof interestIncludedInBalance !== 'boolean') throw new Error('Choose how interest relates to the saved balance.')
  const principalCents = amountCents - interestCents
  const balanceReductionCents = principalCents + (interestIncludedInBalance ? interestCents : 0)
  if (balanceReductionCents > balanceCents) throw new Error('Balance reduction cannot exceed the saved debt balance. Check the payment and interest split.')
  return { principalCents, interestCents, balanceReductionCents, balanceAfterCents: balanceCents - balanceReductionCents }
}
