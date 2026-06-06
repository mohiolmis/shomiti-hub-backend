import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {FileFieldsInterceptor, FilesInterceptor} from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {JwtAuthGuard} from '../../common/guards/jwt-auth.guard';
import {CurrentUser} from '../../common/decorators/user.decorator';
import {MemberRequestsService} from './member-requests.service';
import {RegisterMemberDto} from './dto/register-member.dto';
import {Express} from 'express';
import * as multer from 'multer';
import {memoryStorage} from 'multer';
import {ListMemberQueryDto} from './dto/list-member-query.dto';
import {ApproveMemberDto, ApproveMemberRequestDto} from './dto/approve-member-request.dto';
import {RejectMemberRequestDto} from './dto/reject-member-request.dto';

@ApiTags('Member Requests')
@ApiBearerAuth('Authorization')
@Controller('memberRequests')
export class MemberRequestsController {
  constructor(private readonly service: MemberRequestsService) {}

  // ====================== REGISTER WITH IMAGES (REQUIRED) ======================
  // Note: For registration, all fields and images are required. For draft saving, all fields and images are optional.
  // This allows users to save incomplete drafts without needing to upload files immediately.
  //  The service layer will handle the logic to differentiate between a full registration and a draft, and validate accordingly.
  //  The API documentation will reflect the required fields for registration and optional fields for draft saving.

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        {name: 'profileImage', maxCount: 1},
        {name: 'nidFront', maxCount: 1},
        {name: 'nidBack', maxCount: 1},
        {name: 'signature', maxCount: 1},
      ],
      {
        storage: multer.memoryStorage(), // IMPORTANT
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  async register(
    @Body() dto: RegisterMemberDto,

    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      nidFront?: Express.Multer.File[];
      nidBack?: Express.Multer.File[];
      signature?: Express.Multer.File[];
    },

    @CurrentUser('id') userId: number,
    @CurrentUser('somiteeId') somiteeId: number,
  ) {
    console.log('BODY=', dto);
    console.log('FILES=', files);

    return this.service.registerWithImages(dto, files, userId, somiteeId);
  }

  // ====================== SAVE DRAFT WITH IMAGES (OPTIONAL) ======================
  // Note: This endpoint allows saving a draft of the member registration. All fields and images are optional, so users can save incomplete drafts.
  // The service layer will handle the logic to differentiate between a full registration and a draft, and validate accordingly.
  // The API documentation will reflect the required fields for registration and optional fields for draft saving.
  // The same DTO and file upload structure is used for simplicity, but the service will not enforce required fields for drafts.
  @Post('register/draft')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        {name: 'profileImage', maxCount: 1},
        {name: 'nidFront', maxCount: 1},
        {name: 'nidBack', maxCount: 1},
        {name: 'signature', maxCount: 1},
      ],
      {
        storage: multer.memoryStorage(), // ✅ required for buffer
      },
    ),
  )
  @ApiOperation({summary: 'Save draft member registration with images (optional)'})
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'memberRegNumber',
        'nameBn',
        'nameEn',
        'fatherName',
        'motherName',
        'dob',
        'nationality',
        'religion',
        'bloodGroup',
        'mobile',
        'shopName',
        'nid',
        'nomineeName',
        'nomineeRelation',
        'nomineeNid',
        'monthlyFee',
        'profileImage',
        'nidFront',
        'nidBack',
        'signature',
      ], // ✅ IMPORTANT: nothing required in draft

      properties: {
        // ======================
        // PERSONAL INFO (OPTIONAL)
        // ======================
        memberRegNumber: {
          type: 'number',
          example: 10001,
          description: 'Unique member registration number (auto-generated, ignore in request)',
        },
        nameBn: {type: 'string', example: 'করিম মিয়া'},
        nameEn: {type: 'string', example: 'Karim Mia'},
        fatherName: {type: 'string', example: 'আব্দুল করিম'},
        motherName: {type: 'string', example: 'ফাতেমা বেগম'},
        dob: {type: 'string', format: 'date', example: '1990-05-15'},
        nationality: {type: 'string', example: 'বাংলাদেশী'},
        religion: {type: 'string', example: 'ইসলাম'},
        bloodGroup: {
          type: 'string',
          enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
          example: 'B+',
        },

        // ======================
        // CONTACT INFO
        // ======================
        mobile: {type: 'string', example: '01712345678'},
        shopName: {type: 'string', example: 'করিম ইলেকট্রনিক্স'},

        // ======================
        // IDENTIFICATION
        // ======================
        nid: {type: 'string', example: '1234567890123'},

        // ======================
        // NOMINEE
        // ======================
        nomineeName: {type: 'string', example: 'রহিমা বেগম'},
        nomineeRelation: {type: 'string', example: 'স্ত্রী'},
        nomineeNid: {type: 'string', example: '9876543210123'},

        // ======================
        // FINANCIAL
        // ======================
        monthlyFee: {
          type: 'number',
          example: 500,
          minimum: 0,
        },

        // ======================
        // FILES (OPTIONAL IN DRAFT)
        // ======================
        profileImage: {
          type: 'string',
          format: 'binary',
          description: 'Optional profile image',
        },
        nidFront: {
          type: 'string',
          format: 'binary',
          description: 'Optional NID front image',
        },
        nidBack: {
          type: 'string',
          format: 'binary',
          description: 'Optional NID back image',
        },
        signature: {
          type: 'string',
          format: 'binary',
          description: 'Optional signature image',
        },
      },
    },
  })
  async saveDraft(
    @Body() dto: RegisterMemberDto,
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      nidFront?: Express.Multer.File[];
      nidBack?: Express.Multer.File[];
      signature?: Express.Multer.File[];
    },
    @CurrentUser('id') userId: number,
    @CurrentUser('somiteeId') somiteeId: number,
  ) {
    return this.service.saveDraftWithImages(dto, files, userId, somiteeId);
  }

  // ====================== LIST MEMBER REQUESTS ======================
  // Note: This lists member requests, not approved members. Approved members would be a different endpoint.
  // Query params: page, limit, search
  // Example: GET /members?page=1&limit=10&search=karim
  // Note: search can match nameBn, nameEn, mobile, nid, nomineeName, etc. (handled in service)
  // Response includes pagination metadata: total items, total pages, current page, items per page
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'List member requests with pagination and optional search'})
  @ApiQuery({name: 'page', required: false, example: 1})
  @ApiQuery({name: 'limit', required: false, example: 10})
  @ApiQuery({name: 'search', required: false, example: 'karim'})
  async listMembers(
    @CurrentUser('somiteeId') somiteeId: number,
    @Query() query: ListMemberQueryDto,
  ) {
    const safePage = Number(query.page) || 1;
    const safeLimit = Number(query.limit) || 10;
    const cleanSearch = query.search?.trim() || undefined;

    return this.service.listMembers(somiteeId, safePage, safeLimit, cleanSearch);
  }

  // ====================== APPROVE MEMBER REQUEST ======================
  // Note: This endpoint approves a member request. The service will handle moving the request to the members table and any related logic.
  // The request body can include an optional note and actionType for audit purposes. The service will also record who approved the request and when.
  // Example: PATCH /members/requests/123/approve with body { "note": "Verified all documents, approved", "actionType": "manual approval" }

  @Patch('requests/:id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Approve member request'})
  async approve(
    @Param('id') id: string,
    @Body() body: ApproveMemberDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('somiteeId') somiteeId: number,
  ) {
    return this.service.approve(Number(id), userId, somiteeId, body);
  }

  // ====================== REJECT MEMBER REQUEST ======================
  // Note: This endpoint rejects a member request. The service will handle updating the request status and any related logic.
  // The request body can include an optional rejection note for audit purposes. The service will also record who rejected the request and when.
  // Example: PATCH /members/requests/123/reject with body { "rejectionNote": "Documents are invalid / mismatch NID" }

  @Patch('requests/:id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Reject member request'})
  async reject(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('somiteeId') somiteeId: number,
    @Body() dto: RejectMemberRequestDto,
  ) {
    return this.service.reject(Number(id), userId, somiteeId, dto);
  }

  // ====================== DELETE MEMBER REQUEST ======================
  // Note: This endpoint deletes a member request. This is a hard delete, so use with caution. The service will handle the deletion logic and any related cleanup.
  // Example: DELETE /members/requests/123

  @Delete('requests/:id')
  @ApiOperation({summary: 'Delete member request'})
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: number, @CurrentUser('somiteeId') somiteeId: number) {
    return this.service.remove(id, somiteeId);
  }

  // ====================== GET MEMBER REQUEST STATUS COUNTS ======================
  // Note: This endpoint returns the count of member requests by status (pending, approved, rejected) for a given somitee. This is useful for dashboard statistics.
  // Example: GET /members/requests/status-counts?somiteeId=123
  @Get('requests/status-count')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Get member request status counts'})
  async getCounts(@CurrentUser('somiteeId') somiteeId: number) {
    return this.service.getRequestStatusCounts(somiteeId);
  }

  // ====================== GET SINGLE MEMBER REQUEST BY ID ======================
  // Note: This endpoint retrieves the details of a single member request by its ID. The service will handle fetching the request and ensuring it belongs to the correct somitee.
  // Example: GET /members/requests/123
  @Get('requests/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Get single member request by ID'})
  async getOne(@Param('id') id: number, @CurrentUser('somiteeId') somiteeId: number) {
    return this.service.getRequestById(id, somiteeId);
  }
}
