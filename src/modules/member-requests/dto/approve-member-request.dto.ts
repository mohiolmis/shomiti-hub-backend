import {ApiPropertyOptional} from '@nestjs/swagger';
import {IsIn, IsNumber, IsOptional, IsString} from 'class-validator';

export class ApproveMemberRequestDto {
  @ApiPropertyOptional({
    example: 'Verified all documents, approved',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    example: 'manual approval',
  })
  @IsOptional()
  @IsString()
  actionType?: string;
}

export class ApproveMemberDto {
  @ApiPropertyOptional({
    example: 500,
    description: 'Monthly membership fee',
  })
  @IsOptional()
  @IsNumber()
  monthlyFee?: number;

  @ApiPropertyOptional({
    example: 'monthly',
    description: 'Billing cycle type (monthly or yearly)',
    enum: ['monthly', 'yearly'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['monthly', 'yearly'])
  billingCycle?: 'monthly' | 'yearly';
}
