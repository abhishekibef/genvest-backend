import express from 'express';

// ─── UNIFIED XP CONSTANTS ───────────────────────────────────────────────────
export const XP_LOGIC = {
  LESSON: 80,
  QUIZ: 20,
  MARKET_CHALLENGE: 40,
  WEEKLY_TEST: 150,
  AI_REVISION: 30,
  DAILY_LOGIN: 0
};

// ─── XP HELPER FUNCTION ─────────────────────────────────────────────────────
// Use this function internally from other routes (e.g. learn.js)
export async function awardXP(prisma, userId, actionType) {
  const xpAmount = XP_LOGIC[actionType] || 0;
  
  if (xpAmount === 0) return 0; // e.g. Daily Login is 0 XP

  try {
    await prisma.user.update({
      where: { id: Number(userId) },
      data: {
        totalXP: { increment: xpAmount }
      }
    });
    return xpAmount;
  } catch (error) {
    console.error(`Failed to award XP for action ${actionType}:`, error);
    return 0;
  }
}

// ─── XP ROUTER ──────────────────────────────────────────────────────────────
export function getXpRouter(prisma) {
  const router = express.Router();

  // POST /api/xp/award
  // Example body: { userId: 1, actionType: "MARKET_CHALLENGE" }
  router.post('/award', async (req, res) => {
    const { userId, actionType } = req.body;

    if (!userId || !actionType) {
      return res.status(400).json({ error: 'Missing userId or actionType' });
    }

    if (XP_LOGIC[actionType] === undefined) {
      return res.status(400).json({ error: 'Invalid action type for XP' });
    }

    try {
      const xpAmount = await awardXP(prisma, userId, actionType);
      
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { totalXP: true }
      });

      return res.status(200).json({ 
        success: true, 
        awardedXP: xpAmount,
        totalXP: user.totalXP,
        actionType 
      });

    } catch (error) {
      console.error('Error in XP award route:', error);
      res.status(500).json({ error: 'Failed to award XP' });
    }
  });

  // GET /api/xp/logic
  // Returns the logic configuration for the frontend to display (e.g. in a table)
  router.get('/logic', (req, res) => {
    res.status(200).json(XP_LOGIC);
  });

  return router;
}
