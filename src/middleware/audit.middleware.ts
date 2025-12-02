import { Request, Response, NextFunction } from "express";
import { createAuditLog } from "../services/settings.service";
import { AuditAction, EntityType } from "@prisma/client";

/**
 * Middleware to automatically create audit logs for specific routes
 *
 * Usage:
 * router.post('/projects', authenticate, auditLog({
 *   action: AuditAction.CREATED,
 *   entityType: EntityType.PROJECT,
 *   getEntityId: (req, res) => res.locals.createdProjectId,
 *   getEntityName: (req, res) => res.locals.createdProjectName,
 * }), asyncHandler(handler));
 */

interface AuditLogOptions {
  action: AuditAction;
  entityType: EntityType;
  getEntityId?: (req: Request, res: Response) => string;
  getEntityName?: (req: Request, res: Response) => string | undefined;
  getDescription?: (req: Request, res: Response) => string;
  getChanges?: (req: Request, res: Response) => any;
}

export const auditLog = (options: AuditLogOptions) => {
  return async (req: any, res: Response, next: NextFunction) => {
    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      // Only log successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Run audit log creation asynchronously (don't block response)
        setImmediate(async () => {
          try {
            const entityId = options.getEntityId
              ? options.getEntityId(req, res)
              : body?.data?.id || req.params.id;

            const entityName = options.getEntityName
              ? options.getEntityName(req, res)
              : body?.data?.name || body?.data?.title || undefined;

            const description =
              options.getDescription?.(req, res) ||
              generateDescription(
                options.action,
                options.entityType,
                entityName
              );

            const changes = options.getChanges?.(req, res);

            const ipAddress = req.ip || req.connection?.remoteAddress;
            const userAgent = req.get("user-agent");

            await createAuditLog({
              userId: req.user?.userId,
              action: options.action,
              entityType: options.entityType,
              entityId,
              entityName,
              description,
              changes,
              ipAddress,
              userAgent,
            });
          } catch (error) {
            console.error("Failed to create audit log:", error);
            // Don't fail the request if audit logging fails
          }
        });
      }

      // Call original json method
      return originalJson(body);
    };

    next();
  };
};

/**
 * Generate human-readable description from action and entity
 */
function generateDescription(
  action: AuditAction,
  entityType: EntityType,
  entityName?: string
): string {
  const entityTypeLabel = entityType.toLowerCase().replace(/_/g, " ");

  switch (action) {
    case AuditAction.CREATED:
      return entityName
        ? `Created ${entityTypeLabel} "${entityName}"`
        : `Created ${entityTypeLabel}`;

    case AuditAction.UPDATED:
      return entityName
        ? `Updated ${entityTypeLabel} "${entityName}"`
        : `Updated ${entityTypeLabel}`;

    case AuditAction.DELETED:
      return entityName
        ? `Deleted ${entityTypeLabel} "${entityName}"`
        : `Deleted ${entityTypeLabel}`;

    case AuditAction.ASSIGNED:
      return entityName
        ? `Assigned to ${entityTypeLabel} "${entityName}"`
        : `Assigned to ${entityTypeLabel}`;

    case AuditAction.UNASSIGNED:
      return entityName
        ? `Unassigned from ${entityTypeLabel} "${entityName}"`
        : `Unassigned from ${entityTypeLabel}`;

    case AuditAction.STATUS_CHANGED:
      return entityName
        ? `Changed status of ${entityTypeLabel} "${entityName}"`
        : `Changed ${entityTypeLabel} status`;

    case AuditAction.UPLOADED:
      return entityName
        ? `Uploaded ${entityTypeLabel} "${entityName}"`
        : `Uploaded ${entityTypeLabel}`;

    case AuditAction.STARTED:
      return entityName
        ? `Started ${entityTypeLabel} "${entityName}"`
        : `Started ${entityTypeLabel}`;

    case AuditAction.COMPLETED:
      return entityName
        ? `Completed ${entityTypeLabel} "${entityName}"`
        : `Completed ${entityTypeLabel}`;

    default:
      return `${action} ${entityTypeLabel}${
        entityName ? ` "${entityName}"` : ""
      }`;
  }
}

/**
 * Helper to create audit log for changes
 * Compares old and new values and creates structured changes object
 */
export function trackChanges(oldData: any, newData: any): any {
  const changes: any = {
    old: {},
    new: {},
  };

  // Get all unique keys from both objects
  const allKeys = new Set([
    ...Object.keys(oldData || {}),
    ...Object.keys(newData || {}),
  ]);

  allKeys.forEach((key) => {
    // Skip certain fields that shouldn't be tracked
    const skipFields = [
      "id",
      "createdAt",
      "updatedAt",
      "password",
      "token",
      "__v",
    ];

    if (skipFields.includes(key)) {
      return;
    }

    const oldValue = oldData?.[key];
    const newValue = newData?.[key];

    // Only track actual changes
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      if (oldValue !== undefined) {
        changes.old[key] = oldValue;
      }
      if (newValue !== undefined) {
        changes.new[key] = newValue;
      }
    }
  });

  // Return null if no changes
  return Object.keys(changes.old).length > 0 ||
    Object.keys(changes.new).length > 0
    ? changes
    : null;
}

/**
 * Audit decorator for service functions (TypeScript decorator)
 *
 * Usage:
 * @Audit({
 *   action: AuditAction.CREATED,
 *   entityType: EntityType.PROJECT,
 * })
 * async createProject(data, userId) {
 *   // ... implementation
 * }
 *
 * Note: Requires experimentalDecorators in tsconfig.json
 */
export function Audit(options: {
  action: AuditAction;
  entityType: EntityType;
  getEntityId?: (result: any) => string;
  getEntityName?: (result: any) => string;
}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      // Extract userId from arguments (convention: last argument or in options)
      const userId =
        args.find((arg) => arg?.userId)?.userId ||
        args[args.length - 1]?.userId;

      if (userId) {
        try {
          const entityId = options.getEntityId?.(result) || result?.id;
          const entityName =
            options.getEntityName?.(result) || result?.name || result?.title;

          await createAuditLog({
            userId,
            action: options.action,
            entityType: options.entityType,
            entityId,
            entityName,
            description: generateDescription(
              options.action,
              options.entityType,
              entityName
            ),
          });
        } catch (error) {
          console.error("Audit decorator failed:", error);
        }
      }

      return result;
    };

    return descriptor;
  };
}


