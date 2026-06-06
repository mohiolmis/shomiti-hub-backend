import {Controller, Get, Post, Patch, Param, Body, Query, UseGuards} from '@nestjs/common';
import {ApprovalsService} from './approvals.service';

import {JwtAuthGuard} from '../../common/guards/jwt-auth.guard';
import {RolesGuard} from '../../common/guards/roles.guard';
import {CurrentUser} from '../../common/decorators/user.decorator';
import {ApiTags, ApiBearerAuth, ApiOperation} from '@nestjs/swagger';
import {GetApprovalsDto} from './dto/get-appovals.dto';
import {CreateApprovalDto} from './dto/create-approval.dto';
import {ApproveRejectDto} from './dto/approve-reject.dto';

@ApiTags('Approvals')
@ApiBearerAuth('Authorization')
@Controller('approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Get approvals list'})
  async getApprovals(@Query() query: GetApprovalsDto, @CurrentUser() user: any) {
    return await this.approvalsService.getApprovals(user.somiteeId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Get approval single data'})
  async getApproval(@Param('id') id: string, @CurrentUser() user: any) {
    return this.approvalsService.getApproval(Number(id), user.somiteeId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Get approval single data'})
  async createApproval(@Body() dto: CreateApprovalDto, @CurrentUser() user: any) {
    const approval = await this.approvalsService.createApproval(
      dto,
      user.id,
      user.name,
      user.somiteeId,
    );

    return {
      success: true,
      statusCode: 201,
      message: 'Submitted for approval',
      data: approval,
    };
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Approve or Reject Approval'})
  async approveApproval(
    @Param('id') id: number,
    @Body() dto: ApproveRejectDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.approvalsService.approveApproval(
      Number(id),
      dto,
      user.id,
      user.name,
      user.somiteeId,
    );

    return {
      success: true,
      statusCode: 200,
      message:
        dto.status === 'approved'
          ? 'Approval Approved Successfully'
          : 'Approval Rejected Successfully',
      data: result,
    };
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Reject approval'})
  async rejectApproval(
    @Param('id') id: number,
    @Body() dto: ApproveRejectDto,
    @CurrentUser() user: any,
  ) {
    const approval = await this.approvalsService.rejectApproval(
      id,
      dto,
      user.id,
      user.name,
      user.somiteeId,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Rejected',
      data: approval,
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({summary: 'Get approval stats'})
  async getApprovalStats(@CurrentUser() user: any) {
    const stats = await this.approvalsService.getApprovalStats(user.somiteeId);

    return {
      success: true,
      statusCode: 200,
      message: 'Stats retrieved',
      data: stats,
    };
  }
}
