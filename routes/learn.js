import express from 'express';
import { XP_LOGIC } from './xp.js';

export function getLearnRouter(prisma) {
  const router = express.Router();

  // Badge definitions based on lesson completion milestones
  const BADGE_MILESTONES = [
    { count: 1, id: 'SCHOLAR', name: 'Smart Start 🎓', desc: 'Completed your first lesson!' },
    { count: 5, id: 'CURIOUS_MIND', name: 'Curious Mind 🧐', desc: 'Completed 5 lessons!' },
    { count: 10, id: 'FINFLUENCER', name: 'Finfluencer 📣', desc: 'Completed 10 lessons!' },
    { count: 25, id: 'KNOWLEDGE_SEEKER', name: 'Knowledge Seeker 📖', desc: 'Completed 25 lessons!' },
    { count: 50, id: 'MARKET_SCHOLAR', name: 'Market Scholar 🏅', desc: 'Completed 50 lessons!' },
    { count: 100, id: 'FINANCE_GURU', name: 'Finance Guru 🧘', desc: 'Completed 100 lessons!' },
    { count: 150, id: 'MARKET_WIZARD', name: 'Market Wizard 🧙‍♂️', desc: 'Completed 150 lessons!' },
  ];

  // ─── 1. Get all levels with user progress ───────────────────────
  router.get('/levels/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const levels = await prisma.level.findMany({
        orderBy: { number: 'asc' },
        include: {
          lessons: {
            orderBy: { lessonNumber: 'asc' },
            select: { id: true, lessonNumber: true, title: true, xpReward: true }
          }
        }
      });

      // Get user's completed lessons
      const userLessons = await prisma.userLesson.findMany({
        where: { userId: Number(userId) }
      });
      const completedIds = new Set(userLessons.map(ul => ul.lessonId));

      // Get user XP and gems
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { totalXP: true, gems: true, streak: true }
      });

      // Build levels with progress
      const levelsWithProgress = levels.map(level => {
        const totalLessons = level.lessons.length;
        const completedLessons = level.lessons.filter(l => completedIds.has(l.id)).length;
        const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

        return {
          id: level.id,
          number: level.number,
          title: level.title,
          description: level.description,
          icon: level.icon,
          totalLessons,
          completedLessons,
          progressPercent,
          isUnlocked: level.number === 1 || isLevelUnlocked(levels, level.number, completedIds),
          isCompleted: completedLessons === totalLessons && totalLessons > 0,
          lessons: level.lessons.map(lesson => ({
            ...lesson,
            completed: completedIds.has(lesson.id)
          }))
        };
      });

      const totalCompleted = userLessons.length;

      res.status(200).json({
        levels: levelsWithProgress,
        userProgress: {
          totalXP: user?.totalXP || 0,
          gems: user?.gems || 100,
          streak: user?.streak || 1,
          completedCount: totalCompleted
        }
      });
    } catch (error) {
      console.error(`❌ Failed to retrieve levels for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve levels' });
    }
  });

  // ─── 2. Get lessons in a level with user status ─────────────────
  router.get('/level/:levelId/lessons/:userId', async (req, res) => {
    const { levelId, userId } = req.params;

    try {
      const level = await prisma.level.findUnique({
        where: { id: Number(levelId) },
        include: {
          lessons: {
            orderBy: { lessonNumber: 'asc' },
            select: {
              id: true, lessonNumber: true, title: true,
              readTime: true, xpReward: true, learningObjective: true
            }
          }
        }
      });

      if (!level) {
        return res.status(404).json({ error: 'Level not found' });
      }

      const userLessons = await prisma.userLesson.findMany({
        where: { userId: Number(userId) }
      });
      const completedIds = new Set(userLessons.map(ul => ul.lessonId));

      const lessonsWithStatus = level.lessons.map((lesson, index) => {
        const isCompleted = completedIds.has(lesson.id);
        // A lesson is unlocked if it's the first one OR the previous one is completed
        const isUnlocked = index === 0 || completedIds.has(level.lessons[index - 1]?.id);
        return { ...lesson, completed: isCompleted, isUnlocked };
      });

      res.status(200).json({
        level: {
          id: level.id,
          number: level.number,
          title: level.title,
          description: level.description,
          icon: level.icon
        },
        lessons: lessonsWithStatus
      });
    } catch (error) {
      console.error(`❌ Failed to retrieve lessons for level ${levelId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve lessons' });
    }
  });

  // ─── 3. Get full lesson content ─────────────────────────────────
  router.get('/lesson/:lessonId', async (req, res) => {
    const { lessonId } = req.params;

    try {
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: {
          level: {
            select: { number: true, title: true }
          }
        }
      });

      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      // Parse JSON fields
      let quizParsed = [];
      let recapParsed = [];
      try { quizParsed = JSON.parse(lesson.quiz); } catch (e) { /* ignore */ }
      try { recapParsed = JSON.parse(lesson.recap); } catch (e) { /* ignore */ }

      res.status(200).json({
        ...lesson,
        quiz: quizParsed,
        recap: recapParsed,
        quickRecap: recapParsed
      });
    } catch (error) {
      console.error(`❌ Failed to retrieve lesson ${lessonId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve lesson' });
    }
  });

  // ─── 4. Complete a lesson (submit quiz) ─────────────────────────
  router.post('/lesson/complete', async (req, res) => {
    const { userId, lessonId, score, total, scorePercent } = req.body;

    if (!userId || !lessonId) {
      return res.status(400).json({ error: 'Missing userId or lessonId!' });
    }

    // Support both: scorePercent (0-100) directly, or score/total to calculate
    let quizScore;
    if (scorePercent !== undefined) {
      quizScore = Math.round(scorePercent);
    } else if (total && total > 0) {
      quizScore = Math.round((score / total) * 100);
    } else {
      quizScore = score || 0;
    }
    const passed = quizScore >= 70;

    if (!passed) {
      return res.status(200).json({
        completed: false,
        passed: false,
        score: quizScore,
        message: 'You need at least 70% to pass. Review and try again! 💪'
      });
    }

    try {
      // Get lesson to know XP reward
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { xpReward: true }
      });

      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      // Unified Gamification Logic
      // Earning XP for both the lesson reading (80) and the quiz completion (20)
      let xpEarned = XP_LOGIC.LESSON + XP_LOGIC.QUIZ;
      let gemsEarned = 10;

      // Bonus gems for high scores (XP remains strictly bound to the logic table)
      if (quizScore >= 90) {
        gemsEarned = 20;
      }
      if (quizScore === 100) {
        gemsEarned = 30;
      }

      // Record completion (upsert - update score if retrying)
      const existing = await prisma.userLesson.findUnique({
        where: { userId_lessonId: { userId: Number(userId), lessonId } }
      });

      if (existing) {
        // Update if new score is higher
        if (quizScore > existing.score) {
          await prisma.userLesson.update({
            where: { id: existing.id },
            data: { score: quizScore, xpEarned, attempts: existing.attempts + 1 }
          });
        } else {
          await prisma.userLesson.update({
            where: { id: existing.id },
            data: { attempts: existing.attempts + 1 }
          });
          // Don't give extra XP for lower score retries
          xpEarned = 0;
          gemsEarned = 0;
        }
      } else {
        await prisma.userLesson.create({
          data: {
            userId: Number(userId),
            lessonId,
            completed: true,
            score: quizScore,
            xpEarned
          }
        });
      }

      // Update user XP and gems
      if (xpEarned > 0 || gemsEarned > 0) {
        await prisma.user.update({
          where: { id: Number(userId) },
          data: {
            totalXP: { increment: xpEarned },
            gems: { increment: gemsEarned }
          }
        });
      }

      // Get updated totals
      const userLessons = await prisma.userLesson.findMany({
        where: { userId: Number(userId) }
      });
      const totalCompleted = userLessons.length;

      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { totalXP: true, gems: true }
      });

      // Check for badge milestones
      const newBadges = [];
      for (const milestone of BADGE_MILESTONES) {
        if (totalCompleted === milestone.count) {
          newBadges.push(milestone);
        }
      }

      // Check for level completion badge
      const lessonData = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { level: { include: { lessons: { select: { id: true } } } } }
      });

      let levelCompleted = false;
      if (lessonData?.level) {
        const levelLessonIds = lessonData.level.lessons.map(l => l.id);
        const completedInLevel = levelLessonIds.filter(id =>
          userLessons.some(ul => ul.lessonId === id)
        ).length;
        levelCompleted = completedInLevel === levelLessonIds.length;

        if (levelCompleted) {
          newBadges.push({
            id: `LEVEL_${lessonData.level.number}_COMPLETE`,
            name: `Level ${lessonData.level.number} Champion 🏆`,
            desc: `Completed all lessons in "${lessonData.level.title}"!`
          });
        }
      }

      res.status(200).json({
        completed: true,
        passed: true,
        score: quizScore,
        xpEarned,
        gemsEarned,
        totalXP: user?.totalXP || 0,
        totalGems: user?.gems || 100,
        totalCompleted,
        newBadges,
        levelCompleted,
        message: quizScore === 100
          ? 'PERFECT SCORE! You are a market genius! 🌟'
          : quizScore >= 90
            ? 'Outstanding! Bonus XP earned! 🔥'
            : 'Great job! You passed! 🎉'
      });
    } catch (error) {
      console.error('❌ Failed to complete lesson:', error);
      res.status(500).json({ error: 'Failed to complete lesson' });
    }
  });

  // ─── 5. Get user learning progress ──────────────────────────────
  router.get('/progress/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { totalXP: true, gems: true, streak: true }
      });

      const userLessons = await prisma.userLesson.findMany({
        where: { userId: Number(userId) }
      });

      const totalLessons = await prisma.lesson.count();
      const completedCount = userLessons.length;
      const totalXPEarned = userLessons.reduce((sum, ul) => sum + ul.xpEarned, 0);
      const averageScore = completedCount > 0
        ? Math.round(userLessons.reduce((sum, ul) => sum + ul.score, 0) / completedCount)
        : 0;

      // Determine earned badges
      const earnedBadges = BADGE_MILESTONES.filter(m => completedCount >= m.count);

      res.status(200).json({
        totalXP: user?.totalXP || 0,
        gems: user?.gems || 100,
        streak: user?.streak || 1,
        completedCount,
        totalLessons,
        progressPercent: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
        averageScore,
        earnedBadges
      });
    } catch (error) {
      console.error(`❌ Failed to get progress for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to get progress' });
    }
  });

  // ─── 6. Get today's daily mission status ────────────────────────
  router.get('/daily-missions/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      // Find all UserLesson records completed today
      const todayLessons = await prisma.userLesson.findMany({
        where: {
          userId: Number(userId),
          timestamp: { gte: todayStart, lte: todayEnd }
        }
      });

      const lessonDoneToday  = todayLessons.length >= 1;
      // "Solve 5 Questions" = completed 5 or more quizzes today (each lesson = 1 quiz)
      const quizDoneToday    = todayLessons.length >= 5;
      // "Market Challenge" = user completed any lesson with score >= 80 today
      const challengeToday   = todayLessons.some(ul => ul.score >= 80);

      return res.status(200).json({
        success: true,
        missions: [
          { id: 1, text: "Complete Today's Lesson", xp: '+80 XP',  done: lessonDoneToday  },
          { id: 2, text: 'Solve 5 Questions',       xp: '+60 XP',  done: quizDoneToday    },
          { id: 3, text: "Finish Today's Market Challenge", xp: '+60 XP', done: challengeToday },
        ],
        completedCount: [lessonDoneToday, quizDoneToday, challengeToday].filter(Boolean).length
      });
    } catch (err) {
      console.error('daily-missions error:', err);
      res.status(500).json({ error: 'Failed to load daily missions' });
    }
  });

  // ─── Helper: Check if a level is unlocked ───────────────────────
  function isLevelUnlocked(levels, levelNumber, completedIds) {
    const prevLevel = levels.find(l => l.number === levelNumber - 1);
    if (!prevLevel) return true;
    const prevLessons = prevLevel.lessons || [];
    if (prevLessons.length === 0) return true;
    return prevLessons.every(lesson => completedIds.has(lesson.id));
  }

  return router;
}
