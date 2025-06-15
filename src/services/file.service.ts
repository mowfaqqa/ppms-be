import { PrismaClient } from '@prisma/client';
import { ApiError, HttpStatus } from '../utils/error.utils';
import cloudinary from '../config/cloudinary';
import { generateUniqueId } from '../utils/common.utils';
import fs from 'fs';

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

    // Upload file to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(file?.path, {
      resource_type: 'auto', // Automatically detect file type
      folder: 'project-management',
    });

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
    const savedFile = await prisma.file.create({
      data: {
        name: file?.originalname,
        url: uploadResult.secure_url,
        type: file?.mimetype,
        size: file?.size,
        projectId: data.projectId || null,
        taskId: data.taskId || null,
        versionGroup,
        versionNumber,
        createdById: userId,
      },
    });

    // Delete local file
    fs.unlinkSync(file?.path);

    return savedFile;
  } catch (error) {
    // Clean up local file if it exists
    if (file?.path && fs.existsSync(file?.path)) {
      fs.unlinkSync(file?.path);
    }

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

  return latestFiles;
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

  return files;
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

  // Extract public ID from URL
  const publicId = file.url.split('/').slice(-1)[0].split('.')[0];

  try {
    // Delete file from Cloudinary
    await cloudinary.uploader.destroy(`project-management/${publicId}`);
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    // Continue even if Cloudinary delete fails
  }

  // Delete file from database
  await prisma.file.delete({
    where: { id },
  });
};