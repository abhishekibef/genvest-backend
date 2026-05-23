import express from 'express';

export function getLearnRouter(prisma) {
  const router = express.Router();

  // 1. Get all lessons with user completion status
  router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const allLessons = await prisma.lesson.findMany();
      
      const userCompleted = await prisma.userLesson.findMany({
        where: { userId: Number(userId) }
      });

      const completedIds = userCompleted.map(ul => ul.lessonId);

      const lessonsWithStatus = allLessons.map(lesson => ({
        ...lesson,
        completed: completedIds.includes(lesson.id)
      }));

      // Calculate simple stats
      const totalCount = allLessons.length;
      const completedCount = completedIds.length;
      const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      res.status(200).json({
        lessons: lessonsWithStatus,
        completedCount,
        progressPercent
      });
    } catch (error) {
      console.error(`❌ Failed to retrieve lessons for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve lessons list' });
    }
  });

  // 2. Complete a lesson & earn gamified rewards
  router.post('/complete', async (req, res) => {
    const { userId, lessonId } = req.body;

    if (!userId || !lessonId) {
      return res.status(400).json({ error: 'Missing userId or lessonId!' });
    }

    try {
      // Record completion
      const userLesson = await prisma.userLesson.upsert({
        where: {
          userId_lessonId: {
            userId: Number(userId),
            lessonId: lessonId
          }
        },
        update: {}, // if already exists, do nothing
        create: {
          userId: Number(userId),
          lessonId: lessonId
        }
      });

      // Calculate total completed lessons to award badges
      const userCompleted = await prisma.userLesson.findMany({
        where: { userId: Number(userId) }
      });
      const completedCount = userCompleted.length;

      // Unlock dynamic badges!
      const newBadges = [];
      if (completedCount === 1) {
        newBadges.push({ id: 'SCHOLAR', name: 'Smart Start 🎓', desc: 'Read your first micro-lesson!' });
      } else if (completedCount === 3) {
        newBadges.push({ id: 'FINFLUENCER', name: 'Finfluencer 📣', desc: 'Read 3 micro-lessons and leveled up!' });
      } else if (completedCount === 5) {
        newBadges.push({ id: 'MARKET_WIZARD', name: 'Market Wizard 🧙‍♂️', desc: 'Completed all micro-lessons!' });
      }

      res.status(200).json({
        message: 'Lesson completed successfully! Smart choice 🧠',
        completed: true,
        newBadges,
        totalCompleted: completedCount
      });
    } catch (error) {
      console.error('❌ Failed to mark lesson completed:', error);
      res.status(500).json({ error: 'Failed to complete lesson' });
    }
  });

  return router;
}
