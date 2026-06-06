import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {PrismaService} from '../../prisma/prisma.service';
import {RegisterMemberDto} from './dto/register-member.dto';
import {Express} from 'express';
import * as multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import {ApproveMemberDto, ApproveMemberRequestDto} from './dto/approve-member-request.dto';
import {RejectMemberRequestDto} from './dto/reject-member-request.dto';

type UploadFilesType = {
  profileImage?: Express.Multer.File[];
  nidFront?: Express.Multer.File[];
  nidBack?: Express.Multer.File[];
  signature?: Express.Multer.File[];
};
@Injectable()
export class MemberRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  // ====================== REGISTER WITH IMAGES (REQUIRED) ======================
  // Note: For registration, all fields and images are required. For draft saving, all fields and images are optional.
  // This allows users to save incomplete drafts without needing to upload files immediately.
  // The service layer will handle the logic to differentiate between a full registration and a draft, and validate accordingly.
  // The API documentation will reflect the required fields for registration and optional fields for draft saving.
  async registerWithImages(
    dto: RegisterMemberDto,
    files: UploadFilesType,
    userId: number,
    somiteeId: number,
  ) {
    const requiredFiles = [] as const;

    const optionalFiles = ['profileImage', 'nidFront', 'nidBack', 'signature'] as const;

    try {
      // =====================================================
      // 1. VALIDATE & MAP FILES
      // =====================================================
      const fileMap: Partial<Record<string, Express.Multer.File>> = {};

      for (const field of optionalFiles) {
        const file = files?.[field]?.[0] as Express.Multer.File | undefined;

        if (file) {
          fileMap[field] = file;
        }
      }

      // =====================================================
      // 2. CHECK DUPLICATES (BEFORE DB INSERT)
      // =====================================================

      if (dto.nid) {
        const existingNid = await this.prisma.memberRequest.findUnique({
          where: {
            nid: dto.nid,
          },
        });

        if (existingNid) {
          throw new BadRequestException('NID already exists');
        }
      }

      const existingMemberId = await this.prisma.memberRequest.findUnique({
        where: {memberRegNumber: dto.memberRegNumber},
      });

      if (existingMemberId) {
        throw new BadRequestException('This member ID already exists');
      }

      const existingMobile = await this.prisma.memberRequest.findFirst({
        where: {mobile: dto.mobile},
      });

      if (existingMobile) {
        throw new BadRequestException('Mobile already exists');
      }

      // =====================================================
      // 3. TRANSACTION START
      // =====================================================
      return await this.prisma.$transaction(async (tx) => {
        // 3.1 Create DB record
        const registrationFee =
          dto.registrationFee != null ? dto.registrationFee : (dto.monthlyFee ?? 0);

        const request = await tx.memberRequest.create({
          data: {
            ...dto,
            dob: new Date(dto.dob),
            somiteeId,
            createdById: userId,
            registrationFee,
            monthlyFee: dto.monthlyFee ?? 0,
          },
        });

        // =====================================================
        // 3.2 Create upload directory
        // =====================================================
        const uploadDir = path.join(process.cwd(), 'uploads', 'members', request.id.toString());

        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, {recursive: true});
        }

        const uploadedFiles: Record<string, string> = {};

        for (const field of optionalFiles) {
          const file = fileMap[field];

          if (!file) continue; // ✅ SKIP if not uploaded

          if (!file.buffer) {
            throw new BadRequestException(`${field} buffer missing`);
          }

          const ext = file.mimetype?.split('/')[1] || 'jpg';

          const fileName = `${field}-${Date.now()}.${ext}`;
          const filePath = path.join(uploadDir, fileName);

          fs.writeFileSync(filePath, file.buffer);

          uploadedFiles[`${field}Url`] = `/uploads/members/${request.id}/${fileName}`;
        }

        // =====================================================
        // 3.4 UPDATE DB WITH FILE PATHS
        // =====================================================
        await tx.memberRequest.update({
          where: {id: request.id},
          data: uploadedFiles,
        });

        return {
          success: true,
          message: 'Registration + images uploaded successfully',
          data: {
            id: request.id,
            ...uploadedFiles,
          },
        };
      });
    } catch (error) {
      console.error('registerWithImages error:', error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Registration failed');
    }
  }

  // ====================== SAVE DRAFT WITH IMAGES (OPTIONAL) ======================
  // Note: This endpoint allows saving a draft of the member registration. All fields and images are optional, so users can save incomplete drafts.
  // The service layer will handle the logic to differentiate between a full registration and a draft, and validate accordingly.
  // The API documentation will reflect the required fields for registration and optional fields for draft saving.
  // The same DTO and file upload structure is used for simplicity, but the service will not enforce required fields for drafts.
  async saveDraftWithImages(
    dto: RegisterMemberDto,
    files: UploadFilesType,
    userId: number,
    somiteeId: number,
  ) {
    const fileFields = ['profileImage', 'nidFront', 'nidBack', 'signature'] as const;

    try {
      console.log('saveDraftWithImages called');

      // =====================================================
      // 1. MAP FILES (OPTIONAL in draft)
      // =====================================================
      const fileMap: Partial<Record<(typeof fileFields)[number], Express.Multer.File>> = {};

      for (const field of fileFields) {
        const file = files[field]?.[0];

        if (file) {
          fileMap[field] = file;
        }
      }

      // =====================================================
      // 2. CHECK DUPLICATES (BEFORE DB INSERT)
      // =====================================================

      const existingRequest = await this.prisma.memberRequest.findUnique({
        where: {nid: dto.nid},
      });

      if (existingRequest) {
        throw new BadRequestException('NID already exists');
      }

      const existingMemberRegNumber = await this.prisma.memberRequest.findUnique({
        where: {memberRegNumber: dto.memberRegNumber},
      });

      if (existingMemberRegNumber) {
        throw new BadRequestException('This member registration number already exists');
      }

      const existingMobile = await this.prisma.memberRequest.findFirst({
        where: {mobile: dto.mobile},
      });

      if (existingMobile) {
        throw new BadRequestException('Mobile already exists');
      }

      // =====================================================
      // 3. TRANSACTION
      // =====================================================
      return await this.prisma.$transaction(async (tx) => {
        // 2.1 Create draft record
        const draft = await tx.memberRequest.create({
          data: {
            ...dto,
            dob: new Date(dto.dob),
            somiteeId,
            createdById: userId,
            status: 'draft', // ✅ important
          },
        });

        // =====================================================
        // 2.2 Create upload dir
        // =====================================================
        const uploadDir = path.join(process.cwd(), 'uploads', 'members', draft.id.toString());

        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, {recursive: true});
        }

        const uploadedFiles: Record<string, string> = {};

        // =====================================================
        // 2.3 SAVE FILES (ONLY IF PROVIDED)
        // =====================================================
        for (const field of fileFields) {
          const file = fileMap[field];

          if (!file) continue; // ✅ optional in draft

          if (!file.buffer) {
            throw new BadRequestException(`${field} buffer missing`);
          }

          const ext = file.mimetype.split('/')[1];
          const fileName = `${field}-${Date.now()}.${ext}`;
          const filePath = path.join(uploadDir, fileName);

          fs.writeFileSync(filePath, file.buffer);

          uploadedFiles[`${field}Url`] = `/uploads/members/${draft.id}/${fileName}`;
        }

        // =====================================================
        // 2.4 UPDATE ONLY IF FILES EXIST
        // =====================================================
        if (Object.keys(uploadedFiles).length > 0) {
          await tx.memberRequest.update({
            where: {id: draft.id},
            data: uploadedFiles,
          });
        }

        return {
          success: true,
          message: 'Draft saved successfully',
          data: {
            id: draft.id,
            status: 'DRAFT',
            ...uploadedFiles,
          },
        };
      });
    } catch (error) {
      console.error('saveDraftWithImages error:', error);

      throw new InternalServerErrorException('Draft save failed');
    }
  }

  // ====================== LIST MEMBER REQUESTS ======================
  // Note: This lists member requests, not approved members. Approved members would be a different endpoint.
  // Query params: page, limit, search
  // Example: GET /members?page=1&limit=10&search=karim
  // Note: search can match nameBn, nameEn, mobile, nid, nomineeName, etc. (handled in service)
  // Response includes pagination metadata: total items, total pages, current page, items per page
  async listMembers(somiteeId: number | string, page = 1, limit = 10, search?: string) {
    try {
      const numericSomiteeId = Number(somiteeId);
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.max(Number(limit) || 10, 1);

      if (isNaN(numericSomiteeId)) {
        throw new BadRequestException('Invalid somiteeId');
      }

      const where: any = {
        somiteeId: numericSomiteeId,
      };

      // =========================
      // SEARCH FIXED PROPERLY
      // =========================
      if (search?.trim()) {
        const clean = search.trim();
        const maybeNumber = Number(clean);

        where.OR = [
          {nameBn: {contains: clean}},
          {nameEn: {contains: clean}},
          {mobile: {contains: clean}},
          {nid: {contains: clean}},
          ...(isNaN(maybeNumber) ? [] : [{memberId: maybeNumber}]),
        ];
      }

      const [data, total] = await Promise.all([
        this.prisma.memberRequest.findMany({
          where,
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
          orderBy: {id: 'desc'},
        }),

        this.prisma.memberRequest.count({where}),
      ]);
      console.log();

      return {
        success: true,
        data,
        meta: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit),
        },
      };
    } catch (error) {
      console.error('member-requests.list error:', {
        message: error instanceof Error ? error.message : error,
      });

      throw new InternalServerErrorException('Failed to list members');
    }
  }

  // ====================== APPROVE MEMBER REQUEST ======================
  // Note: This endpoint approves a member request. The service will handle moving the request to the members table and any related logic.
  // The request body can include an optional note and actionType for audit purposes. The service will also record who approved the request and when.
  // Example: PATCH /members/requests/123/approve with body { "note": "Verified all documents, approved", "actionType": "manual approval" }
  async approveOld(id: number, userId: number, somiteeId: number) {
    const requestId = Number(id);

    if (isNaN(requestId)) {
      throw new BadRequestException('Invalid request id');
    }

    return await this.prisma.$transaction(async (tx) => {
      // =========================
      // 1. FIND REQUEST
      // =========================
      const request = await tx.memberRequest.findFirst({
        where: {
          id: requestId,
          somiteeId,
        },
      });

      if (!request) {
        throw new NotFoundException('Member request not found');
      }

      if (request.status === 'approved') {
        throw new BadRequestException('Already approved');
      }

      // =========================
      // 3. CREATE MEMBER
      // =========================
      const member = await tx.member.create({
        data: {
          name: request.nameEn || request.nameBn,
          shopName: request.shopName,
          phone: request.mobile,
          monthlyFee: request.monthlyFee ?? 0,
          billingCycle: request.billingCycle,
          somiteeId: request.somiteeId,
          createdById: userId,

          address: [request.village, request.union, request.upazila, request.district]
            .filter(Boolean)
            .join(', '),
        },
      });

      // =========================
      // 4. UPDATE REQUEST
      // =========================
      await tx.memberRequest.update({
        where: {id: requestId},
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: userId,
          memberId: member.id,
        },
      });

      return {
        success: true,
        requestId,
        memberId: member.id,
        status: 'approved',
        approvedAt: new Date(),
      };
    });
  }

  async approve(id: number, userId: number, somiteeId: number, body: ApproveMemberDto) {
    try {
      const requestId = Number(id);

      if (isNaN(requestId)) {
        throw new BadRequestException('Invalid request id');
      }

      return await this.prisma.$transaction(async (tx) => {
        try {
          // =========================
          // 1. FIND REQUEST
          // =========================
          const request = await tx.memberRequest.findFirst({
            where: {
              id: BigInt(requestId),
              somiteeId: BigInt(somiteeId),
            },
          });

          if (!request) {
            throw new NotFoundException('Member request not found');
          }

          if (request.status === 'approved') {
            throw new BadRequestException('Already approved');
          }

          const now = new Date();

          // =========================
          // 2. CREATE MEMBER
          // =========================
          const member = await tx.member.create({
            data: {
              name: request.nameEn || request.nameBn,
              shopName: request.shopName,
              phone: request.mobile,

              monthlyFee: body?.monthlyFee ?? request.monthlyFee ?? 0,
              billingCycle: body?.billingCycle ?? request.billingCycle,

              somiteeId: request.somiteeId,
              createdById: BigInt(userId),

              address: [request.village, request.union, request.upazila, request.district]
                .filter(Boolean)
                .join(', '),
            },
          });

          console.log('stats updated');

          // =========================
          // 7. REQUEST UPDATE
          // =========================
          await tx.memberRequest.update({
            where: {
              id: BigInt(requestId),
            },
            data: {
              status: 'approved',
              approvedAt: now,
              approvedBy: BigInt(userId),
              memberId: member.id,
            },
          });

          console.log('request updated');

          return {
            success: true,
            memberId: member.id.toString(),
          };
        } catch (error) {
          console.error('Transaction error:', error);

          throw error;
        }
      });
    } catch (error) {
      console.error('approve() error:', error);

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to approve member');
    }
  }

  // ====================== REJECT MEMBER REQUEST ======================
  // Note: This endpoint rejects a member request. The service will update the request status to 'rejected' and record who rejected it and when, along with an optional rejection note.
  // Example: PATCH /members/requests/123/reject with body { "rejectionNote": "Documents are invalid / mismatch NID" }

  async reject(id: number, userId: number, somiteeId: number, dto: RejectMemberRequestDto) {
    try {
      const requestId = Number(id);

      if (isNaN(requestId)) {
        throw new BadRequestException('Invalid request id');
      }

      return await this.prisma.$transaction(async (tx) => {
        // ======================
        // 1. FIND REQUEST
        // ======================
        const request = await tx.memberRequest.findFirst({
          where: {
            id: requestId,
            somiteeId,
          },
        });

        if (!request) {
          throw new NotFoundException('Member request not found');
        }

        // ======================
        // 2. STATUS CHECK (OPTIONAL BUT IMPORTANT)
        // ======================
        if (request.status === 'approved') {
          throw new BadRequestException('Already approved request cannot be rejected');
        }

        // ======================
        // 3. UPDATE REQUEST
        // ======================
        const updated = await tx.memberRequest.update({
          where: {id: requestId},
          data: {
            status: 'rejected',
            rejectedAt: new Date(),
            updatedById: userId,
            rejectionNote: dto.rejectionNote ?? null,
          },
        });

        return {
          success: true,
          id: updated.id,
          status: updated.status,
          rejectedAt: updated.rejectedAt,
          rejectionNote: updated.rejectionNote,
        };
      });
    } catch (error) {
      console.error('member-requests.service.reject error:', {
        message: error instanceof Error ? error.message : error,
        id,
        somiteeId,
        dto,
      });

      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw error;

      throw new InternalServerErrorException('Failed to reject');
    }
  }

  //  ====================== DELETE MEMBER REQUEST ======================
  // Note: This endpoint deletes a member request. This is a hard delete, so use with caution. The service will handle the deletion logic and any related cleanup.
  // Example: DELETE /members/requests/123

  async remove(id: number | string, somiteeId: number) {
    try {
      const requestId = Number(id);
      const request = await this.prisma.memberRequest.findFirst({
        where: {id: requestId, somiteeId},
      });
      if (!request) {
        throw new NotFoundException('Member request not found');
      }

      await this.prisma.memberRequest.delete({where: {id: requestId}});
      return {id: requestId, deleted: true};
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('member-requests.service.remove error:', {
          message: error.message,
          stack: error.stack,
          id,
          somiteeId,
        });
      } else {
        console.error('member-requests.service.remove unknown error:', error);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to remove');
    }
  }

  // ====================== GET MEMBER REQUEST STATUS COUNTS ======================
  // Note: This endpoint returns the count of member requests by status (pending, approved, rejected) for a given somitee. This is useful for dashboard statistics.
  // Example: GET /members/requests/status-counts?somiteeId=123

  async getRequestStatusCounts(somiteeId: number) {
    try {
      const numericSomiteeId = Number(somiteeId);

      if (isNaN(numericSomiteeId)) {
        throw new BadRequestException('Invalid somiteeId');
      }

      const [pending, approved, rejected] = await Promise.all([
        this.prisma.memberRequest.count({
          where: {
            somiteeId: numericSomiteeId,
            status: 'pending',
          },
        }),
        this.prisma.memberRequest.count({
          where: {
            somiteeId: numericSomiteeId,
            status: 'approved',
          },
        }),
        this.prisma.memberRequest.count({
          where: {
            somiteeId: numericSomiteeId,
            status: 'rejected',
          },
        }),
      ]);

      return {
        success: true,
        data: {
          pending,
          approved,
          rejected,
          total: pending + approved + rejected,
        },
      };
    } catch (error: unknown) {
      console.error('memberRequest.count error:', {
        message: error instanceof Error ? error.message : error,
        somiteeId,
      });

      throw new InternalServerErrorException('Failed to get counts');
    }
  }

  // ====================== GET SINGLE MEMBER REQUEST BY ID ======================
  // Note: This endpoint retrieves the details of a single member request by its ID. The service will handle fetching the request and ensuring it belongs to the correct somitee.
  // Example: GET /members/requests/123
  async getRequestById(id: number, somiteeId: number) {
    try {
      const requestId = Number(id);

      if (isNaN(requestId)) {
        throw new BadRequestException('Invalid request id');
      }

      const request = await this.prisma.memberRequest.findFirst({
        where: {
          id: requestId,
          somiteeId: Number(somiteeId),
        },
      });

      if (!request) {
        throw new NotFoundException('Member request not found');
      }

      return {
        success: true,
        data: request,
      };
    } catch (error: unknown) {
      console.error('memberRequest.getById error:', {
        message: error instanceof Error ? error.message : error,
        id,
        somiteeId,
      });

      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw error;

      throw new InternalServerErrorException('Failed to fetch request');
    }
  }
}
