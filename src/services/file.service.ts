import { PrismaClient } from '@prisma/client';
import { ApiError, HttpStatus } from '../utils/error.utils';
import {
  buildObjectKey,
  uploadObject,
  deleteObject,
  resolveFileUrl,
} from '../config/r2';
import { generateUniqueId } from '../utils/common.utils';
import { notifyFileUploaded } from './notification.service';

const prisma = new PrismaClient();

// Upload file
export const uploadFile = async (
  file: any,
  data: {
    projectId?: string;
    taskId?: string;
  },
  userId: string
): Promise<any> => {
  try {
    // Validate project or task
    if (data.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: data.projectId },
      });

      if (!project) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'Project not found');
      }

      // Check if user is a member of the project with upload permission
      const projectMember = await prisma.projectMember.findFirst({
        where: {
          userId,
          projectId: data.projectId,
          permissions: {
            some: {
              name: 'file.upload',
            },
          },
        },
      });

      if (!projectMember) {
        throw new ApiError(
          HttpStatus.FORBIDDEN,
          'You do not have permission to upload files to this project'
        );
      }
    } else if (data.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: data.taskId },
        include: {
          project: {
            include: {
              members: {
                where: {
                  userId,
                },
                include: {
                  permissions: true,
                },
              },
            },
          },
        },
      });

      if (!task) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'Task not found');
      }

      // Check if user is a member of the task's project with upload permission
      const projectMember = task.project.members[0];

      if (!projectMember || !projectMember.permissions.some(p => p.name === 'file.upload')) {
        throw new ApiError(
          HttpStatus.FORBIDDEN,
          'You do not have permission to upload files to this task'
        );
      }
    } else {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'Either projectId or taskId is required'
      );
    }

    // Upload the buffered file to R2. `url` below stores the object key, not a
    // URL — buckets are private, so links are generated on read via
    // resolveFileUrl().
    const objectKey = buildObjectKey(file?.originalname, 'project-management');
    await uploadObject(
      objectKey,
      file?.buffer,
      file?.mimetype,
      file?.originalname
    );

    // Find existing files in the same version group or create new group
    let versionGroup = generateUniqueId();
    let versionNumber = 1;

    if (file?.originalname) {
      const existingFile = await prisma.file.findFirst({
        where: {
          name: file?.originalname,
          OR: [
            { projectId: data.projectId || null },
            { taskId: data.taskId || null },
          ],
        },
        orderBy: {
          versionNumber: 'desc',
        },
      });

      if (existingFile) {
        versionGroup = existingFile.versionGroup;
        versionNumber = existingFile.versionNumber + 1;
      }
    }

    // Save file metadata to database
    let savedFile;
    try {
      savedFile = await prisma.file.create({
        data: {
          name: file?.originalname,
          url: objectKey,
          type: file?.mimetype,
          size: file?.size,
          projectId: data.projectId || null,
          taskId: data.taskId || null,
          versionGroup,
          versionNumber,
          createdById: userId,
        },
      });
    } catch (error) {
      // The object is stored but nothing references it. Remove it so a failed
      // insert cannot leave an orphan behind in the bucket.
      await deleteObject(objectKey).catch((cleanupError) =>
        console.error('R2 orphan cleanup failed:', cleanupError)
      );

      throw error;
    }

    // 🔔 Send notification to project managers
    try {
      let projectId = data.projectId;
      
      // If file uploaded to task, get project from task
      if (!projectId && data.taskId) {
        const task = await prisma.task.findUnique({
          where: { id: data.taskId },
          select: { projectId: true }
        });
        projectId = task?.projectId;
      }

      if (projectId) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            members: {
              where: { role: 'PROJECT_MANAGER' },
              select: { userId: true }
            }
          }
        });

        if (project && project.members.length > 0) {
          // Get uploader's name
          const uploader = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
          });

          // Notify only project managers (exclude the uploader)
          const pmIds = project.members
            .map(m => m.userId)
            .filter(id => id !== userId);

          if (pmIds.length > 0) {
            await notifyFileUploaded(
              pmIds,
              savedFile.id,
              savedFile.name,
              project.name,
              userId,
              uploader?.name || 'Someone'
            );
          }
        }
      }
    } catch (notificationError) {
      console.error('Failed to send file upload notification:', notificationError);
      // Don't fail the upload if notification fails
    }

    return savedFile;
  } catch (error) {
    throw error;
  }
};

// Get files for project or task
export const  getFiles = async (
  filters: {
    projectId?: string;
    taskId?: string;
  }
): Promise<any[]> => {
  const where: any = {};

  if (filters.projectId) {
    where.projectId = filters.projectId;
  } else if (filters.taskId) {
    where.taskId = filters.taskId;
  } else {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'Either projectId or taskId is required'
    );
  }

  const files = await prisma.file.findMany({
    where,
    orderBy: [
      {
        createdAt: 'desc',
      },
    ],
  });

  // Group files by version group
  const filesByGroup: Record<string, any[]> = {};

  files.forEach((file) => {
    if (!filesByGroup[file.versionGroup]) {
      filesByGroup[file.versionGroup] = [];
    }
    filesByGroup[file.versionGroup].push(file);
  });

  // Get latest version of each file group
  const latestFiles = Object.values(filesByGroup).map((groupFiles) => {
    // Sort by version number (descending)
    groupFiles.sort((a, b) => b.versionNumber - a.versionNumber);
    // Return the latest file (first in the sorted array)
    return {
      ...groupFiles[0],
      hasVersions: groupFiles.length > 1,
      versionCount: groupFiles.length,
    };
  });

  // Sort by last modified (createdAt of latest version)
  latestFiles.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // `url` is an R2 object key; attach a browser-usable link for each file.
  return Promise.all(
    latestFiles.map(async (file) => ({
      ...file,
      downloadUrl: await resolveFileUrl(file.url, file.name),
    }))
  );
};

// Get file versions
export const getFileVersions = async (
  versionGroup: string
): Promise<any[]> => {
  const files = await prisma.file.findMany({
    where: { versionGroup },
    orderBy: {
      versionNumber: 'desc',
    },
  });

  if (files.length === 0) {
    throw new ApiError(HttpStatus.NOT_FOUND, 'File versions not found');
  }

  return Promise.all(
    files.map(async (file) => ({
      ...file,
      downloadUrl: await resolveFileUrl(file.url, file.name),
    }))
  );
};

// Delete file
export const deleteFile = async (
  id: string,
  userId: string
): Promise<void> => {
  // Check if file exists
  const file = await prisma.file.findUnique({
    where: { id },
    include: {
      project: {
        include: {
          members: {
            where: {
              userId,
            },
            include: {
              permissions: true,
            },
          },
        },
      },
    },
  });

  if (!file) {
    throw new ApiError(HttpStatus.NOT_FOUND, 'File not found');
  }

  // Check permissions
  if (file.project) {
    const projectMember = file.project.members[0];

    if (!projectMember || !projectMember.permissions.some(p => p.name === 'file.delete')) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'You do not have permission to delete files from this project'
      );
    }
  } else if (file.taskId) {
    // Get task and check project membership
    const task = await prisma.task.findUnique({
      where: { id: file.taskId },
      include: {
        project: {
          include: {
            members: {
              where: {
                userId,
              },
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Task not found');
    }

    const projectMember = task.project.members[0];

    if (!projectMember || !projectMember.permissions.some(p => p.name === 'file.delete')) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'You do not have permission to delete files from this task'
      );
    }
  }

  try {
    // `url` holds the R2 object key.
    await deleteObject(file.url);
  } catch (error) {
    console.error('Error deleting file from R2:', error);
    // Continue even if the object delete fails, so a missing object can never
    // wedge the database row permanently.
  }

  // Delete file from database
  await prisma.file.delete({
    where: { id },
  });
};