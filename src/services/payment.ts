import db from '../db/client';
import crypto from 'crypto';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'CRYPTO' | 'STRIPE' | 'PAYPAL';

interface CreatePaymentInput {
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  metadata?: Record<string, unknown>;
}

interface VerifyPaymentInput {
  paymentId: string;
  transactionHash?: string;
  externalId?: string;
}

export class PaymentService {
  async createPayment(input: CreatePaymentInput): Promise<string> {
    const payment = await db.payment.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        currency: input.currency,
        status: 'PENDING',
        method: input.method,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });

    return payment.id;
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<boolean> {
    const payment = await db.payment.findUnique({
      where: { id: input.paymentId },
    });

    if (!payment) throw new Error('Payment not found');

    // Verify transaction based on method
    let verified = false;

    if (payment.method === 'CRYPTO' && input.transactionHash) {
      verified = await this.verifyCryptoTransaction(input.transactionHash, payment.amount);
    } else if (input.externalId) {
      verified = await this.verifyExternalPayment(
        payment.method as PaymentMethod,
        input.externalId
      );
    }

    if (verified) {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          transactionHash: input.transactionHash,
          externalId: input.externalId,
          completedAt: new Date(),
        },
      });

      // Add balance to user
      await db.user.update({
        where: { id: payment.userId },
        data: {
          balance: {
            increment: payment.amount,
          },
        },
      });

      return true;
    }

    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });

    return false;
  }

  private async verifyCryptoTransaction(txHash: string, _expectedAmount: number): Promise<boolean> {
    // In production, verify transaction on blockchain
    // For now, just check format
    if (txHash.startsWith('0x') && txHash.length === 66) {
      // Placeholder verification
      return true;
    }
    return false;
  }

  private async verifyExternalPayment(method: PaymentMethod, externalId: string): Promise<boolean> {
    // In production, verify with payment provider API
    // Stripe, PayPal, etc.
    return externalId.length > 0;
  }

  async getPayment(paymentId: string) {
    return await db.payment.findUnique({
      where: { id: paymentId },
    });
  }

  async listPayments(userId: string, status?: PaymentStatus) {
    return await db.payment.findMany({
      where: {
        userId,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async refundPayment(paymentId: string, reason?: string): Promise<void> {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'COMPLETED') throw new Error('Can only refund completed payments');

    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REFUNDED',
        metadata: JSON.stringify({
          ...((payment.metadata && JSON.parse(payment.metadata)) || {}),
          refundReason: reason,
          refundedAt: new Date().toISOString(),
        }),
      },
    });

    // Deduct from user balance
    await db.user.update({
      where: { id: payment.userId },
      data: {
        balance: {
          decrement: payment.amount,
        },
      },
    });
  }

  async getUserPaymentStats(userId: string) {
    const payments = await db.payment.findMany({
      where: { userId },
    });

    const total = payments.reduce((sum: number, p: typeof payments[0]) => sum + p.amount, 0);
    const completed = payments.filter((p: typeof payments[0]) => p.status === 'COMPLETED');
    const pending = payments.filter((p: typeof payments[0]) => p.status === 'PENDING');
    const failed = payments.filter((p: typeof payments[0]) => p.status === 'FAILED');

    return {
      totalPayments: payments.length,
      totalAmount: total,
      completedPayments: completed.length,
      completedAmount: completed.reduce((sum: number, p: typeof payments[0]) => sum + p.amount, 0),
      pendingPayments: pending.length,
      failedPayments: failed.length,
    };
  }

  generatePaymentIntent(amount: number, _currency: string = 'USD'): string {
    // Generate unique payment intent ID
    return `pi_${crypto.randomBytes(16).toString('hex')}`;
  }

  async getPaymentHistory(userId: string): Promise<Array<{ date: string; amount: number }>> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { balance: true, createdAt: true },
    });

    if (!user) return [];

    // Get completed payments and create balance history
    const payments = await db.payment.findMany({
      where: {
        userId,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'asc' },
      select: {
        amount: true,
        completedAt: true,
      },
    });

    // Build cumulative balance history
    const history: Array<{ date: string; amount: number }> = [];
    let runningBalance = 0;

    // Add payments to history
    for (const payment of payments) {
      runningBalance += payment.amount;
      history.push({
        date:
          payment.completedAt?.toISOString().split('T')[0] ||
          new Date().toISOString().split('T')[0],
        amount: runningBalance,
      });
    }

    // If no history, add current balance as single point
    if (history.length === 0 && user.balance > 0) {
      history.push({
        date: new Date().toISOString().split('T')[0],
        amount: user.balance,
      });
    }

    // Add current balance as final point
    if (history.length > 0 && history[history.length - 1].amount !== user.balance) {
      history.push({
        date: new Date().toISOString().split('T')[0],
        amount: user.balance,
      });
    }

    return history;
  }
}
