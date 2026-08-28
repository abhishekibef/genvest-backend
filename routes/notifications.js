import express from "express";

export function getNotificationsRouter(prisma) {
  const router = express.Router();

  // GET /api/notifications/unread-count/:userId — for the bell badge
  // IMPORTANT: must be registered BEFORE the wildcard /:userId route
  router.get("/unread-count/:userId", async (req, res) => {
    const { userId } = req.params;
    const id = Number(userId);
    if (isNaN(id) || !id) return res.json({ count: 0 });

    try {
      const count = await prisma.notification.count({
        where: { userId: id, read: false },
      });
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // PATCH /api/notifications/mark-read/:userId — mark all as read
  router.patch("/mark-read/:userId", async (req, res) => {
    const { userId } = req.params;
    const id = Number(userId);
    if (isNaN(id) || !id) return res.json({ success: true });

    try {
      await prisma.notification.updateMany({
        where: { userId: id, read: false },
        data: { read: true },
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // GET /api/notifications/:userId — fetch last 50 notifications
  // IMPORTANT: wildcard route must come LAST
  router.get("/:userId", async (req, res) => {
    const { userId } = req.params;
    const id = Number(userId);
    if (isNaN(id) || !id) return res.json({ notifications: [] });

    try {
      const notifications = await prisma.notification.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      res.json({ notifications });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  return router;
}
