import express from 'express';
import { PaymentService, PaymentStatus, PaymentMethod } from '../services/payment';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const paymentService = new PaymentService();

// Create a new payment
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { amount, currency, method, metadata } = req.body;

    if (!amount || !method) {
      return res.status(400).json({ error: 'amount and method are required' });
    }

    const paymentId = await paymentService.createPayment({
      userId: req.user!.id,
      amount,
      currency: currency || 'USD',
      method: method as PaymentMethod,
      metadata,
    });

    res.json({ success: true, paymentId });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Verify payment
router.post('/:paymentId/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { transactionHash, externalId } = req.body;

    const verified = await paymentService.verifyPayment({
      paymentId: req.params.paymentId,
      transactionHash,
      externalId,
    });

    res.json({ success: true, verified });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Get payment history for balance chart (must be before /:paymentId)
router.get('/history', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = (req.query.userId as string) || req.user!.id;
    const history = await paymentService.getPaymentHistory(userId);
    res.json({ history });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Failed to get payment history', history: [] });
  }
});

// Get user payment stats (must be before /:paymentId)
router.get('/user/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const stats = await paymentService.getUserPaymentStats(req.user!.id);

    res.json(stats);
  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({ error: 'Failed to get payment stats' });
  }
});

// Get payment details
router.get('/:paymentId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const payment = await paymentService.getPayment(req.params.paymentId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ error: 'Failed to get payment' });
  }
});

// List user payments
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;

    const payments = await paymentService.listPayments(
      req.user!.id,
      status as PaymentStatus | undefined
    );

    res.json(payments);
  } catch (error) {
    console.error('List payments error:', error);
    res.status(500).json({ error: 'Failed to list payments' });
  }
});

// Refund payment
router.post('/:paymentId/refund', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body;

    await paymentService.refundPayment(req.params.paymentId, reason);

    res.json({ success: true });
  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({ error: 'Failed to refund payment' });
  }
});

// Generate payment intent
router.post('/intent', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { amount, currency } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const intentId = paymentService.generatePaymentIntent(amount, currency);

    res.json({ success: true, intentId });
  } catch (error) {
    console.error('Generate payment intent error:', error);
    res.status(500).json({ error: 'Failed to generate payment intent' });
  }
});

// Top-up balance (crypto payment)
router.post('/topup', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { amount, transactionHash, currency = 'USD' } = req.body;

    if (!amount || !transactionHash) {
      return res.status(400).json({ error: 'amount and transactionHash are required' });
    }

    // Create payment record
    const paymentId = await paymentService.createPayment({
      userId: req.user!.id,
      amount,
      currency,
      method: 'CRYPTO',
      metadata: { type: 'balance_topup', transactionHash },
    });

    // Verify and complete payment
    const verified = await paymentService.verifyPayment({
      paymentId,
      transactionHash,
    });

    if (verified) {
      res.json({
        success: true,
        message: 'Balance topped up successfully',
        paymentId,
        amount,
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Transaction verification failed',
        paymentId,
      });
    }
  } catch (error) {
    console.error('Top-up balance error:', error);
    res.status(500).json({ error: 'Failed to top up balance' });
  }
});

// Get wallet overview (balance + payments + usage summary)
router.get('/wallet/overview', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Get payment stats and history in parallel
    const [stats, history, recentPayments] = await Promise.all([
      paymentService.getUserPaymentStats(userId),
      paymentService.getPaymentHistory(userId),
      paymentService.listPayments(userId, undefined),
    ]);

    res.json({
      stats,
      balanceHistory: history,
      recentPayments: recentPayments.slice(0, 10), // Last 10 payments
    });
  } catch (error) {
    console.error('Get wallet overview error:', error);
    res.status(500).json({ error: 'Failed to get wallet overview' });
  }
});

export default router;
