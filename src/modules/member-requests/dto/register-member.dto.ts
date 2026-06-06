import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class RegisterMemberDto {
  @ApiProperty({example: 10001})
  @Type(() => Number)
  @IsNumber()
  memberRegNumber!: number;

  @ApiProperty({example: 'করিম উদ্দিন'})
  @IsString()
  @IsNotEmpty()
  nameBn!: string;

  @ApiProperty({example: 'Karim Uddin'})
  @IsString()
  @IsNotEmpty()
  nameEn!: string;

  @ApiProperty({example: 'আব্দুল হক'})
  @IsString()
  @IsNotEmpty()
  fatherName!: string;

  @ApiProperty({example: 'রহিমা বেগম'})
  @IsString()
  @IsNotEmpty()
  motherName!: string;

  @ApiProperty({
    example: '1990-05-15',
  })
  @IsDateString()
  dob!: string;

  @ApiProperty({example: 'Bangladeshi'})
  @IsString()
  nationality!: string;

  @ApiProperty({example: 'Islam'})
  @IsString()
  religion!: string;

  @ApiProperty({
    example: 'B+',
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  })
  @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
  bloodGroup!: string;

  @ApiProperty({
    example: '01712345678',
  })
  @Matches(/^(\+880|880|0)1[3-9]\d{8}$/)
  mobile!: string;

  @ApiProperty({
    example: 'Karim Electronics',
  })
  @IsString()
  shopName!: string;

  @ApiPropertyOptional({
    example: '1234567890123',
  })
  @IsOptional()
  @IsString()
  nid?: string;

  @ApiPropertyOptional({
    example: 'সালমা আক্তার',
  })
  @IsOptional()
  @IsString()
  nomineeName?: string;

  @ApiPropertyOptional({
    example: 'Wife',
  })
  @IsOptional()
  @IsString()
  nomineeRelation?: string;

  @ApiPropertyOptional({
    example: '9876543210123',
  })
  @IsOptional()
  @IsString()
  nomineeNid?: string;

  @ApiProperty({
    example: 500,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  registrationFee?: number;

  @ApiProperty({
    example: 500,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  monthlyFee?: number;

  // FILES

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
  })
  profileImage?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
  })
  nidFront?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
  })
  nidBack?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
  })
  signature?: any;

  @ApiPropertyOptional({
    example: 'North Para',
  })
  @IsOptional()
  @IsString()
  village?: string;

  @ApiPropertyOptional({
    example: '05',
  })
  @IsOptional()
  @IsString()
  wardNo?: string;

  @ApiPropertyOptional({
    example: 'Kaliganj Union',
  })
  @IsOptional()
  @IsString()
  union?: string;

  @ApiPropertyOptional({
    example: 'Kaliganj',
  })
  @IsOptional()
  @IsString()
  upazila?: string;

  @ApiPropertyOptional({
    example: 'Gazipur',
  })
  @IsOptional()
  @IsString()
  district?: string;
}
