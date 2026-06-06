import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {IsEnum, IsOptional, IsString} from 'class-validator';

export enum ApprovalAction {
  approved = 'approved',
  rejected = 'rejected',
}

export class ApproveRejectDto {
  @ApiProperty({
    enum: ApprovalAction,
    example: ApprovalAction.approved,
    description: 'Approval status',
  })
  @IsEnum(ApprovalAction)
  status: ApprovalAction = ApprovalAction.approved;

  @ApiPropertyOptional({
    example: 'Verified and approved by admin',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
