import { prisma } from "@/lib/db";

export type NotificationCategory = "ROUTE" | "LEAVE" | "APPROVAL" | "SYSTEM" | "OPTIMIZATION";

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  category: NotificationCategory,
  actionUrl?: string
) {
  try {
    // 1. Get User's preferences
    let settings = await prisma.notificationSettings.findUnique({
      where: { userId }
    });

    // If no settings exist, default them to enabled.
    if (!settings) {
      settings = await prisma.notificationSettings.create({
        data: { userId }
      });
    }

    // 2. Check if category is enabled
    const isEnabled = (
      (category === "ROUTE" && settings.routeNotifications) ||
      (category === "LEAVE" && settings.leaveNotifications) ||
      (category === "APPROVAL" && settings.approvalNotifications) ||
      (category === "SYSTEM" && settings.systemNotifications) ||
      (category === "OPTIMIZATION" && settings.systemNotifications)
    );

    if (!isEnabled) {
      return null; // Silent abort
    }

    // 3. Create Notification
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        category,
        actionUrl,
      }
    });

    return notification;
  } catch (error) {
    console.error("Failed to create notification:", error);
    return null;
  }
}
