import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreatePersonDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  organization?: string;

  // El correo es opcional: sólo se valida el formato cuando se captura algo.
  @ValidateIf((object) => object.email !== undefined && object.email !== '')
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;
}

export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  organization?: string;

  @ValidateIf((object) => object.email !== undefined && object.email !== '')
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ImportPeopleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  content!: string;
}
