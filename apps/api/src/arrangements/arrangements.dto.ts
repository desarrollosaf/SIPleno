import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateArrangementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  layoutId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;
}

export class UpdateArrangementDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;
}

export class DuplicateArrangementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;
}

export class AssignPersonDto {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  personId!: string;
}
